import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { supabase } from './supabase'

export type Picked = { uri: string; name: string; mime: string }
export type FileRef = { path: string; name: string; mime: string; kind: string }
export type XStone = Record<string, string | number | null>
export type Extraction = {
  document_type: string; supplier: string | null; doc_number: string | null; doc_date: string | null
  doc_total: number | null; stones: XStone[]; warnings: string[]
}

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) })

/** Photos become JPEG (max 2400 px wide, so HEIC from the iPhone camera roll also works); PDFs go as they are. */
async function prepare(p: Picked): Promise<Picked> {
  if (p.mime === 'application/pdf' || /\.pdf$/i.test(p.name)) return { ...p, mime: 'application/pdf' }
  const ctx = ImageManipulator.manipulate(p.uri)
  let img = await ctx.renderAsync()
  if (img.width > 2400) { ctx.resize({ width: 2400 }); img = await ctx.renderAsync() }
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
  return { uri: saved.uri, name: p.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg' }
}

/** Upload to the same storage the web app uses and register an Inbox item. Returns the Inbox (intake) id. */
export async function sendToInbox(files: Picked[], kind: 'auto' | 'gia_cert' | 'memo' | 'invoice', note: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7)
  const refs: FileRef[] = []
  for (const f of files) {
    const p = await prepare(f)
    const ext = p.mime === 'application/pdf' ? 'pdf' : 'jpg'
    const path = `intake/${month}/${uuid()}.${ext}`
    const bytes = await new File(p.uri).arrayBuffer()
    const { error } = await supabase.storage.from('stock').upload(path, bytes, { contentType: p.mime })
    if (error) throw new Error('Upload failed: ' + error.message)
    refs.push({ path, name: (p.name || 'photo').replace(/\.[^.]+$/, '') + '.' + ext, mime: p.mime, kind: 'photo' })
  }
  const { data, error } = await supabase.rpc('create_intake', { p_files: refs, p_kind: kind, p_source: 'web', p_note: note })
  if (error) throw error
  return data as string
}

/** Ask the server to read the document (5–20 seconds). */
export async function readIntake(id: string, force = false): Promise<Extraction> {
  const { data, error } = await supabase.functions.invoke('read-stock-doc', { body: { intakeId: id, force } })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* keep */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data.extraction as Extraction
}

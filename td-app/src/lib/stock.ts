import { supabase } from './supabase'

export type FileRef = { path: string; name: string; mime: string; kind: string; at?: string; by?: string }
export type Item = {
  id: string; stock_no: number; kind: string; ownership: 'owned' | 'memo_in'
  status: 'available' | 'on_memo' | 'sold' | 'returned' | 'archived'
  held_for: string; held_until: string | null; location: string
  supplier_id: string | null; vendor_stock: string; vendor_doc: string; received: string | null
  shape: string; carat: number; color: string; clarity: string; cut: string; polish: string; symmetry: string
  fluorescence: string; lab: string; cert_no: string; cert_date: string | null; measurements: string
  depth_pct: number | null; table_pct: number | null; girdle: string; culet: string; inscription: string
  key_to_symbols: string; lab_comments: string; origin: string
  rap_ct: number | null; cost_ct: number | null; cost_total: number | null; ask_ct: number | null; ask_total: number | null
  remarks: string; files: FileRef[]; intake_id: string | null
  pcs: number; memo_pcs: number; memo_ct: number; color_to: string; clarity_to: string; size_cat: string
  title: string; jewelry_type: string; style_no: string; metal: string; metal_wt: number | null; ring_size: string
  side_pcs: number | null; side_ct: number | null; metal_cost: number | null; labor_cost: number | null; stones_cost: number | null
  center_id: string | null; mounted_in: string | null; partner_id: string | null; partner_share: number | null; owned_since: string | null
  created_by: string; created_at: string; updated_by: string | null; updated_at: string | null
}
export type Intake = {
  id: string; source: string; doc_kind: string; files: FileRef[]
  status: 'new' | 'reading' | 'ready' | 'failed' | 'saved' | 'discarded'
  extraction: Extraction | null; error: string; note: string; item_ids: string[]
  created_by: string; created_at: string; closed_by: string | null; closed_at: string | null
}
export type XStone = Record<string, string | number | null>
export type Extraction = {
  document_type: string; supplier: string | null; doc_number: string | null; doc_date: string | null
  doc_total: number | null; stones: XStone[]; warnings: string[]
}

export const SHAPES = ['Round', 'Oval', 'Pear', 'Emerald', 'Cushion', 'Radiant', 'Marquise', 'Princess', 'Asscher', 'Heart', 'Baguette', 'Trillion', 'Old Mine', 'Old European', 'Other']
export const COLORS = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3']
export const GRADES = ['EX', 'VG', 'G', 'F', 'P']
export const FLUOR = ['None', 'Faint', 'Medium', 'Strong', 'Very Strong']
export const DOC_KIND: Record<string, string> = { auto: 'Document', gia_cert: 'Certificate', memo: 'Memo', invoice: 'Invoice', other: 'Document' }

export const r2 = (n: number) => Math.round(n * 100) / 100
/** Rap % of a per-carat price, e.g. -40.0 */
export const rapPct = (ct: number | null | undefined, rap: number | null | undefined) =>
  ct != null && rap ? Math.round((ct / rap - 1) * 1000) / 10 : null
export const fmtPct = (p: number | null) => (p == null ? '—' : (p > 0 ? '+' : '') + p.toFixed(1) + '%')

export function describe(i: Pick<Item, 'carat' | 'shape' | 'color' | 'clarity'>) {
  return [i.carat != null ? Number(i.carat).toFixed(2) + 'ct' : '', i.shape, i.color, i.clarity].filter(Boolean).join(' ')
}
export function statusLabel(i: Pick<Item, 'status' | 'held_for'> & { mounted_in?: string | null; memo_ct?: number }) {
  if (i.mounted_in) return 'Mounted'
  if (i.status === 'available') return i.held_for ? 'Held' : i.memo_ct && Number(i.memo_ct) > 0 ? 'Part on memo' : 'Available'
  return { on_memo: 'On memo', sold: 'Sold', returned: 'Returned', archived: 'Archived' }[i.status] ?? i.status
}

export async function signedUrl(path: string) {
  const { data } = await supabase.storage.from('stock').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** Phone photos are shrunk to a sharp JPEG (long side 2400px) before upload: fast on mobile data and readable by the AI. */
async function toJpeg(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the photo.'))), 'image/jpeg', 0.88))
  } catch {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file
    throw new Error('This photo format could not be opened. Take the photo with the camera button instead.')
  }
}

export async function uploadFiles(files: File[], folder: 'intake' | 'items'): Promise<FileRef[]> {
  const month = new Date().toISOString().slice(0, 7)
  const out: FileRef[] = []
  for (const f of files) {
    const blob = await toJpeg(f)
    const pdf = blob.type === 'application/pdf'
    const mime = pdf ? 'application/pdf' : blob.type || 'image/jpeg'
    const ext = pdf ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
    const path = `${folder}/${month}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('stock').upload(path, blob, { contentType: mime })
    if (error) throw new Error('Upload failed: ' + error.message)
    const base = f.name.replace(/\.[^.]+$/, '') || 'photo'
    out.push({ path, name: `${base}.${ext}`, mime, kind: 'photo' })
  }
  return out
}

export async function readIntake(id: string, force = false) {
  const { data, error } = await supabase.functions.invoke('read-stock-doc', { body: { intakeId: id, force } })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* keep */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data.extraction as Extraction
}

/** Simple name match for suppliers read from a document ("David Hoffmann Diamonds Inc." ↔ "David Hoffmann Diamonds"). */
export function matchAccount<T extends { company: string }>(name: string | null, list: T[]): T | null {
  if (!name) return null
  const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|co|the|diamonds?|gems?|jewel(le)?ry)\b/g, '').replace(/[^a-z0-9]/g, '')
  const n = norm(name)
  if (!n) return null
  return list.find((a) => norm(a.company) === n) ?? list.find((a) => { const m = norm(a.company); return m.length > 3 && (m.includes(n) || n.includes(m)) }) ?? null
}

/** Days TD has owned an item still in stock (null for memo-in or items no longer in stock). */
export function daysOwned(i: Pick<Item, 'ownership' | 'owned_since' | 'status'> & { mounted_in?: string | null }) {
  if (i.ownership !== 'owned' || !i.owned_since || !(i.status === 'available' || i.status === 'on_memo') || i.mounted_in) return null
  return Math.max(0, Math.floor((Date.now() - new Date(i.owned_since + 'T12:00:00').getTime()) / 86400000))
}
/** Over a year: red. Over two years: purple. */
export const ageClass = (d: number | null) => (d == null ? '' : d > 730 ? 'age-2y' : d > 365 ? 'age-1y' : '')

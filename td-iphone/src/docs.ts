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
export type Account = { id: string; acct_no: number; company: string; types: string[] | null; invoice_terms: number | null }
export type Item = {
  id: string; stock_no: number; kind: string; ownership: string; status: string; shape: string; carat: number | null
  color: string; clarity: string; lab: string; cert_no: string; vendor_stock: string; ask_total: number | null
  cost_total: number | null; supplier_id: string | null
}
export const ITEM_COLS = 'id,stock_no,kind,ownership,status,shape,carat,color,clarity,lab,cert_no,vendor_stock,ask_total,cost_total,supplier_id'

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

export async function discardIntake(id: string) { await supabase.rpc('discard_intake', { p_id: id }) }

/** "David Hoffmann Diamonds Inc." ↔ "David Hoffmann Diamonds" */
export function matchAccount<T extends { company: string }>(name: string | null, list: T[]): T | null {
  if (!name) return null
  const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|co|the|diamonds?|gems?|jewel(le)?ry)\b/g, '').replace(/[^a-z0-9]/g, '')
  const n = norm(name)
  if (!n) return null
  return list.find((a) => norm(a.company) === n) ?? list.find((a) => { const m = norm(a.company); return m.length > 3 && (m.includes(n) || n.includes(m)) }) ?? null
}

export async function loadAccounts(): Promise<Account[]> {
  const { data } = await supabase.from('accounts').select('id,acct_no,company,types,invoice_terms').eq('active', true).order('company')
  return (data ?? []) as Account[]
}

// ---- stone lines read from a document ----
export type Line = {
  key: number; on: boolean; shape: string; carat: string; color: string; clarity: string; lab: string; cert_no: string
  vendor_stock: string; rap_ct: string; amount: string; extra: Record<string, string | number | null>
}
const EXTRA = ['cut', 'polish', 'symmetry', 'fluorescence', 'measurements', 'depth_pct', 'table_pct', 'girdle', 'culet', 'inscription', 'cert_date', 'key_to_symbols', 'lab_comments']
export function toLines(x: Extraction): Line[] {
  return x.stones.map((s, i) => {
    const v = (k: string) => (s[k] == null ? '' : String(s[k]))
    const amount = s.amount != null ? String(s.amount) : s.price_ct != null && s.carat != null ? (Math.round(Number(s.price_ct) * Number(s.carat) * 100) / 100).toFixed(2) : ''
    return { key: i, on: true, shape: v('shape'), carat: v('carat'), color: v('color'), clarity: v('clarity'), lab: v('lab') || 'GIA', cert_no: v('cert_no'),
      vendor_stock: v('vendor_stock'), rap_ct: v('rap_ct'), amount, extra: Object.fromEntries(EXTRA.filter((k) => s[k] != null && s[k] !== '').map((k) => [k, s[k]])) }
  })
}
export const num = (v: string) => { const x = Number(String(v).replace(/[$,\s]/g, '')); return String(v).trim() && isFinite(x) ? Math.round(x * 100) / 100 : null }
export const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
export const label = (l: { carat: string | number | null; shape: string; color: string; clarity: string; cert_no: string; vendor_stock?: string }) =>
  [l.carat ? Number(l.carat).toFixed(2) + 'ct' : '', l.shape, l.color, l.clarity, l.cert_no ? 'GIA ' + l.cert_no : l.vendor_stock ? 'lot ' + l.vendor_stock : ''].filter(Boolean).join(' ')
export const stone = (l: Line) => ({ kind: 'white_diamond', shape: l.shape, carat: num(l.carat), color: l.color, clarity: l.clarity, lab: l.lab || 'GIA', cert_no: l.cert_no, vendor_stock: l.vendor_stock, rap_ct: num(l.rap_ct), ...l.extra })

// ---- memo-in matching (same rules as the web app: GIA # first, then lot #) ----
export type MiCand = { line_id: string; doc_id: string; doc_no: number; account_id: string; open: boolean; item_id: string; stock_no: number; cert_no: string; vendor_stock: string; amount: number | null; item_status: string }
const normCert = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const normLot = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function memoInLines(f: { supplierId?: string; certs?: string[] }): Promise<MiCand[]> {
  let itemIds: string[] | null = null
  if (f.certs) {
    if (!f.certs.length) return []
    const { data } = await supabase.from('items').select('id').in('cert_no', f.certs).eq('ownership', 'memo_in')
    itemIds = (data ?? []).map((r) => r.id)
    if (!itemIds.length) return []
  }
  let q = supabase.from('doc_lines').select('id, doc_id, item_id, carat, done_ct, amount, docs!inner(doc_no, kind, status, account_id)').eq('docs.kind', 'memo_in').neq('docs.status', 'void')
  if (f.supplierId) q = q.eq('docs.account_id', f.supplierId)
  if (itemIds) q = q.in('item_id', itemIds)
  const { data, error } = await q
  if (error) throw error
  type Row = { id: string; doc_id: string; item_id: string; carat: number; done_ct: number; amount: number | null; docs: { doc_no: number; status: string; account_id: string } }
  const rows = (data ?? []) as unknown as Row[]
  const ids = [...new Set(rows.map((r) => r.item_id))]
  const items: Record<string, { stock_no: number; cert_no: string; vendor_stock: string; status: string }> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data: it } = await supabase.from('items').select('id, stock_no, cert_no, vendor_stock, status').in('id', ids.slice(i, i + 200))
    for (const x of it ?? []) items[x.id] = x
  }
  return rows.filter((r) => items[r.item_id]).map((r) => ({
    line_id: r.id, doc_id: r.doc_id, doc_no: r.docs.doc_no, account_id: r.docs.account_id, open: r.docs.status === 'open' && Number(r.done_ct) < Number(r.carat),
    item_id: r.item_id, stock_no: items[r.item_id].stock_no, cert_no: items[r.item_id].cert_no, vendor_stock: items[r.item_id].vendor_stock,
    amount: r.amount != null ? Number(r.amount) : null, item_status: items[r.item_id].status,
  }))
}

export type Match = { line: Line; cand: MiCand | null; problem: 'none' | 'unmatched' | 'done' }
export function matchLines(lines: Line[], cands: MiCand[]): Match[] {
  const used = new Set<string>()
  return lines.map((line) => {
    const c = normCert(line.cert_no), lot = normLot(line.vendor_stock)
    const pick = (list: MiCand[]) => list.find((x) => x.open && !used.has(x.line_id)) ?? list.find((x) => !x.open) ?? null
    let cand: MiCand | null = null
    if (c) cand = pick(cands.filter((x) => normCert(x.cert_no) === c))
    if (!cand && lot) cand = pick(cands.filter((x) => normLot(x.vendor_stock) === lot))
    if (cand?.open) used.add(cand.line_id)
    return { line, cand, problem: !cand ? 'unmatched' : cand.open ? 'none' : 'done' }
  })
}

/** Stones in stock that a document refers to (by report # or the supplier's lot #). */
export async function findStock(lines: Line[]): Promise<{ line: Line; item: Item | null }[]> {
  const certs = lines.map((l) => l.cert_no).filter(Boolean), lots = lines.map((l) => l.vendor_stock).filter(Boolean)
  const found: Item[] = []
  if (certs.length) { const { data } = await supabase.from('items').select(ITEM_COLS).in('cert_no', certs).in('status', ['available', 'on_memo']); found.push(...((data ?? []) as Item[])) }
  if (lots.length) { const { data } = await supabase.from('items').select(ITEM_COLS).in('vendor_stock', lots).in('status', ['available', 'on_memo']); found.push(...((data ?? []) as Item[])) }
  return lines.map((line) => ({ line, item: found.find((i) => line.cert_no && normCert(i.cert_no) === normCert(line.cert_no)) ?? found.find((i) => line.vendor_stock && normLot(i.vendor_stock) === normLot(line.vendor_stock)) ?? null }))
}

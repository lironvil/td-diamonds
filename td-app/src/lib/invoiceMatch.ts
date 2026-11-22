import { supabase } from './supabase'

/** One stone line read from a supplier invoice (edited on the review screen). */
export type InvLine = {
  key: number; shape: string; carat: string; color: string; clarity: string; lab: string; cert_no: string
  vendor_stock: string; rap_ct: string; cost_total: string; extra: Record<string, string | number | null>
}

/** A memo-in line (stone a supplier gave TD on memo). */
export type MiCand = {
  line_id: string; doc_id: string; doc_no: number; vendor_doc: string; account_id: string; open: boolean
  item_id: string; stock_no: number; cert_no: string; vendor_stock: string; amount: number | null; descr: string; item_status: string
}

export const normCert = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const normLot = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export const amt = (v: string) => { const x = Number(v.replace(/[$,\s]/g, '')); return v.trim() && isFinite(x) ? Math.round(x * 100) / 100 : null }

/** Memo-in lines (not void), either of one supplier or holding any of the given certificate numbers. */
export async function memoInLines(f: { supplierId?: string; certs?: string[] }): Promise<MiCand[]> {
  let itemIds: string[] | null = null
  if (f.certs) {
    if (!f.certs.length) return []
    const { data } = await supabase.from('items').select('id').in('cert_no', f.certs).eq('ownership', 'memo_in')
    itemIds = (data ?? []).map((r) => r.id)
    if (!itemIds.length) return []
  }
  let q = supabase.from('doc_lines').select('id, doc_id, item_id, carat, done_ct, amount, descr, docs!inner(doc_no, vendor_doc, kind, status, account_id)')
    .eq('docs.kind', 'memo_in').neq('docs.status', 'void')
  if (f.supplierId) q = q.eq('docs.account_id', f.supplierId)
  if (itemIds) q = q.in('item_id', itemIds)
  const { data, error } = await q
  if (error) throw error
  type Row = { id: string; doc_id: string; item_id: string; carat: number; done_ct: number; amount: number | null; descr: string; docs: { doc_no: number; vendor_doc: string; status: string; account_id: string } }
  const rows = (data ?? []) as unknown as Row[]
  const ids = [...new Set(rows.map((r) => r.item_id))]
  const items: Record<string, { stock_no: number; cert_no: string; vendor_stock: string; status: string }> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data: it } = await supabase.from('items').select('id, stock_no, cert_no, vendor_stock, status').in('id', ids.slice(i, i + 200))
    for (const x of it ?? []) items[x.id] = x
  }
  return rows.filter((r) => items[r.item_id]).map((r) => ({
    line_id: r.id, doc_id: r.doc_id, doc_no: r.docs.doc_no, vendor_doc: r.docs.vendor_doc, account_id: r.docs.account_id,
    open: r.docs.status === 'open' && Number(r.done_ct) < Number(r.carat),
    item_id: r.item_id, stock_no: items[r.item_id].stock_no, cert_no: items[r.item_id].cert_no, vendor_stock: items[r.item_id].vendor_stock,
    amount: r.amount != null ? Number(r.amount) : null, descr: r.descr, item_status: items[r.item_id].status,
  }))
}

export type Match = { line: InvLine; cand: MiCand | null; by: 'gia' | 'lot' | null; problem: 'none' | 'unmatched' | 'done' }

/** Match by GIA / report # first, then by the supplier's lot #. Prefers a memo-in line that is still open. */
export function matchLines(lines: InvLine[], cands: MiCand[]): Match[] {
  const used = new Set<string>()
  return lines.map((line) => {
    const c = normCert(line.cert_no), lot = normLot(line.vendor_stock)
    const pick = (list: MiCand[]) => list.find((x) => x.open && !used.has(x.line_id)) ?? list.find((x) => !x.open) ?? null
    let by: Match['by'] = null
    let cand: MiCand | null = null
    if (c) { cand = pick(cands.filter((x) => normCert(x.cert_no) === c)); if (cand) by = 'gia' }
    if (!cand && lot) { cand = pick(cands.filter((x) => normLot(x.vendor_stock) === lot)); if (cand) by = 'lot' }
    if (cand?.open) used.add(cand.line_id)
    return { line, cand, by, problem: !cand ? 'unmatched' : cand.open ? 'none' : 'done' }
  })
}

/** Grading and cost for a new stone bought straight from the invoice. */
export const newStone = (l: InvLine) => ({
  kind: 'white_diamond', shape: l.shape, carat: amt(l.carat), color: l.color, clarity: l.clarity, lab: l.lab || 'GIA', cert_no: l.cert_no,
  vendor_stock: l.vendor_stock, rap_ct: amt(l.rap_ct), ...l.extra,
})

/** The review screen hands its (edited) lines to "New purchase" when the user enters the purchase himself. */
export type Handoff = { supplierId: string; vendorDoc: string; date: string; lines: InvLine[] }
export const handoffKey = (intakeId: string) => 'td-invoice-' + intakeId
export function saveHandoff(intakeId: string, h: Handoff) { try { sessionStorage.setItem(handoffKey(intakeId), JSON.stringify(h)) } catch { /* private mode */ } }
export function readHandoff(intakeId: string): Handoff | null { try { const s = sessionStorage.getItem(handoffKey(intakeId)); return s ? JSON.parse(s) : null } catch { return null } }

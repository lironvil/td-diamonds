import { supabase } from './supabase'
import type { Item } from './stock'

export type Doc = {
  id: string; kind: 'memo' | 'memo_return' | 'memo_in' | 'memo_in_return' | 'mix'; doc_no: number
  account_id: string | null; doc_date: string; terms: number | null; due_date: string | null
  status: 'open' | 'closed' | 'void'; vendor_doc: string; source_doc_id: string | null
  notes: string; print_notes: string; intake_id: string | null; created_by: string; created_at: string; closed_at: string | null
}
export type DocLine = {
  id: string; doc_id: string; line_no: number; item_id: string; source_line_id: string | null; direction: '' | 'out' | 'in'
  pcs: number; carat: number; price_ct: number | null; amount: number | null; done_pcs: number; done_ct: number; descr: string
}
export const DOC_TITLE: Record<string, string> = {
  memo: 'Memo', memo_return: 'Memo return', memo_in: 'Memo-in', memo_in_return: 'Return to supplier', mix: 'Parcel mix',
}
export const PRINT_TITLE: Record<string, string> = {
  memo: 'MEMORANDUM', memo_return: 'MEMO RETURN', memo_in: 'MEMO-IN RECEIPT', memo_in_return: 'RETURN TO SUPPLIER', mix: 'PARCEL MIX',
}

export function daysSince(date: string) {
  const d = new Date(date + 'T12:00:00')
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
export const lineOpen = (l: DocLine) => l.done_ct < Number(l.carat) || l.done_pcs < l.pcs
export const openAmount = (l: DocLine) =>
  l.amount == null ? 0 : Number(l.carat) > 0 ? Math.round(Number(l.amount) * (Number(l.carat) - Number(l.done_ct)) / Number(l.carat) * 100) / 100 : Number(l.amount)

export async function settings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('settings').select('key,value')
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
}

export function itemLabel(i: Item) {
  if (i.kind === 'jewelry') return [i.metal, i.jewelry_type, i.title].filter(Boolean).join(' ') || 'Jewelry'
  if (i.kind === 'parcel') {
    const col = [i.color, i.color_to].filter(Boolean).join('–'), cl = [i.clarity, i.clarity_to].filter(Boolean).join('–')
    return ['Parcel', i.shape, i.size_cat, col, cl].filter(Boolean).join(' ')
  }
  return [Number(i.carat).toFixed(2) + 'ct', i.shape, i.color, i.clarity, i.cert_no && `${i.lab} ${i.cert_no}`].filter(Boolean).join(' ')
}
export const itemPath = (i: Pick<Item, 'id'>) => 'stock/' + i.id

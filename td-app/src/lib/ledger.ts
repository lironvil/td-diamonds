export type LDoc = {
  id: string; kind: 'invoice' | 'credit_invoice' | 'purchase' | 'credit_purchase'; doc_no: number; account_id: string
  doc_date: string; terms: number | null; due_date: string | null; status: 'open' | 'paid' | 'void'
  total: number; paid: number; vendor_doc: string; source_id: string | null; memo_id: string | null
  notes: string; print_notes: string; created_by: string; created_at: string
}
export type LLine = {
  id: string; doc_id: string; line_no: number; item_id: string | null; source_line_id: string | null; memo_line_id: string | null
  pcs: number; carat: number; price_ct: number | null; amount: number; done_pcs: number; done_ct: number; done_amount: number
  partner_id: string | null; partner_share: number | null; paid_by_partner: boolean; descr: string
}
export type Payment = {
  id: string; kind: 'in' | 'out'; doc_no: number; account_id: string; pay_date: string; method: string; reference: string
  amount: number; applied: number; status: 'ok' | 'void' | 'nsf'; notes: string; created_by: string; created_at: string
}
export const LINE_COLS = 'id,doc_id,line_no,item_id,source_line_id,memo_line_id,pcs,carat,price_ct,amount,done_pcs,done_ct,done_amount,partner_id,partner_share,paid_by_partner,descr'
export const LTITLE: Record<string, string> = { invoice: 'Invoice', credit_invoice: 'Credit (sales return)', purchase: 'Purchase', credit_purchase: 'Return to supplier' }
export const LPRINT: Record<string, string> = { invoice: 'INVOICE', credit_invoice: 'CREDIT MEMO', purchase: 'PURCHASE', credit_purchase: 'RETURN TO SUPPLIER' }
export const METHODS = ['Check', 'Wire', 'ACH', 'Credit card', 'Cash', 'Zelle', 'Other']
export const balance = (d: Pick<LDoc, 'total' | 'paid'>) => Math.round((Number(d.total) - Number(d.paid)) * 100) / 100
export const lpath = (d: Pick<LDoc, 'kind' | 'id'>) => (d.kind === 'invoice' || d.kind === 'credit_invoice' ? 'invoices/' : 'purchases/') + d.id
export const queryParam = (k: string) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(k)

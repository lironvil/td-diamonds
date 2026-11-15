export type Contact = { name: string; position: string; phone: string; email: string }
export type Address = {
  label: string; address1: string; address2: string; city: string; state: string; zip: string; country: string
  is_default: boolean
}
export type Account = {
  id: string; acct_no: number; company: string; types: string[]; active: boolean
  contact: string; email: string; billing_email: string; phone: string; mobile: string; website: string
  address1: string; address2: string; city: string; state: string; zip: string; country: string
  rating: number; salesperson: string; customer_since: string | null; credit_limit: number | null
  invoice_terms: number | null; memo_terms: number | null; ship_via: string
  tax_id: string; tax_id_expiry: string | null; resale_cert: string; taxable: boolean
  jbt_no: string; referred_by: string; comments: string
  contacts: Contact[]; addresses: Address[]
  created_by: string; created_at: string; updated_by: string | null; updated_at: string | null
}
export type Note = { id: string; account_id: string; note: string; actor: string; at: string }
export type LogRow = {
  id?: number; at: string; actor: string; action: string; ref: string; summary: string
  entity: string; entity_id: string | null; source?: string
}

export const ACCOUNT_TYPES: { key: string; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'partner', label: 'Partner' },
  { key: 'prospect', label: 'Prospect' },
  { key: 'salesperson', label: 'Salesperson' },
  { key: 'expense_vendor', label: 'Expense vendor' },
  { key: 'general', label: 'General' },
]
export const typeLabel = (k: string) => ACCOUNT_TYPES.find((t) => t.key === k)?.label ?? k

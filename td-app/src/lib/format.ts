const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const money = (n: number | null | undefined) => (n == null ? '—' : usd.format(Number(n)))
export const money0 = (n: number | null | undefined) => (n == null ? '—' : usd0.format(Number(n)))

/** Shown in the user's own time zone (Israel or New York). */
export function when(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export function day(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return day(iso)
}
export function personName(email: string, team: { email: string; name: string }[]) {
  const m = team.find((t) => t.email === email)
  return m?.name || email.split('@')[0]
}
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const FIELD: Record<string, string> = {
  acct_no: 'Account #', company: 'Company', types: 'Type', active: 'Active', contact: 'Contact', email: 'Email',
  billing_email: 'Billing email', phone: 'Phone', mobile: 'Mobile', website: 'Website', address1: 'Address',
  address2: 'Address line 2', city: 'City', state: 'State', zip: 'Zip', country: 'Country', rating: 'Rating',
  salesperson: 'Salesperson', customer_since: 'Customer since', credit_limit: 'Credit limit', invoice_terms: 'Invoice terms',
  memo_terms: 'Memo terms', ship_via: 'Ship via', tax_id: 'Tax ID', tax_id_expiry: 'Tax ID expires', resale_cert: 'Resale cert',
  taxable: 'Taxable', jbt_no: 'JBT #', referred_by: 'Referred by', comments: 'Comments',
  stock_no: 'Stock #', ownership: 'Ownership', location: 'Location', supplier_id: 'Supplier', vendor_stock: 'Vendor stock #',
  vendor_doc: 'Vendor doc #', received: 'Received', shape: 'Shape', carat: 'Carat', clarity: 'Clarity', cut: 'Cut', polish: 'Polish',
  symmetry: 'Symmetry', fluorescence: 'Fluorescence', lab: 'Lab', cert_no: 'Report #', cert_date: 'Report date', measurements: 'Measurements',
  depth_pct: 'Depth %', table_pct: 'Table %', girdle: 'Girdle', culet: 'Culet', inscription: 'Inscription', key_to_symbols: 'Key to symbols',
  lab_comments: 'Lab comments', origin: 'Origin', rap_ct: 'Rap/ct', cost_ct: 'Cost/ct', cost_total: 'Cost total', ask_ct: 'Ask/ct',
  ask_total: 'Ask total', remarks: 'Remarks', intake_id: 'Photo', partner_id: 'Partner', partner_share: 'Partner share', stone_id: 'Memo app stone',
}
/** "credit_limit: — → 40000.00; types: [..]" → "Credit limit: — → 40000.00 · Type: …" */
export function readableChanges(summary: string) {
  return summary.split('; ').map((part) => {
    const m = part.match(/^([a-z_0-9]+): (.*)$/)
    if (!m || !FIELD[m[1]]) return part
    const v = m[2].replace(/\["([^\]]*)\]/g, (_, inner: string) => inner.replace(/"/g, '').replace(/_/g, ' '))
    return `${FIELD[m[1]]}: ${v}`
  }).join(' · ')
}

import { useEffect, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { ACCOUNT_TYPES, type Account, type Address, type Contact } from '../lib/types'

type Form = Omit<Account, 'id' | 'acct_no' | 'credit_limit' | 'invoice_terms' | 'memo_terms' | 'created_by' | 'created_at' | 'updated_by' | 'updated_at'> & {
  acct_no: string; credit_limit: string; invoice_terms: string; memo_terms: string
}

const blank: Form = {
  acct_no: '', company: '', types: ['customer'], active: true, contact: '', email: '', billing_email: '', phone: '', mobile: '',
  website: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'USA', rating: 0, salesperson: '',
  customer_since: null, credit_limit: '', invoice_terms: '', memo_terms: '', ship_via: '', tax_id: '', tax_id_expiry: null,
  resale_cert: '', taxable: false, jbt_no: '', referred_by: '', comments: '', contacts: [], addresses: [],
}
const blankContact: Contact = { name: '', position: '', phone: '', email: '' }
const blankAddress: Address = { label: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'USA', is_default: false }

export default function AccountForm({ id }: { id?: string }) {
  const { toast } = useApp()
  const [f, setF] = useState<Form | null>(id ? null : blank)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('accounts').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error || !data) return setErr(error ? errText(error) : 'Account not found.')
      const a = data as Account
      setF({ ...a, acct_no: String(a.acct_no), credit_limit: a.credit_limit?.toString() ?? '',
        invoice_terms: a.invoice_terms?.toString() ?? '', memo_terms: a.memo_terms?.toString() ?? '' })
    })
  }, [id])

  if (!f) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v })
  const txt = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => (
    <label className={'f ' + cls}>{label}
      <input className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </label>
  )
  const toggleType = (t: string) => set('types', f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t])
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,\s]/g, '')))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    setErr(null)
    if (!f.company.trim()) return setErr('Enter the company name.')
    if (!f.types.length) return setErr('Choose at least one type.')
    for (const [k, label] of [['credit_limit', 'credit limit'], ['invoice_terms', 'invoice terms'], ['memo_terms', 'memo terms'], ['acct_no', 'account #']] as const) {
      const v = numOrNull(f[k])
      if (v !== null && (!isFinite(v) || v < 0)) return setErr(`Check the ${label}.`)
    }
    const payload = {
      ...f, id: id ?? null,
      acct_no: numOrNull(f.acct_no), credit_limit: numOrNull(f.credit_limit),
      invoice_terms: numOrNull(f.invoice_terms), memo_terms: numOrNull(f.memo_terms),
      customer_since: f.customer_since || null, tax_id_expiry: f.tax_id_expiry || null,
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('save_account', { p: payload })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(id ? 'Saved' : `Account #${data.acct_no} created`)
    go('accounts/' + data.id)
  }

  const setContact = (i: number, k: keyof Contact, v: string) =>
    set('contacts', f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)))
  const setAddress = (i: number, k: keyof Address, v: string | boolean) =>
    set('addresses', f.addresses.map((d, j) => (j === i ? { ...d, [k]: v } : k === 'is_default' && v ? { ...d, is_default: false } : d)))

  return (
    <form onSubmit={save}>
      <a className="btn ghost sm" href={id ? `#/accounts/${id}` : '#/accounts'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> {id ? 'Back' : 'Accounts'}</a>
      <div className="page-head">
        <div><h1>{id ? `Edit ${f.company || 'account'}` : 'New account'}</h1>
          <div className="sub">{id ? `Account #${f.acct_no}` : 'Only the company name and type are required.'}</div></div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid" style={{ gap: 16 }}>
        <Block title="Company">
          <div className="form-grid">
            {txt('company', 'Company name *', { required: true, autoFocus: !id }, 'wide')}
            <div className="f wide" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Type (one or more)
              <div className="chips" style={{ marginTop: 5 }}>
                {ACCOUNT_TYPES.map((t) => (
                  <button type="button" key={t.key} className={'chip' + (f.types.includes(t.key) ? ' on' : '')} onClick={() => toggleType(t.key)}>{t.label}</button>
                ))}
              </div>
            </div>
            {txt('acct_no', id ? 'Account #' : 'Account # (blank = next number)', { inputMode: 'numeric' })}
            <label className="f">Rating
              <select className="input" value={f.rating} onChange={(e) => set('rating', Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'No rating' : '★'.repeat(n)}</option>)}
              </select>
            </label>
            <label className="f">Customer since
              <input className="input" type="date" value={f.customer_since ?? ''} onChange={(e) => set('customer_since', e.target.value || null)} />
            </label>
            {txt('salesperson', 'Salesperson')}
          </div>
        </Block>

        <Block title="Contact & address">
          <div className="form-grid">
            {txt('contact', 'Primary contact')}
            {txt('phone', 'Phone', { type: 'tel' })}
            {txt('mobile', 'Mobile', { type: 'tel' })}
            {txt('email', 'Email', { type: 'email' })}
            {txt('billing_email', 'Billing email', { type: 'email' })}
            {txt('website', 'Website')}
            {txt('address1', 'Address', {}, 'wide')}
            {txt('address2', 'Address line 2 (suite, floor)', {}, 'wide')}
            {txt('city', 'City')}
            {txt('state', 'State')}
            {txt('zip', 'Zip')}
            {txt('country', 'Country')}
          </div>
        </Block>

        <Block title="Terms & credit">
          <div className="form-grid">
            {txt('invoice_terms', 'Invoice terms (days)', { inputMode: 'numeric', placeholder: 'e.g. 30' })}
            {txt('memo_terms', 'Memo terms (days)', { inputMode: 'numeric', placeholder: 'e.g. 14' })}
            {txt('credit_limit', 'Credit limit (USD)', { inputMode: 'decimal' })}
            {txt('ship_via', 'Default ship via', { placeholder: 'e.g. FedEx, Brinks, hand' })}
          </div>
        </Block>

        <Block title="Tax & trade">
          <div className="form-grid">
            {txt('tax_id', 'Federal tax ID')}
            <label className="f">Tax ID expires
              <input className="input" type="date" value={f.tax_id_expiry ?? ''} onChange={(e) => set('tax_id_expiry', e.target.value || null)} />
            </label>
            {txt('resale_cert', 'Resale certificate #')}
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={f.taxable} onChange={(e) => set('taxable', e.target.checked)} /> Charge sales tax
            </label>
            {txt('jbt_no', 'JBT #')}
            {txt('referred_by', 'Referred by')}
            <label className="f wide">Comments
              <textarea className="input" value={f.comments} onChange={(e) => set('comments', e.target.value)} />
            </label>
          </div>
        </Block>

        <Block title="Contacts" action={<button type="button" className="btn sm" onClick={() => set('contacts', [...f.contacts, { ...blankContact }])}><Icon name="plus" /> Add contact</button>}>
          {f.contacts.length === 0 ? <div className="muted small">No extra contacts.</div> : (
            <div className="sub-rows">
              {f.contacts.map((c, i) => (
                <div className="sub-row" key={i}>
                  <label className="f">Name<input className="input" value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} /></label>
                  <label className="f">Position<input className="input" value={c.position} onChange={(e) => setContact(i, 'position', e.target.value)} /></label>
                  <label className="f">Phone<input className="input" type="tel" value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} /></label>
                  <label className="f">Email<input className="input" type="email" value={c.email} onChange={(e) => setContact(i, 'email', e.target.value)} /></label>
                  <button type="button" className="btn ghost danger sm" onClick={() => set('contacts', f.contacts.filter((_, j) => j !== i))} aria-label="Remove contact"><Icon name="x" /></button>
                </div>
              ))}
            </div>
          )}
        </Block>

        <Block title="Shipping addresses" action={<button type="button" className="btn sm" onClick={() => set('addresses', [...f.addresses, { ...blankAddress, is_default: f.addresses.length === 0 }])}><Icon name="plus" /> Add address</button>}>
          {f.addresses.length === 0 ? <div className="muted small">None. The main address is used for shipping.</div> : (
            <div className="sub-rows">
              {f.addresses.map((d, i) => (
                <div className="sub-row" key={i}>
                  <label className="f">Label<input className="input" placeholder="e.g. Store" value={d.label} onChange={(e) => setAddress(i, 'label', e.target.value)} /></label>
                  <label className="f">Address<input className="input" value={d.address1} onChange={(e) => setAddress(i, 'address1', e.target.value)} /></label>
                  <label className="f">Line 2<input className="input" value={d.address2} onChange={(e) => setAddress(i, 'address2', e.target.value)} /></label>
                  <label className="f">City<input className="input" value={d.city} onChange={(e) => setAddress(i, 'city', e.target.value)} /></label>
                  <label className="f">State<input className="input" value={d.state} onChange={(e) => setAddress(i, 'state', e.target.value)} /></label>
                  <label className="f">Zip<input className="input" value={d.zip} onChange={(e) => setAddress(i, 'zip', e.target.value)} /></label>
                  <label className="f">Country<input className="input" value={d.country} onChange={(e) => setAddress(i, 'country', e.target.value)} /></label>
                  <label className="check" style={{ paddingBottom: 8 }}><input type="radio" name="defaddr" checked={d.is_default} onChange={() => setAddress(i, 'is_default', true)} /> Default</label>
                  <button type="button" className="btn ghost danger sm" onClick={() => set('addresses', f.addresses.filter((_, j) => j !== i))} aria-label="Remove address"><Icon name="x" /></button>
                </div>
              ))}
            </div>
          )}
        </Block>
      </div>

      <div className="sticky-bar">
        {err && <span className="alert" style={{ margin: 0, marginRight: 'auto', padding: '8px 12px' }}>{err}</span>}
        <button type="button" className="btn" onClick={() => go(id ? `accounts/${id}` : 'accounts')}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Create account'}</button>
      </div>
    </form>
  )
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="row" style={{ marginBottom: 14 }}><h3>{title}</h3><span className="spacer" />{action}</div>
      {children}
    </div>
  )
}

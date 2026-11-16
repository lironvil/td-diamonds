import { useCallback, useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { AccountPicker } from '../components/Pickers'
import { METHODS, balance, queryParam, type LDoc, type Payment } from '../lib/ledger'

/** Receive a customer payment (kind in) or pay a supplier (kind out): amount is spread over open documents, oldest first. */
export function PaymentNew({ kind }: { kind: 'in' | 'out' }) {
  const { toast } = useApp()
  const docKind = kind === 'in' ? 'invoice' : 'purchase'
  const [acc, setAcc] = useState<{ id: string; company: string } | null>(null)
  const [docs, setDocs] = useState<LDoc[]>([])
  const [apply, setApply] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Wire')
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const num = (s: string) => Number(String(s).replace(/[$,]/g, '')) || 0

  async function pick(a: { id: string; company: string } | null, focusDoc?: string | null) {
    setAcc(a); setApply({})
    if (!a) return setDocs([])
    const { data } = await supabase.from('ledger_docs').select('*').eq('kind', docKind).eq('status', 'open').eq('account_id', a.id).order('doc_date')
    const ds = (data ?? []) as LDoc[]; setDocs(ds)
    if (focusDoc) { const d = ds.find((x) => x.id === focusDoc); if (d) { setApply({ [d.id]: balance(d).toFixed(2) }); setAmount(balance(d).toFixed(2)) } }
  }
  useEffect(() => {
    const a = queryParam('account'); if (!a) return
    supabase.from('accounts').select('id,company').eq('id', a).maybeSingle().then(({ data }) => pick(data, queryParam('doc')))
  }, [])
  function spread(total: string) {
    setAmount(total)
    let left = num(total); const out: Record<string, string> = {}
    for (const d of docs) { if (left <= 0) break; const x = Math.min(left, balance(d)); out[d.id] = x.toFixed(2); left = Math.round((left - x) * 100) / 100 }
    setApply(out)
  }
  const applied = Object.values(apply).reduce((a, v) => a + num(v), 0)

  async function save() {
    if (!acc) return setErr('Choose the account.')
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('save_payment', { p: { kind, account_id: acc.id, pay_date: date, method, reference: ref, amount: num(amount), notes,
      apps: Object.entries(apply).filter(([, v]) => num(v) > 0).map(([doc_id, v]) => ({ doc_id, amount: num(v) })) } })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Payment #${data.doc_no} saved`); go((kind === 'in' ? 'payments-in/' : 'payments-out/') + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href={kind === 'in' ? '#/payments-in' : '#/payments-out'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Payments</a>
      <div className="page-head"><div><h1>{kind === 'in' ? 'Receive payment' : 'Pay supplier'}</h1><div className="sub">Type the amount; it is applied to the oldest {kind === 'in' ? 'invoices' : 'bills'} first. Adjust any line.</div></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="wide" style={{ maxWidth: 520 }}><AccountPicker label={kind === 'in' ? 'Customer *' : 'Supplier *'} value={acc?.id ?? ''} onChange={(a) => pick(a)} autoFocus={!queryParam('account')} /></div>
          <label className="f">Amount $ *<input className="input num" value={amount} onChange={(e) => spread(e.target.value)} inputMode="decimal" /></label>
          <label className="f">Method<select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="f">Check # / reference<input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="f">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="f wide">Note<input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      </div>
      {acc && (
        <div className="card">
          <div className="card-head"><h2>Open {kind === 'in' ? 'invoices' : 'bills'} · {acc.company}</h2></div>
          {docs.length === 0 ? <div className="empty">Nothing open. The payment will be kept as credit on the account.</div> : (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>#</th><th>Date</th><th className="r">Total</th><th className="r">Balance</th><th className="r">Apply $</th></tr></thead>
              <tbody>{docs.map((d) => (
                <tr key={d.id} style={{ cursor: 'default' }}>
                  <td className="num">{d.doc_no}{d.vendor_doc ? <span className="faint"> · {d.vendor_doc}</span> : ''}</td><td>{day(d.doc_date)}</td>
                  <td className="r num">{money(d.total)}</td><td className="r num">{money(balance(d))}</td>
                  <td className="r"><input className="input sm num" style={{ width: 110, textAlign: 'right' }} value={apply[d.id] ?? ''} onChange={(e) => setApply({ ...apply, [d.id]: e.target.value })} /></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}
      <div className="sticky-bar">
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>Applied {money(applied)}{num(amount) - applied > 0.004 ? ` · ${money(num(amount) - applied)} stays as credit` : ''}{applied - num(amount) > 0.004 ? ' · more than the payment!' : ''}</span>
        <button className="btn primary" disabled={busy || !acc || num(amount) <= 0 || applied - num(amount) > 0.004} onClick={save}>{busy ? 'Saving…' : 'Save payment'}</button>
      </div>
    </>
  )
}

export function PaymentView({ id }: { id: string }) {
  const { team, toast } = useApp()
  const [p, setP] = useState<Payment | null>(null)
  const [apps, setApps] = useState<{ amount: number; active: boolean; ledger_docs: LDoc }[]>([])
  const [acc, setAcc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('*').eq('id', id).maybeSingle()
    if (!data) return setErr('Payment not found.')
    setP(data as Payment)
    supabase.from('payment_apps').select('amount, active, ledger_docs(*)').eq('payment_id', id).then(({ data }) => setApps((data ?? []) as unknown as typeof apps))
    supabase.from('accounts').select('company').eq('id', data.account_id).maybeSingle().then(({ data }) => setAcc(data?.company ?? ''))
  }, [id])
  useEffect(() => { load() }, [load])
  if (!p) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  async function voidIt(nsf: boolean) {
    if (!confirm(nsf ? 'Mark this check as bounced? The invoices it paid open again.' : 'Void this payment? The documents it paid open again.')) return
    const { error } = await supabase.rpc('void_payment', { p_id: id, p_nsf: nsf })
    if (error) return setErr(errText(error))
    toast(nsf ? 'Marked as bounced' : 'Voided'); load()
  }
  return (
    <>
      <a className="btn ghost sm" href={p.kind === 'in' ? '#/payments-in' : '#/payments-out'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Payments</a>
      <div className="page-head">
        <div><h1>Payment #{p.doc_no} · {money(p.amount)}</h1>
          <div className="sub">{p.kind === 'in' ? 'From' : 'To'} {acc} · {day(p.pay_date)} · {p.method} {p.reference}
            {p.status !== 'ok' && <span className="badge bad" style={{ marginLeft: 8 }}>{p.status === 'nsf' ? 'Bounced' : 'Void'}</span>}</div></div>
        {p.status === 'ok' && <div className="row">
          {p.kind === 'in' && p.method === 'Check' && <button className="btn" onClick={() => voidIt(true)}>Check bounced</button>}
          <button className="btn ghost danger" onClick={() => voidIt(false)}>Void</button></div>}
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-head"><h2>Applied to</h2><span className="muted small">{p.status === 'ok' && p.amount - p.applied > 0 ? `${money(p.amount - p.applied)} unapplied (credit)` : ''}</span></div>
        {apps.length === 0 ? <div className="empty">Not applied to any document.</div> : (
          <ul className="feed">{apps.map((a, i) => (
            <li key={i} onClick={() => go((a.ledger_docs.kind === 'invoice' ? 'invoices/' : 'purchases/') + a.ledger_docs.id)} style={{ cursor: 'pointer' }}>
              <span className="dot"><Icon name="invoice" /></span>
              <div><div className="what">{a.ledger_docs.kind === 'invoice' ? 'Invoice' : 'Purchase'} #{a.ledger_docs.doc_no} · {money(a.amount)}{!a.active ? ' (reversed)' : ''}</div>
                <div className="detail">{day(a.ledger_docs.doc_date)} · balance now {money(balance(a.ledger_docs))}</div></div>
            </li>))}</ul>
        )}
      </div>
      <div className="faint small" style={{ marginTop: 12 }}>Entered by {personName(p.created_by, team)} · {when(p.created_at)}{p.notes ? ` · ${p.notes}` : ''}</div>
    </>
  )
}

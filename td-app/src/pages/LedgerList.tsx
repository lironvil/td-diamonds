import { useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money } from '../lib/format'
import { go } from '../lib/router'
import { Icon } from '../components/ui'
import { balance, type LDoc, type Payment } from '../lib/ledger'
import { daysSince } from '../lib/docs'

/** Invoices (customers) or purchases = vendor bills (suppliers). */
export function LedgerList({ kind }: { kind: 'invoice' | 'purchase' }) {
  const isInv = kind === 'invoice'
  const [docs, setDocs] = useState<LDoc[] | null>(null)
  const [accs, setAccs] = useState<Record<string, string>>({})
  const [view, setView] = useState<'open' | 'paid' | 'all'>('open')
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('ledger_docs').select('*').eq('kind', kind).order('doc_no', { ascending: false }).limit(3000)
      .then(({ data, error }) => (error ? setErr(errText(error)) : setDocs(data as LDoc[])))
    supabase.from('accounts').select('id,company').then(({ data }) => setAccs(Object.fromEntries((data ?? []).map((a) => [a.id, a.company]))))
  }, [kind])
  const today = new Date().toISOString().slice(0, 10)
  const list = useMemo(() => (docs ?? []).filter((d) => {
    if (view !== 'all' && d.status !== view) return false
    const w = q.toLowerCase().trim()
    return !w || `${d.doc_no} ${accs[d.account_id] ?? ''} ${d.vendor_doc}`.toLowerCase().includes(w)
  }), [docs, view, q, accs])
  const open = list.reduce((a, d) => a + (d.status === 'open' ? balance(d) : 0), 0)
  return (
    <>
      <div className="page-head">
        <div><h1>{isInv ? 'Invoices' : 'Purchases & vendor bills'}</h1><div className="sub">{isInv ? 'Sales to customers; open = not fully paid' : 'What TD bought; open = still owed to the supplier'}</div></div>
        <div className="row">
          <a className="btn" href={isInv ? '#/payments-in/new' : '#/payments-out/new'}><Icon name="cash" /> {isInv ? 'Receive payment' : 'Pay supplier'}</a>
          <a className="btn primary" href={isInv ? '#/invoices/new' : '#/purchases/new'}><Icon name="plus" /> {isInv ? 'New invoice' : 'New purchase'}</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-pad row" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="search" style={{ flex: '1 1 240px' }}><Icon name="search" /><input className="input" placeholder={isInv ? 'Invoice #, customer' : 'Purchase #, supplier, their invoice #'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="chips">{(['open', 'paid', 'all'] as const).map((v) => <button key={v} className={'chip' + (view === v ? ' on' : '')} onClick={() => setView(v)}>{v === 'open' ? (isInv ? 'Open' : 'Unpaid bills') : v === 'paid' ? (isInv ? 'Paid' : 'Paid bills') : 'All'}</button>)}</div>
        </div>
        {docs === null ? <div className="loading">Loading…</div> : list.length === 0 ? <div className="empty"><div className="big">Nothing here</div></div> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>#</th><th>Date</th><th>{isInv ? 'Customer' : 'Supplier'}</th>{!isInv && <th className="hide-sm">Their #</th>}<th className="r">Total</th><th className="r hide-sm">Paid</th><th className="r">Balance</th><th className="r hide-sm">Due</th><th>Status</th></tr></thead>
            <tbody>{list.map((d) => {
              const overdue = d.status === 'open' && d.due_date && d.due_date < today
              return (
                <tr key={d.id} onClick={() => go((isInv ? 'invoices/' : 'purchases/') + d.id)} className={d.status === 'void' ? 'inactive' : ''}>
                  <td className="num"><b style={{ fontWeight: 600 }}>{d.doc_no}</b></td><td className="nw">{day(d.doc_date)}</td><td>{accs[d.account_id] ?? '—'}</td>
                  {!isInv && <td className="hide-sm">{d.vendor_doc || '—'}</td>}
                  <td className="r num">{money(d.total)}</td><td className="r num hide-sm">{money(d.paid)}</td><td className="r num"><b style={{ fontWeight: 600 }}>{money(balance(d))}</b></td>
                  <td className="r num hide-sm" style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{d.due_date ? (overdue ? `${daysSince(d.due_date)} d late` : day(d.due_date)) : '—'}</td>
                  <td><span className={'badge' + (d.status === 'open' ? (overdue ? ' bad' : '') : ' grey')}>{d.status === 'open' ? (overdue ? 'Overdue' : 'Open') : d.status === 'paid' ? 'Paid' : 'Void'}</span></td>
                </tr>)
            })}</tbody>
            <tfoot><tr><td colSpan={9} className="small">{list.length} · open balance {money(open)}</td></tr></tfoot>
          </table></div>
        )}
      </div>
    </>
  )
}

export function PaymentList({ kind }: { kind: 'in' | 'out' }) {
  const [rows, setRows] = useState<Payment[] | null>(null)
  const [accs, setAccs] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.from('payments').select('*').eq('kind', kind).order('pay_date', { ascending: false }).limit(2000).then(({ data }) => setRows((data ?? []) as Payment[]))
    supabase.from('accounts').select('id,company').then(({ data }) => setAccs(Object.fromEntries((data ?? []).map((a) => [a.id, a.company]))))
  }, [kind])
  return (
    <>
      <div className="page-head">
        <div><h1>{kind === 'in' ? 'Customer payments' : 'Supplier payments'}</h1></div>
        <a className="btn primary" href={kind === 'in' ? '#/payments-in/new' : '#/payments-out/new'}><Icon name="plus" /> {kind === 'in' ? 'Receive payment' : 'Pay supplier'}</a>
      </div>
      <div className="card">
        {rows === null ? <div className="loading">Loading…</div> : rows.length === 0 ? <div className="empty"><div className="big">No payments yet</div></div> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>#</th><th>Date</th><th>{kind === 'in' ? 'Customer' : 'Supplier'}</th><th>Method</th><th className="hide-sm">Ref</th><th className="r">Amount</th><th className="r">Unapplied</th><th>Status</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} onClick={() => go((kind === 'in' ? 'payments-in/' : 'payments-out/') + p.id)} className={p.status === 'ok' ? '' : 'inactive'}>
                <td className="num">{p.doc_no}</td><td className="nw">{day(p.pay_date)}</td><td>{accs[p.account_id] ?? '—'}</td><td>{p.method || '—'}</td><td className="hide-sm">{p.reference || '—'}</td>
                <td className="r num">{money(p.amount)}</td><td className="r num">{p.status === 'ok' && p.amount - p.applied > 0 ? money(p.amount - p.applied) : '—'}</td>
                <td><span className={'badge' + (p.status === 'ok' ? '' : ' bad')}>{p.status === 'ok' ? 'OK' : p.status === 'nsf' ? 'Bounced' : 'Void'}</span></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}

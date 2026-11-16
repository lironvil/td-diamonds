import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, readableChanges, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, Stars, useApp } from '../components/ui'
import { typeLabel, type Account, type LogRow, type Note } from '../lib/types'

const TABS = ['General', 'Contacts & addresses', 'Notes', 'History', 'Transactions', 'Partner'] as const

export default function AccountView({ id }: { id: string }) {
  const { team, toast } = useApp()
  const [a, setA] = useState<Account | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('General')
  const [notes, setNotes] = useState<Note[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [acc, n, l] = await Promise.all([
      supabase.from('accounts').select('*').eq('id', id).maybeSingle(),
      supabase.from('account_notes').select('*').eq('account_id', id).order('at', { ascending: false }),
      supabase.from('audit_log').select('*').eq('entity', 'account').eq('entity_id', id).order('at', { ascending: false }),
    ])
    if (acc.error) return setErr(errText(acc.error))
    if (!acc.data) return setErr('Account not found.')
    setA(acc.data as Account); setNotes(n.data ?? []); setLog(l.data ?? [])
  }, [id])
  useEffect(() => { load() }, [load])

  async function addNote() {
    if (!note.trim()) return
    setBusy(true)
    const { error } = await supabase.rpc('add_account_note', { p_id: id, p_note: note })
    setBusy(false)
    if (error) return setErr(errText(error))
    setNote(''); toast('Note added'); load()
  }
  async function toggleActive() {
    if (!a) return
    setBusy(true)
    const { error } = await supabase.rpc('set_account_active', { p_id: id, p_active: !a.active })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(a.active ? 'Marked inactive' : 'Marked active'); load()
  }

  if (err && !a) return <><a className="btn ghost" href="#/accounts"><Icon name="back" /> Accounts</a><div className="alert" style={{ marginTop: 14 }}>{err}</div></>
  if (!a) return <div className="loading">Loading…</div>

  const addr = [a.address1, a.address2, [a.city, a.state, a.zip].filter(Boolean).join(', '), a.country !== 'USA' ? a.country : ''].filter(Boolean)

  return (
    <>
      <a className="btn ghost sm" href="#/accounts" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Accounts</a>
      <div className="page-head">
        <div>
          <h1>{a.company}</h1>
          <div className="sub row" style={{ gap: 8, marginTop: 8 }}>
            <span className="num">#{a.acct_no}</span>
            {a.types.map((t) => <span key={t} className="badge">{typeLabel(t)}</span>)}
            {!a.active && <span className="badge bad">Inactive</span>}
            <Stars n={a.rating} />
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={toggleActive} disabled={busy}>{a.active ? 'Mark inactive' : 'Mark active'}</button>
          <button className="btn primary" onClick={() => go(`accounts/${id}/edit`)}><Icon name="edit" /> Edit</button>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="tabs">
        {TABS.filter((t) => t !== 'Partner' || a.types.includes('partner')).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{t === 'Notes' && notes.length ? ` (${notes.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <div className="grid sections">
          <Section title="Contact">
            <KV k="Primary contact" v={a.contact} />
            <KV k="Phone" v={a.phone && <a href={'tel:' + a.phone}>{a.phone}</a>} />
            <KV k="Mobile" v={a.mobile && <a href={'tel:' + a.mobile}>{a.mobile}</a>} />
            <KV k="Email" v={a.email && <a href={'mailto:' + a.email}>{a.email}</a>} />
            <KV k="Billing email" v={a.billing_email && <a href={'mailto:' + a.billing_email}>{a.billing_email}</a>} />
            <KV k="Website" v={a.website && <a href={/^https?:/.test(a.website) ? a.website : 'https://' + a.website} target="_blank" rel="noreferrer">{a.website}</a>} />
            <KV k="Address" v={addr.length ? addr.map((l, i) => <div key={i}>{l}</div>) : null} />
          </Section>
          <Section title="Terms & credit">
            <KV k="Invoice terms" v={a.invoice_terms != null ? `${a.invoice_terms} days` : null} />
            <KV k="Memo terms" v={a.memo_terms != null ? `${a.memo_terms} days` : null} />
            <KV k="Credit limit" v={a.credit_limit != null ? money(a.credit_limit) : null} />
            <KV k="Ship via" v={a.ship_via} />
            <KV k="Salesperson" v={a.salesperson} />
            <KV k="Customer since" v={a.customer_since ? day(a.customer_since) : null} />
          </Section>
          <Section title="Tax & trade">
            <KV k="Federal tax ID" v={a.tax_id} />
            <KV k="Tax ID expires" v={a.tax_id_expiry ? day(a.tax_id_expiry) : null} />
            <KV k="Resale certificate" v={a.resale_cert} />
            <KV k="Taxable" v={a.taxable ? 'Yes' : 'No'} />
            <KV k="JBT #" v={a.jbt_no} />
            <KV k="Referred by" v={a.referred_by} />
          </Section>
          {a.comments && <Section list title="Comments"><div style={{ whiteSpace: 'pre-wrap' }}>{a.comments}</div></Section>}
          <div className="faint small" style={{ gridColumn: '1/-1' }}>
            Added by {personName(a.created_by, team)} · {when(a.created_at)}
            {a.updated_at && <> · Last edit by {personName(a.updated_by ?? '', team)} · {when(a.updated_at)}</>}
          </div>
        </div>
      )}

      {tab === 'Contacts & addresses' && (
        <div className="grid sections">
          <Section list title={`Contacts (${a.contacts.length})`}>
            {a.contacts.length === 0 ? <div className="muted">No contacts. Add them with Edit.</div> : a.contacts.map((c, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < a.contacts.length - 1 ? '1px solid var(--line)' : 0 }}>
                <b style={{ fontWeight: 600 }}>{c.name}</b>{c.position && <span className="muted"> · {c.position}</span>}
                <div className="muted small">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </Section>
          <Section list title={`Shipping addresses (${a.addresses.length})`}>
            {a.addresses.length === 0 ? <div className="muted">No shipping addresses. The main address is used.</div> : a.addresses.map((d, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < a.addresses.length - 1 ? '1px solid var(--line)' : 0 }}>
                <b style={{ fontWeight: 600 }}>{d.label || 'Address ' + (i + 1)}</b>{d.is_default && <span className="badge" style={{ marginLeft: 8 }}>Default</span>}
                <div className="muted small">{[d.address1, d.address2, [d.city, d.state, d.zip].filter(Boolean).join(', '), d.country].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </Section>
        </div>
      )}

      {tab === 'Notes' && (
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <textarea className="input" placeholder="Write a note about this account…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn primary" onClick={addNote} disabled={busy || !note.trim()}>Add note</button>
            </div>
          </div>
          {notes.length === 0 ? <div className="empty">No notes yet.</div> : (
            <ul className="feed">
              {notes.map((n) => (
                <li key={n.id}>
                  <span className="dot">{personName(n.actor, team).slice(0, 2).toUpperCase()}</span>
                  <div><div className="what">{personName(n.actor, team)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{n.note}</div></div>
                  <span className="time">{when(n.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'History' && (
        <div className="card">
          {log.length === 0 ? <div className="empty">No history.</div> : (
            <ul className="feed">
              {log.map((l) => (
                <li key={l.id}>
                  <span className="dot">{personName(l.actor, team).slice(0, 2).toUpperCase()}</span>
                  <div><div className="what">{personName(l.actor, team)} · {({ CREATE: 'created', EDIT: 'edited', NOTE: 'added a note', ACTIVATE: 'marked active', DEACTIVATE: 'marked inactive' } as Record<string, string>)[l.action] ?? l.action.toLowerCase()}</div><div className="detail">{readableChanges(l.summary)}</div></div>
                  <span className="time">{when(l.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Transactions' && <AccountDocs accountId={id} />}
      {tab === 'Partner' && <PartnerTab accountId={id} />}
    </>
  )
}

function AccountDocs({ accountId }: { accountId: string }) {
  type Row = { id: string; date: string; type: string; no: number; ref: string; amount: number | null; balance: number | null; status: string; path: string }
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    (async () => {
      const T: Record<string, string> = { memo: 'Memo', memo_return: 'Memo return', memo_in: 'Memo-in', memo_in_return: 'Return to supplier', invoice: 'Invoice', credit_invoice: 'Credit', purchase: 'Purchase', credit_purchase: 'Return to supplier (bill)' }
      const [d, l, p] = await Promise.all([
        supabase.from('docs').select('id,kind,doc_no,doc_date,status,vendor_doc').eq('account_id', accountId).limit(500),
        supabase.from('ledger_docs').select('id,kind,doc_no,doc_date,status,vendor_doc,total,paid').eq('account_id', accountId).limit(500),
        supabase.from('payments').select('id,kind,doc_no,pay_date,status,method,reference,amount').eq('account_id', accountId).limit(500),
      ])
      const out: Row[] = [
        ...(d.data ?? []).map((x) => ({ id: x.id, date: x.doc_date, type: T[x.kind], no: x.doc_no, ref: x.vendor_doc, amount: null, balance: null, status: x.status,
          path: (x.kind === 'memo' ? 'memos/' : x.kind === 'memo_in' ? 'memo-in/' : 'docs/') + x.id })),
        ...(l.data ?? []).map((x) => ({ id: x.id, date: x.doc_date, type: T[x.kind], no: x.doc_no, ref: x.vendor_doc, amount: Number(x.total),
          balance: x.kind === 'invoice' || x.kind === 'purchase' ? Number(x.total) - Number(x.paid) : null, status: x.status,
          path: (x.kind.includes('invoice') ? 'invoices/' : 'purchases/') + x.id })),
        ...(p.data ?? []).map((x) => ({ id: x.id, date: x.pay_date, type: x.kind === 'in' ? 'Payment received' : 'Payment sent', no: x.doc_no, ref: `${x.method} ${x.reference}`.trim(),
          amount: Number(x.amount), balance: null, status: x.status, path: (x.kind === 'in' ? 'payments-in/' : 'payments-out/') + x.id })),
      ].sort((a, b) => b.date.localeCompare(a.date))
      setRows(out)
    })()
  }, [accountId])
  if (rows === null) return <div className="loading">Loading…</div>
  if (!rows.length) return <div className="card empty"><div className="big">No transactions yet</div></div>
  const open = rows.reduce((a, r) => a + (r.balance && r.status === 'open' ? r.balance : 0), 0)
  return (
    <div className="card"><div className="table-wrap"><table className="t">
      <thead><tr><th>Date</th><th>Type</th><th>#</th><th>Ref</th><th className="r">Amount</th><th className="r">Balance</th><th>Status</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.type + r.id} onClick={() => go(r.path)}>
          <td>{day(r.date)}</td><td>{r.type}</td><td className="num">{r.no}</td><td>{r.ref || '—'}</td>
          <td className="r num">{r.amount != null ? money(r.amount) : '—'}</td><td className="r num">{r.balance != null ? money(r.balance) : '—'}</td>
          <td><span className={'badge' + (r.status === 'open' ? '' : ' grey')}>{r.status}</span></td>
        </tr>))}</tbody>
      <tfoot><tr><td colSpan={7} className="small">Open balance {money(open)}</td></tr></tfoot>
    </table></div></div>
  )
}

function PartnerTab({ accountId }: { accountId: string }) {
  const { toast } = useApp()
  const [rows, setRows] = useState<{ id: string; entry_date: string; kind: string; amount: number; note: string; item_id: string | null }[] | null>(null)
  const [f, setF] = useState({ amount: '', dir: 'td_paid', note: '' })
  const [err, setErr] = useState<string | null>(null)
  const load = () => supabase.from('partner_entries').select('*').eq('partner_id', accountId).order('entry_date').order('at').then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [accountId])
  if (rows === null) return <div className="loading">Loading…</div>
  let run = 0
  const bal = rows.reduce((a, r) => a + Number(r.amount), 0)
  async function settle() {
    const { error } = await supabase.rpc('settle_partner', { p_partner: accountId, p_amount: Number(f.amount.replace(/[$,]/g, '')), p_direction: f.dir, p_date: null, p_note: f.note })
    if (error) return setErr(errText(error))
    toast('Recorded'); setF({ amount: '', dir: 'td_paid', note: '' }); load()
  }
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card card-pad partner-card">
        <div style={{ font: '600 24px var(--serif)' }}>{bal === 0 ? 'Even' : bal > 0 ? `Partner owes TD ${money(bal)}` : `TD owes partner ${money(-bal)}`}</div>
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <label className="f">Amount $<input className="input num" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="f">Direction<select className="input" value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })}><option value="td_paid">TD paid the partner</option><option value="partner_paid">Partner paid TD</option></select></label>
          <label className="f" style={{ flex: '1 1 160px' }}>Note (check #, wire)<input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <button className="btn primary" disabled={!f.amount} onClick={settle}>Record payment</button>
        </div>
        {err && <div className="alert" style={{ marginTop: 10 }}>{err}</div>}
      </div>
      <div className="card"><div className="table-wrap"><table className="t">
        <thead><tr><th>Date</th><th>What</th><th className="r">Partner owes TD</th><th className="r">TD owes partner</th><th className="r">Balance</th></tr></thead>
        <tbody>{rows.map((r) => { run += Number(r.amount); return (
          <tr key={r.id} style={{ cursor: r.item_id ? 'pointer' : 'default' }} onClick={() => r.item_id && go('stock/' + r.item_id)}>
            <td>{day(r.entry_date)}</td><td>{r.note}</td>
            <td className="r num">{Number(r.amount) > 0 ? money(r.amount) : ''}</td><td className="r num">{Number(r.amount) < 0 ? money(-r.amount) : ''}</td>
            <td className="r num">{run >= 0 ? money(run) : '−' + money(-run)}</td>
          </tr>) })}</tbody>
      </table></div></div>
    </div>
  )
}

function Section({ title, children, list }: { title: string; children: ReactNode; list?: boolean }) {
  return <div className="card card-pad"><h3 style={{ marginBottom: 12 }}>{title}</h3>{list ? children : <dl className="kv">{children}</dl>}</div>
}
function KV({ k, v }: { k: string; v: ReactNode }) {
  return <><dt>{k}</dt><dd>{v || <span className="faint">—</span>}</dd></>
}

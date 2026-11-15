import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, readableChanges, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, Stars, useApp } from '../components/ui'
import { typeLabel, type Account, type LogRow, type Note } from '../lib/types'

const TABS = ['General', 'Contacts & addresses', 'Notes', 'History', 'Transactions'] as const

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
        {TABS.map((t) => (
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
    </>
  )
}

function AccountDocs({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<{ id: string; kind: string; doc_no: number; doc_date: string; status: string; vendor_doc: string }[] | null>(null)
  useEffect(() => {
    supabase.from('docs').select('id,kind,doc_no,doc_date,status,vendor_doc').eq('account_id', accountId).order('doc_date', { ascending: false }).limit(500)
      .then(({ data }) => setDocs(data ?? []))
  }, [accountId])
  const T: Record<string, string> = { memo: 'Memo', memo_return: 'Memo return', memo_in: 'Memo-in', memo_in_return: 'Return to supplier' }
  if (docs === null) return <div className="loading">Loading…</div>
  if (!docs.length) return <div className="card empty"><div className="big">No transactions yet</div>Memos and memo-in for this account show here. Invoices and payments come in Stage 4.</div>
  return (
    <div className="card"><div className="table-wrap"><table className="t">
      <thead><tr><th>Date</th><th>Type</th><th>#</th><th>Their #</th><th>Status</th></tr></thead>
      <tbody>{docs.map((d) => (
        <tr key={d.id} onClick={() => go((d.kind === 'memo' ? 'memos/' : d.kind === 'memo_in' ? 'memo-in/' : 'docs/') + d.id)}>
          <td>{day(d.doc_date)}</td><td>{T[d.kind] ?? d.kind}</td><td className="num">{d.doc_no}</td><td>{d.vendor_doc || '—'}</td>
          <td><span className={'badge' + (d.status === 'open' ? '' : ' grey')}>{d.status}</span></td>
        </tr>))}</tbody>
    </table></div></div>
  )
}

function Section({ title, children, list }: { title: string; children: ReactNode; list?: boolean }) {
  return <div className="card card-pad"><h3 style={{ marginBottom: 12 }}>{title}</h3>{list ? children : <dl className="kv">{children}</dl>}</div>
}
function KV({ k, v }: { k: string; v: ReactNode }) {
  return <><dt>{k}</dt><dd>{v || <span className="faint">—</span>}</dd></>
}

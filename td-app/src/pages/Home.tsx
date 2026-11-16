import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ago, money0, personName, plural, readableChanges } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import Snap from '../components/Snap'
import type { LogRow } from '../lib/types'

type Summary = {
  memo_in_count: number; memo_in_value: number; memo_in_vendors: number
  accounts: number; customers: number; suppliers: number
  open_invoices: number | null; out_on_memo: number | null; unpaid_purchases: number | null
  open_invoices_count: number; invoices_overdue: number; unpaid_purchases_count: number; sales_month_last_year: number
  out_on_memo_count: number; out_on_memo_value: number; open_memos: number; memos_overdue: number; memo_app_count: number
  stock_count: number; stock_carats: number; stock_cost: number; stock_memo_in: number; inbox: number
  sales_month: number | null
}

const QUICK: { label: string; icon: string; to?: string; stage?: number }[] = [
  { label: 'Find stock #', icon: 'diamond', to: 'stock' },
  { label: 'New account', icon: 'users', to: 'accounts/new' },
  { label: 'Find account', icon: 'search', to: 'accounts' },
  { label: 'New memo', icon: 'memo', to: 'memos/new' },
  { label: 'New invoice', icon: 'invoice', to: 'invoices/new' },
  { label: 'New memo-in', icon: 'box', to: 'memo-in/new' },
  { label: 'New purchase', icon: 'cart', to: 'purchases/new' },
  { label: 'Receive payment', icon: 'cash', to: 'payments-in/new' },
  { label: 'Memo quick return', icon: 'undo', to: 'memo-quick-return' },
]

const ACTION_WORD: Record<string, string> = {
  CREATE: 'added', EDIT: 'edited', NOTE: 'noted on', ACTIVATE: 'reactivated', DEACTIVATE: 'deactivated', DELETE: 'deleted',
  IN: 'received memo stone', RETURN: 'returned', UNDO_RETURN: 'undid return of', MEMO: 'sent on memo', SOLD: 'sold', BOUGHT: 'bought', COST: 'added cost to', PARTNER: 'made partnership', SETTLE: 'settled with', CREDIT: 'credited', APPLY: 'applied', NSF: 'marked bounced', MIX: 'mixed', MOUNT: 'mounted', UNMOUNT: 'unmounted', VOID: 'voided',
}

export default function Home() {
  const { me, team } = useApp()
  const [s, setS] = useState<Summary | null>(null)
  const [feed, setFeed] = useState<LogRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('home_summary').then(({ data, error }) => (error ? setErr(errText(error)) : setS(data)))
    supabase.rpc('recent_activity', { p_limit: 15 }).then(({ data, error }) => (error ? setErr(errText(error)) : setFeed(data ?? [])))
  }, [])

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = (me.name || me.email).split(/[ @]/)[0]

  const tiles: { label: string; value: string; note: string; pending?: boolean; to?: string }[] = s
    ? [
        { label: 'Memo-in (suppliers’ goods)', value: money0(s.memo_in_value), note: `${plural(s.memo_in_count, 'item')} · ${plural(s.memo_in_vendors, 'supplier')}`, to: 'memo-in' },
        { label: 'Accounts', value: String(s.accounts), note: `${plural(s.customers, 'customer')} · ${plural(s.suppliers, 'supplier')}`, to: 'accounts' },
        { label: 'Open invoices', value: money0(s.open_invoices ?? 0), note: `${plural(s.open_invoices_count, 'invoice')}${s.invoices_overdue ? ` · ${s.invoices_overdue} overdue` : ''}`, to: 'invoices' },
        { label: 'Out on memo', value: money0(s.out_on_memo_value), note: `${plural(s.open_memos, 'open memo')}${s.memos_overdue ? ` · ${s.memos_overdue} overdue` : ''}`, to: 'memos' },
        { label: 'Unpaid vendor bills', value: money0(s.unpaid_purchases ?? 0), note: plural(s.unpaid_purchases_count, 'bill'), to: 'purchases' },
        { label: 'Sales this month', value: money0(s.sales_month ?? 0), note: `same month last year ${money0(s.sales_month_last_year)}`, to: 'invoices' },
        { label: 'Inventory on hand (owned)', value: money0(s.stock_cost), note: `${plural(s.stock_count, 'stone')} · ${Number(s.stock_carats).toFixed(2)} ct${s.stock_memo_in ? ` · +${s.stock_memo_in} memo-in` : ''}`, to: 'stock' },
        { label: 'Inbox', value: String(s.inbox), note: s.inbox ? 'photos waiting for review' : 'nothing waiting', to: 'inbox' },
      ]
    : []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greet}, {first}</h1>
          <div className="sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · New York {new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}</div>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid actions" style={{ marginBottom: 22 }}>
        <Snap big />
        {QUICK.map((q) => (
          <button key={q.label} className="qa" disabled={!q.to} onClick={() => q.to && go(q.to)} title={q.stage ? `Coming in stage ${q.stage}` : ''}>
            <span className="ico"><Icon name={q.icon} /></span>
            <span className="t">{q.label}</span>
            {q.stage && <span className="s">Stage {q.stage}</span>}
          </button>
        ))}
      </div>

      <div className="grid tiles" style={{ marginBottom: 22 }}>
        {s ? tiles.map((t) => (
          <div key={t.label} className={'card tile' + (t.pending ? ' pending' : '')} style={t.to ? { cursor: 'pointer' } : undefined} onClick={() => t.to && go(t.to)}>
            <div className="label">{t.label}</div>
            <div className="value num">{t.value}</div>
            <div className="note">{t.note}</div>
          </div>
        )) : <div className="loading">Loading…</div>}
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h2>Activity</h2><span className="faint small">Diamond software + TD Memo app</span></div>
          {feed === null ? <div className="loading">Loading…</div> : feed.length === 0 ? (
            <div className="empty"><div className="big">Nothing yet</div>Changes by anyone on the team show up here.</div>
          ) : (
            <ul className="feed">
              {feed.map((f, i) => (
                <li key={i} style={['account', 'item', 'doc', 'ledger'].includes(f.entity) && f.entity_id ? { cursor: 'pointer' } : undefined}
                    onClick={() => f.entity_id && (f.entity === 'account' ? go('accounts/' + f.entity_id) : f.entity === 'item' ? go('stock/' + f.entity_id) : (f.entity === 'doc' ? go('docs/' + f.entity_id) : f.entity === 'ledger' ? go('invoices/' + f.entity_id) : null))}>
                  <span className="dot">{personName(f.actor, team).slice(0, 2).toUpperCase()}</span>
                  <div>
                    <div className="what">{personName(f.actor, team)} {ACTION_WORD[f.action] ?? f.action.toLowerCase()} {f.ref}</div>
                    {f.summary && f.action !== 'CREATE' && <div className="detail">{readableChanges(f.summary)}</div>}
                  </div>
                  <span className="time">{ago(f.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid" style={{ gap: 16 }}>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Building in stages</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li><b style={{ color: 'var(--text)' }}>Foundation &amp; accounts</b> · live</li>
              <li><b style={{ color: 'var(--text)' }}>Inventory</b> · live</li>
              <li><b style={{ color: 'var(--text)' }}>Memos &amp; memo-in</b> · live (with parcels, mixing, jewelry)</li>
              <li><b style={{ color: 'var(--text)' }}>Sales &amp; payments</b> · live</li>
              <li><b style={{ color: 'var(--text)' }}>Purchasing, vendor bills, partnership</b> · live</li>
              <li>Matching diamonds &amp; gemstones</li>
              <li>Reports &amp; profit (owner)</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, downloadCsv, money } from '../lib/format'
import { useApp } from '../components/ui'
import { AccountPicker } from '../components/Pickers'

type Row = Record<string, string | number | null>
type Fmt = 'text' | 'money' | 'ct' | 'int' | 'date' | 'pct'
type Col = { key: string; label: string; fmt?: Fmt; total?: boolean; link?: (r: Row) => string | null; warn?: (r: Row) => boolean }
type View = { id: string; label: string; cols: Col[]; group?: (rows: Row[]) => Row[] }
type Def = { id: string; label: string; source: string; params?: Row; dates: boolean; account?: string; note: string; views: View[]; extra?: 'inventory' | 'payments' }

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v))
const r2 = (x: number) => Math.round(x * 100) / 100
const docLink = (r: Row) => (r.doc_id ? (String(r.kind).includes('invoice') ? '#/invoices/' : '#/purchases/') + r.doc_id : null)
const itemLink = (r: Row) => (r.item_id ? '#/stock/' + r.item_id : null)
const accLink = (r: Row) => (r.account_id ? '#/accounts/' + r.account_id : null)
const margin = (r: Row) => (n(r.amount) ? r2((n(r.td_profit) / n(r.amount)) * 100) : null)
const KIND: Record<string, string> = { invoice: 'Invoice', credit_invoice: 'Credit', purchase: 'Purchase', credit_purchase: 'Return', unapplied: 'Unapplied payment', white_diamond: 'White diamond', parcel: 'Parcel', jewelry: 'Jewelry', in: 'Received', out: 'Paid' }

/** Sum the numeric keys of rows that share a group key. */
function groupBy(rows: Row[], key: (r: Row) => string, base: (r: Row) => Row, sums: string[]): Row[] {
  const m = new Map<string, Row>()
  for (const r of rows) {
    const k = key(r)
    const g = m.get(k) ?? { ...base(r), count: 0, ...Object.fromEntries(sums.map((s) => [s, 0])) }
    g.count = n(g.count) + (r.line == null || n(r.line) === 1 ? 1 : 0)
    for (const s of sums) g[s] = r2(n(g[s]) + n(r[s]))
    m.set(k, g)
  }
  return [...m.values()]
}
const withMargin = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, margin: margin(r) }))
const AGE = (rows: Row[]) => {
  const m = new Map<string, Row>()
  for (const r of rows) {
    const g = m.get(String(r.account_id)) ?? { account_id: r.account_id, account: r.account, current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, credits: 0, balance: 0 }
    const b = n(r.balance), o = n(r.overdue)
    if (b < 0) g.credits = r2(n(g.credits) + b)
    else g[o === 0 ? 'current' : o <= 30 ? 'd30' : o <= 60 ? 'd60' : o <= 90 ? 'd90' : 'd90p'] = r2(n(g[o === 0 ? 'current' : o <= 30 ? 'd30' : o <= 60 ? 'd60' : o <= 90 ? 'd90' : 'd90p']) + b)
    g.balance = r2(n(g.balance) + b)
    m.set(String(r.account_id), g)
  }
  return [...m.values()].sort((a, b) => n(b.balance) - n(a.balance))
}
const AGE_COLS: Col[] = [
  { key: 'account', label: 'Account', link: accLink }, { key: 'current', label: 'Not due', fmt: 'money', total: true },
  { key: 'd30', label: '1–30', fmt: 'money', total: true }, { key: 'd60', label: '31–60', fmt: 'money', total: true },
  { key: 'd90', label: '61–90', fmt: 'money', total: true }, { key: 'd90p', label: 'Over 90', fmt: 'money', total: true, warn: (r) => n(r.d90p) > 0 },
  { key: 'credits', label: 'Credits', fmt: 'money', total: true }, { key: 'balance', label: 'Balance', fmt: 'money', total: true },
]
const AGE_DETAIL: Col[] = [
  { key: 'account', label: 'Account', link: accLink }, { key: 'kind', label: 'Type' }, { key: 'doc_no', label: '#', link: docLink },
  { key: 'vendor_doc', label: 'Vendor #' }, { key: 'date', label: 'Date', fmt: 'date' }, { key: 'due', label: 'Due', fmt: 'date' },
  { key: 'overdue', label: 'Days overdue', fmt: 'int', warn: (r) => n(r.overdue) > 60 }, { key: 'total', label: 'Amount', fmt: 'money', total: true },
  { key: 'balance', label: 'Balance', fmt: 'money', total: true },
]

const REPORTS: Def[] = [
  { id: 'profit', label: 'Sales & profit', source: 'sales', dates: true, account: 'Customer', note: 'Invoices less credits. TD profit takes partners’ shares and TD-only extra costs into account.',
    views: [
      { id: 'invoice', label: 'By invoice', group: (rows) => withMargin(groupBy(rows, (r) => String(r.doc_id), (r) => ({ doc_id: r.doc_id, kind: r.kind, doc_no: r.doc_no, date: r.date, account_id: r.account_id, account: r.account }), ['carat', 'amount', 'cost', 'td_profit'])),
        cols: [{ key: 'date', label: 'Date', fmt: 'date' }, { key: 'kind', label: 'Type' }, { key: 'doc_no', label: '#', link: docLink }, { key: 'account', label: 'Customer', link: accLink },
          { key: 'carat', label: 'Carats', fmt: 'ct', total: true }, { key: 'amount', label: 'Sales', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true },
          { key: 'td_profit', label: 'TD profit', fmt: 'money', total: true, warn: (r) => n(r.td_profit) < 0 }, { key: 'margin', label: 'Margin', fmt: 'pct' }] },
      { id: 'customer', label: 'By customer', group: (rows) => withMargin(groupBy(rows, (r) => String(r.account_id), (r) => ({ account_id: r.account_id, account: r.account }), ['carat', 'amount', 'cost', 'td_profit'])).sort((a, b) => n(b.amount) - n(a.amount)),
        cols: [{ key: 'account', label: 'Customer', link: accLink }, { key: 'count', label: 'Invoices', fmt: 'int', total: true }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true },
          { key: 'amount', label: 'Sales', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true }, { key: 'td_profit', label: 'TD profit', fmt: 'money', total: true }, { key: 'margin', label: 'Margin', fmt: 'pct' }] },
      { id: 'month', label: 'By month', group: (rows) => withMargin(groupBy(rows, (r) => String(r.date).slice(0, 7), (r) => ({ month: String(r.date).slice(0, 7) }), ['carat', 'amount', 'cost', 'td_profit'])),
        cols: [{ key: 'month', label: 'Month' }, { key: 'count', label: 'Invoices', fmt: 'int', total: true }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true },
          { key: 'amount', label: 'Sales', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true }, { key: 'td_profit', label: 'TD profit', fmt: 'money', total: true }, { key: 'margin', label: 'Margin', fmt: 'pct' }] },
      { id: 'lines', label: 'By stone', group: withMargin,
        cols: [{ key: 'date', label: 'Date', fmt: 'date' }, { key: 'doc_no', label: 'Inv #', link: docLink }, { key: 'account', label: 'Customer', link: accLink }, { key: 'descr', label: 'Item', link: itemLink },
          { key: 'carat', label: 'Ct', fmt: 'ct', total: true }, { key: 'amount', label: 'Sale', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true },
          { key: 'td_profit', label: 'TD profit', fmt: 'money', total: true, warn: (r) => n(r.td_profit) < 0 }, { key: 'margin', label: 'Margin', fmt: 'pct' }, { key: 'partner', label: 'Partner' }] },
    ] },
  { id: 'inventory', label: 'Inventory', source: 'inventory', dates: false, account: 'Supplier or partner', extra: 'inventory', note: 'Stock on hand today (in the office and out on memo), at cost. TD cost = TD’s share for partnership stones.',
    views: [
      { id: 'kind', label: 'Summary', group: (rows) => groupBy(rows, (r) => String(r.kind), (r) => ({ kind: r.kind }), ['pcs', 'carat', 'cost', 'td_cost', 'ask']),
        cols: [{ key: 'kind', label: 'Type' }, { key: 'count', label: 'Items', fmt: 'int', total: true }, { key: 'pcs', label: 'Pcs', fmt: 'int', total: true }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true },
          { key: 'cost', label: 'Cost', fmt: 'money', total: true }, { key: 'td_cost', label: 'TD cost', fmt: 'money', total: true }, { key: 'ask', label: 'Asking', fmt: 'money', total: true }] },
      { id: 'items', label: 'Items',
        cols: [{ key: 'descr', label: 'Item', link: itemLink }, { key: 'kind', label: 'Type' }, { key: 'carat', label: 'Ct', fmt: 'ct', total: true }, { key: 'status', label: 'Where' },
          { key: 'cost', label: 'Cost', fmt: 'money', total: true }, { key: 'td_cost', label: 'TD cost', fmt: 'money', total: true }, { key: 'ask', label: 'Asking', fmt: 'money', total: true },
          { key: 'days', label: 'Days owned', fmt: 'int', warn: (r) => n(r.days) > 365 }, { key: 'supplier', label: 'Supplier' }, { key: 'partner', label: 'Partner' }] },
    ] },
  { id: 'ar', label: 'Customers owe (A/R)', source: 'ar', dates: false, account: 'Customer', note: 'Open invoices by how many days past the due date. Credits include open credits and unapplied payments.',
    views: [{ id: 'aging', label: 'Aging', group: AGE, cols: AGE_COLS }, { id: 'detail', label: 'Detail', cols: AGE_DETAIL }] },
  { id: 'ap', label: 'TD owes suppliers (A/P)', source: 'ap', dates: false, account: 'Supplier', note: 'Unpaid vendor bills by how many days past the due date.',
    views: [{ id: 'aging', label: 'Aging', group: AGE, cols: AGE_COLS }, { id: 'detail', label: 'Detail', cols: AGE_DETAIL }] },
  { id: 'purchases', label: 'Purchases', source: 'purchases', dates: true, account: 'Supplier', note: 'Purchases less returns to suppliers.',
    views: [
      { id: 'docs', label: 'By purchase', cols: [{ key: 'date', label: 'Date', fmt: 'date' }, { key: 'kind', label: 'Type' }, { key: 'doc_no', label: '#', link: docLink }, { key: 'account', label: 'Supplier', link: accLink },
        { key: 'vendor_doc', label: 'Vendor inv #' }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true }, { key: 'total', label: 'Amount', fmt: 'money', total: true },
        { key: 'paid', label: 'Paid', fmt: 'money', total: true }, { key: 'balance', label: 'Balance', fmt: 'money', total: true }] },
      { id: 'supplier', label: 'By supplier', group: (rows) => groupBy(rows, (r) => String(r.account_id), (r) => ({ account_id: r.account_id, account: r.account }), ['carat', 'total', 'paid', 'balance']).sort((a, b) => n(b.total) - n(a.total)),
        cols: [{ key: 'account', label: 'Supplier', link: accLink }, { key: 'count', label: 'Purchases', fmt: 'int', total: true }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true },
          { key: 'total', label: 'Amount', fmt: 'money', total: true }, { key: 'paid', label: 'Paid', fmt: 'money', total: true }, { key: 'balance', label: 'Balance', fmt: 'money', total: true }] },
    ] },
  { id: 'memos_out', label: 'Out on memo', source: 'memos_out', dates: false, account: 'Customer', note: 'Stones customers have on memo now.',
    views: [
      { id: 'lines', label: 'Detail', cols: [{ key: 'account', label: 'Customer', link: accLink }, { key: 'doc_no', label: 'Memo #', link: (r) => '#/memos/' + r.doc_id }, { key: 'date', label: 'Date', fmt: 'date' },
        { key: 'days', label: 'Days out', fmt: 'int', warn: (r) => n(r.days) > 30 }, { key: 'descr', label: 'Item', link: itemLink }, { key: 'carat', label: 'Ct', fmt: 'ct', total: true },
        { key: 'amount', label: 'Memo price', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true }] },
      { id: 'customer', label: 'By customer', group: (rows) => groupBy(rows, (r) => String(r.account_id), (r) => ({ account_id: r.account_id, account: r.account }), ['carat', 'amount', 'cost']).sort((a, b) => n(b.cost) - n(a.cost)),
        cols: [{ key: 'account', label: 'Customer', link: accLink }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true }, { key: 'amount', label: 'Memo price', fmt: 'money', total: true }, { key: 'cost', label: 'Cost', fmt: 'money', total: true }] },
    ] },
  { id: 'memo_in', label: 'Memo-in', source: 'memo_in', dates: false, account: 'Supplier', note: 'Stones suppliers gave TD on memo, still open.',
    views: [
      { id: 'lines', label: 'Detail', cols: [{ key: 'account', label: 'Supplier', link: accLink }, { key: 'doc_no', label: 'Memo-in #', link: (r) => '#/memo-in/' + r.doc_id }, { key: 'vendor_doc', label: 'Their memo #' },
        { key: 'date', label: 'Date', fmt: 'date' }, { key: 'days', label: 'Days', fmt: 'int', warn: (r) => n(r.days) > 30 }, { key: 'descr', label: 'Item', link: itemLink },
        { key: 'status', label: 'Where' }, { key: 'carat', label: 'Ct', fmt: 'ct', total: true }, { key: 'amount', label: 'Memo price', fmt: 'money', total: true }] },
      { id: 'supplier', label: 'By supplier', group: (rows) => groupBy(rows, (r) => String(r.account_id), (r) => ({ account_id: r.account_id, account: r.account }), ['carat', 'amount']).sort((a, b) => n(b.amount) - n(a.amount)),
        cols: [{ key: 'account', label: 'Supplier', link: accLink }, { key: 'carat', label: 'Carats', fmt: 'ct', total: true }, { key: 'amount', label: 'Memo price', fmt: 'money', total: true }] },
    ] },
  { id: 'payments', label: 'Payments', source: 'payments', dates: true, account: 'Account', extra: 'payments', note: 'Payments received from customers and paid to suppliers.',
    views: [{ id: 'list', label: 'Detail', cols: [{ key: 'date', label: 'Date', fmt: 'date' }, { key: 'kind', label: 'Type' }, { key: 'doc_no', label: '#', link: (r) => (r.kind === 'in' ? '#/payments-in/' : '#/payments-out/') + r.pay_id },
      { key: 'account', label: 'Account', link: accLink }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Ref' }, { key: 'status', label: 'Status', warn: (r) => r.status !== 'ok' },
      { key: 'amount', label: 'Amount', fmt: 'money', total: true }, { key: 'unapplied', label: 'Unapplied', fmt: 'money', total: true }] }] },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)
function preset(p: string): [string, string] {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth()
  if (p === 'month') return [iso(new Date(Date.UTC(y, m, 1))), iso(t)]
  if (p === 'last_month') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))]
  if (p === 'year') return [`${y}-01-01`, iso(t)]
  if (p === 'last_year') return [`${y - 1}-01-01`, `${y - 1}-12-31`]
  return [iso(new Date(Date.UTC(y - 1, m, t.getDate() + 1))), iso(t)]
}
const PRESETS: [string, string][] = [['month', 'This month'], ['last_month', 'Last month'], ['year', 'This year'], ['last_year', 'Last year'], ['12m', 'Last 12 months']]

function fmt(c: Col, v: unknown) {
  if (v == null || v === '') return ''
  if (c.fmt === 'money') return money(Number(v))
  if (c.fmt === 'ct') return Number(v).toFixed(2)
  if (c.fmt === 'int') return String(Math.round(Number(v)))
  if (c.fmt === 'pct') return Number(v).toFixed(1) + '%'
  if (c.fmt === 'date') return day(String(v))
  if (c.key === 'kind' || c.key === 'status') return KIND[String(v)] ?? String(v).replace(/_/g, ' ')
  return String(v)
}

/** Owner-only reports: pick a report, filter, view, print (A4 landscape) or export to CSV. */
export default function Reports() {
  const { me } = useApp()
  const [rid, setRid] = useState('profit')
  const def = REPORTS.find((r) => r.id === rid)!
  const [vid, setVid] = useState(def.views[0].id)
  const view = def.views.find((v) => v.id === vid) ?? def.views[0]
  const [pre, setPre] = useState('month')
  const [[from, to], setRange] = useState(preset('month'))
  const [acc, setAcc] = useState<{ id: string; company: string } | null>(null)
  const [kind, setKind] = useState('all')
  const [memoIn, setMemoIn] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  useEffect(() => {
    if (me.role !== 'owner') return
    setRows(null); setErr(null)
    const p: Row = { account_id: acc?.id ?? '', kind: def.extra ? kind : '', memo_in: memoIn ? 'true' : 'false', ...(def.dates ? { from, to } : {}) }
    supabase.rpc('report', { p_name: def.source, p }).then(({ data, error }) => (error ? setErr(errText(error)) : setRows((data ?? []) as Row[])))
  }, [rid, from, to, acc?.id, kind, memoIn])

  const shown = useMemo(() => {
    if (!rows) return null
    const out = view.group ? view.group(rows) : rows
    if (!sort) return out
    return [...out].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key]
      return (typeof x === 'number' || typeof y === 'number' ? n(x) - n(y) : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir
    })
  }, [rows, view, sort])
  const totals = useMemo(() => {
    const t: Row = {}
    for (const c of view.cols) if (c.total) t[c.key] = r2((shown ?? []).reduce((a, r) => a + n(r[c.key]), 0))
    if (view.cols.some((c) => c.key === 'margin')) t.margin = margin(t)
    return t
  }, [shown, view])

  if (me.role !== 'owner') return <div className="empty"><div className="big">Owner only</div>Reports are available to the owner.</div>

  function pick(id: string) { const d = REPORTS.find((r) => r.id === id)!; setRid(id); setVid(d.views[0].id); setSort(null); setKind('all') }
  const filterText = [def.dates && `${day(from)} – ${day(to)}`, acc && `${def.account}: ${acc.company}`, def.extra === 'inventory' && kind !== 'all' && KIND[kind], def.extra === 'inventory' && memoIn && 'incl. memo-in', def.extra === 'payments' && kind !== 'all' && KIND[kind]].filter(Boolean).join(' · ')
  function csv() {
    downloadCsv(`TD ${def.label} - ${view.label} ${def.dates ? from + ' to ' + to : iso(new Date())}.csv`,
      [view.cols.map((c) => c.label), ...(shown ?? []).map((r) => view.cols.map((c) => (c.fmt && c.fmt !== 'date' && c.fmt !== 'text' ? (r[c.key] == null ? '' : Number(r[c.key])) : fmt(c, r[c.key])))),
        view.cols.map((c, i) => (i === 0 ? 'Total' : totals[c.key] ?? ''))])
  }

  return (
    <>
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } .rep-table { font-size: 9.5pt; } .rep-table td, .rep-table th { padding: 3px 6px !important; } }'}</style>
      <div className="page-head no-print">
        <div><h1>Reports</h1><div className="sub">Owner only. Print saves as PDF (A4 landscape).</div></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={csv} disabled={!shown?.length}>Excel / CSV</button>
          <button className="btn primary" onClick={() => window.print()} disabled={!shown}>Print / PDF</button>
        </div>
      </div>

      <div className="row no-print" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {REPORTS.map((r) => <button key={r.id} className={'chip' + (r.id === rid ? ' on' : '')} onClick={() => pick(r.id)}>{r.label}</button>)}
      </div>

      <div className="card card-pad no-print" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {def.dates && <>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {PRESETS.map(([k, l]) => <button key={k} className={'chip' + (pre === k ? ' on' : '')} onClick={() => { setPre(k); setRange(preset(k)) }}>{l}</button>)}
            </div>
            <label className="f">From<input className="input" type="date" value={from} onChange={(e) => { setPre(''); setRange([e.target.value, to]) }} /></label>
            <label className="f">To<input className="input" type="date" value={to} onChange={(e) => { setPre(''); setRange([from, e.target.value]) }} /></label>
          </>}
          {def.account && <div style={{ width: 260 }}><AccountPicker label={def.account} value={acc?.id ?? ''} onChange={(a) => setAcc(a)} /></div>}
          {def.extra === 'inventory' && <>
            <label className="f">Type<select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All</option><option value="white_diamond">White diamonds</option><option value="parcel">Parcels</option><option value="jewelry">Jewelry</option></select></label>
            <label className="row" style={{ gap: 6, paddingBottom: 8 }}><input type="checkbox" checked={memoIn} onChange={(e) => setMemoIn(e.target.checked)} /> Include memo-in</label>
          </>}
          {def.extra === 'payments' && <label className="f">Type<select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All</option><option value="in">Received from customers</option><option value="out">Paid to suppliers</option></select></label>}
        </div>
      </div>

      {def.views.length > 1 && <div className="tabs no-print">{def.views.map((v) => <button key={v.id} className={v.id === view.id ? 'on' : ''} onClick={() => { setVid(v.id); setSort(null) }}>{v.label}</button>)}</div>}

      <div className="print-only" style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: '14pt' }}>TD Diamonds — {def.label}{def.views.length > 1 ? ` (${view.label})` : ''}</div>
        <div style={{ fontSize: '9pt' }}>{filterText || 'All'} · printed {day(iso(new Date()))}</div>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-head no-print"><h2>{def.label}{filterText ? <span className="faint small" style={{ fontWeight: 400, marginLeft: 10 }}>{filterText}</span> : null}</h2>
          <span className="faint small">{shown ? `${shown.length} row${shown.length === 1 ? '' : 's'}` : ''}</span></div>
        {shown === null ? <div className="loading">Loading…</div> : shown.length === 0 ? <div className="empty"><div className="big">Nothing to show</div>No records match these filters.</div> : (
          <div className="table-wrap"><table className="t rep-table">
            <thead><tr>{view.cols.map((c) => (
              <th key={c.key} className={c.fmt && c.fmt !== 'date' && c.fmt !== 'text' ? 'r' : ''} style={{ cursor: 'pointer' }}
                onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.fmt && c.fmt !== 'text' && c.fmt !== 'date' ? -1 : 1 })}>
                {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>))}</tr></thead>
            <tbody>{shown.map((r, i) => (
              <tr key={i} style={{ cursor: 'default' }}>{view.cols.map((c) => {
                const v = fmt(c, r[c.key]), href = c.link?.(r)
                return <td key={c.key} className={(c.fmt && c.fmt !== 'date' && c.fmt !== 'text' ? 'r num ' : '') + (c.fmt === 'date' ? 'nw' : '')}
                  style={c.warn?.(r) ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{href && v ? <a href={href}>{v}</a> : v}</td>
              })}</tr>))}
            </tbody>
            <tfoot><tr>{view.cols.map((c, i) => <td key={c.key} className={c.fmt && c.fmt !== 'date' && c.fmt !== 'text' ? 'r num' : ''} style={{ fontWeight: 700, borderTop: '2px solid var(--line-strong)' }}>
              {i === 0 ? 'Total' : totals[c.key] != null ? fmt(c, totals[c.key]) : ''}</td>)}</tr></tfoot>
          </table></div>
        )}
      </div>
      <div className="faint small" style={{ marginTop: 8 }}>{def.note}</div>
    </>
  )
}

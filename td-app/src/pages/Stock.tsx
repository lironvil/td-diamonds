import { useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { downloadCsv, money, money0 } from '../lib/format'
import { go } from '../lib/router'
import { Icon } from '../components/ui'
import Snap from '../components/Snap'
import { CLARITIES, COLORS, SHAPES, fmtPct, rapPct, statusLabel, type Item } from '../lib/stock'

type Acc = { id: string; company: string }
const VIEWS: { key: string; label: string; test: (i: Item) => boolean }[] = [
  { key: 'stock', label: 'In stock', test: (i) => i.status === 'available' || i.status === 'on_memo' },
  { key: 'available', label: 'Available', test: (i) => i.status === 'available' && !i.held_for },
  { key: 'held', label: 'Held', test: (i) => i.status === 'available' && !!i.held_for },
  { key: 'memo_in', label: 'Memo-in', test: (i) => (i.status === 'available' || i.status === 'on_memo') && i.ownership === 'memo_in' },
  { key: 'owned', label: 'Owned', test: (i) => (i.status === 'available' || i.status === 'on_memo') && i.ownership === 'owned' },
  { key: 'archived', label: 'Archived', test: (i) => i.status === 'archived' },
  { key: 'all', label: 'All', test: () => true },
]
function prefs() { try { return JSON.parse(localStorage.getItem('td-stock-view') || '{}') } catch { return {} } }

export default function Stock() {
  const p = prefs()
  const [rows, setRows] = useState<Item[] | null>(null)
  const [accs, setAccs] = useState<Acc[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [view, setView] = useState<string>(p.view ?? 'stock')
  const [shapes, setShapes] = useState<string[]>([])
  const [ctMin, setCtMin] = useState(''); const [ctMax, setCtMax] = useState('')
  const [colFrom, setColFrom] = useState(''); const [colTo, setColTo] = useState('')
  const [clFrom, setClFrom] = useState(''); const [clTo, setClTo] = useState('')
  const [more, setMore] = useState(false)
  const [sort, setSort] = useState<{ key: keyof Item; dir: 1 | -1 }>(p.sort ?? { key: 'stock_no', dir: -1 })

  useEffect(() => {
    supabase.from('items').select('*').eq('kind', 'white_diamond').order('stock_no', { ascending: false }).limit(5000)
      .then(({ data, error }) => (error ? setErr(errText(error)) : setRows(data as Item[])))
    supabase.from('accounts').select('id,company').then(({ data }) => setAccs(data ?? []))
  }, [])
  useEffect(() => { try { localStorage.setItem('td-stock-view', JSON.stringify({ view, sort })) } catch { /* ignore */ } }, [view, sort])

  const supplier = (id: string | null) => accs.find((a) => a.id === id)?.company ?? ''
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, (rows ?? []).filter(v.test).length])), [rows])

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const v = VIEWS.find((x) => x.key === view) ?? VIEWS[0]
    const ci = (c: string) => COLORS.indexOf(c.toUpperCase())
    const li = (c: string) => CLARITIES.indexOf(c)
    const out = (rows ?? []).filter((i) => {
      if (!v.test(i)) return false
      if (shapes.length && !shapes.includes(i.shape)) return false
      if (ctMin && i.carat < Number(ctMin)) return false
      if (ctMax && i.carat > Number(ctMax)) return false
      if (colFrom && (ci(i.color) < 0 || ci(i.color) < ci(colFrom))) return false
      if (colTo && (ci(i.color) < 0 || ci(i.color) > ci(colTo))) return false
      if (clFrom && (li(i.clarity) < 0 || li(i.clarity) < li(clFrom))) return false
      if (clTo && (li(i.clarity) < 0 || li(i.clarity) > li(clTo))) return false
      if (!words.length) return true
      const hay = [i.stock_no, i.cert_no, i.vendor_stock, i.vendor_doc, i.shape, i.color, i.clarity, i.held_for, supplier(i.supplier_id), i.remarks].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    const k = sort.key
    out.sort((a, b) => {
      const av = a[k] ?? '', bv = b[k] ?? ''
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })) * sort.dir
    })
    return out
  }, [rows, q, view, shapes, ctMin, ctMax, colFrom, colTo, clFrom, clTo, sort, accs])

  // Exact stock # or certificate typed → open it straight away on Enter.
  function onEnter() {
    const t = q.trim()
    const hit = (rows ?? []).find((i) => String(i.stock_no) === t || (i.cert_no && i.cert_no === t))
    if (hit) go('stock/' + hit.id)
  }

  const tot = list.reduce((a, i) => ({ ct: a.ct + Number(i.carat || 0), cost: a.cost + Number(i.cost_total || 0), ask: a.ask + Number(i.ask_total || 0) }), { ct: 0, cost: 0, ask: 0 })
  const th = (key: keyof Item, label: string, cls = '') => (
    <th className={cls} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</th>
  )
  const filtersOn = shapes.length + [ctMin, ctMax, colFrom, colTo, clFrom, clTo].filter(Boolean).length

  function exportCsv() {
    downloadCsv('td-white-diamonds.csv', [
      ['Stock#', 'Shape', 'Carat', 'Color', 'Clarity', 'Cut', 'Polish', 'Symmetry', 'Fluor', 'Lab', 'Cert#', 'Measurements', 'Depth%', 'Table%', 'Rap/ct', 'Cost/ct', 'Cost total', 'Ask/ct', 'Ask total', 'Ask Rap%', 'Status', 'Held for', 'Ownership', 'Supplier', 'Vendor stock', 'Vendor doc', 'Location'],
      ...list.map((i) => [i.stock_no, i.shape, i.carat, i.color, i.clarity, i.cut, i.polish, i.symmetry, i.fluorescence, i.lab, i.cert_no, i.measurements, i.depth_pct, i.table_pct,
        i.rap_ct, i.cost_ct, i.cost_total, i.ask_ct, i.ask_total, rapPct(i.ask_ct, i.rap_ct), statusLabel(i), i.held_for, i.ownership === 'memo_in' ? 'Memo-in' : 'Owned', supplier(i.supplier_id), i.vendor_stock, i.vendor_doc, i.location]),
    ])
  }

  return (
    <>
      <div className="page-head">
        <div><h1>White diamonds</h1><div className="sub">Single stones: owned and memo-in</div></div>
        <div className="row">
          <button className="btn" onClick={exportCsv} disabled={!list.length}><Icon name="download" /> Export</button>
          <a className="btn" href="#/stock/new"><Icon name="plus" /> Type in</a>
          <Snap label="Snap document" />
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="card">
        <div className="card-pad" style={{ display: 'grid', gap: 12, borderBottom: '1px solid var(--line)' }}>
          <div className="row">
            <div className="search" style={{ flex: '1 1 280px' }}>
              <Icon name="search" />
              <input className="input" placeholder="Stock #, GIA #, vendor, supplier, held for… (Enter opens an exact match)" value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} autoFocus />
            </div>
            <button className={'btn' + (filtersOn ? ' primary' : '')} onClick={() => setMore(!more)}>Filters{filtersOn ? ` (${filtersOn})` : ''}</button>
          </div>
          <div className="chips">
            {VIEWS.map((v) => (
              <button key={v.key} className={'chip' + (view === v.key ? ' on' : '')} onClick={() => setView(v.key)}>{v.label}<span className="count">{counts[v.key] ?? 0}</span></button>
            ))}
          </div>
          {more && (
            <div className="grid" style={{ gap: 12 }}>
              <div className="chips">
                {SHAPES.map((s) => (
                  <button key={s} className={'chip' + (shapes.includes(s) ? ' on' : '')} onClick={() => setShapes(shapes.includes(s) ? shapes.filter((x) => x !== s) : [...shapes, s])}>{s}</button>
                ))}
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                <label className="f">Carat from<input className="input" inputMode="decimal" value={ctMin} onChange={(e) => setCtMin(e.target.value)} /></label>
                <label className="f">Carat to<input className="input" inputMode="decimal" value={ctMax} onChange={(e) => setCtMax(e.target.value)} /></label>
                <label className="f">Color from<select className="input" value={colFrom} onChange={(e) => setColFrom(e.target.value)}><option value="">Any</option>{COLORS.slice(0, 14).map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="f">Color to<select className="input" value={colTo} onChange={(e) => setColTo(e.target.value)}><option value="">Any</option>{COLORS.slice(0, 14).map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="f">Clarity from<select className="input" value={clFrom} onChange={(e) => setClFrom(e.target.value)}><option value="">Any</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="f">Clarity to<select className="input" value={clTo} onChange={(e) => setClTo(e.target.value)}><option value="">Any</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              </div>
              {filtersOn > 0 && <div><button className="btn sm ghost" onClick={() => { setShapes([]); setCtMin(''); setCtMax(''); setColFrom(''); setColTo(''); setClFrom(''); setClTo('') }}>Clear filters</button></div>}
            </div>
          )}
        </div>

        {rows === null ? <div className="loading">Loading…</div> : list.length === 0 ? (
          <div className="empty">
            <div className="big">{rows.length ? 'No matches' : 'No stones yet'}</div>
            {rows.length ? 'Try a different search or filter.' : 'Snap a GIA certificate, memo or invoice, or type a stone in.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  {th('stock_no', 'Stock #')}
                  {th('shape', 'Shape')}
                  {th('carat', 'Ct', 'r')}
                  {th('color', 'Col')}
                  {th('clarity', 'Clar')}
                  <th className="hide-sm">Cut/Pol/Sym</th>
                  {th('fluorescence', 'Fluor', 'hide-sm')}
                  {th('cert_no', 'Lab #', 'hide-sm')}
                  {th('cost_ct', 'Cost/ct', 'r hide-sm')}
                  {th('cost_total', 'Cost', 'r')}
                  {th('ask_ct', 'Ask/ct', 'r hide-sm')}
                  <th className="r hide-sm">Ask Rap</th>
                  <th>Status</th>
                  <th className="hide-sm">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className={i.status === 'available' || i.status === 'on_memo' ? '' : 'inactive'} onClick={() => go('stock/' + i.id)}>
                    <td className="num"><b style={{ fontWeight: 600 }}>{i.stock_no}</b></td>
                    <td>{i.shape}</td>
                    <td className="r num">{Number(i.carat).toFixed(2)}</td>
                    <td>{i.color || '—'}</td>
                    <td>{i.clarity || '—'}</td>
                    <td className="hide-sm nw">{[i.cut, i.polish, i.symmetry].filter(Boolean).join(' / ') || <span className="faint">—</span>}</td>
                    <td className="hide-sm">{i.fluorescence || <span className="faint">—</span>}</td>
                    <td className="hide-sm num nw">{i.cert_no ? `${i.lab} ${i.cert_no}` : <span className="faint">—</span>}</td>
                    <td className="r num hide-sm">{i.cost_ct != null ? money0(i.cost_ct) : '—'}</td>
                    <td className="r num">{i.cost_total != null ? money0(i.cost_total) : '—'}</td>
                    <td className="r num hide-sm">{i.ask_ct != null ? money0(i.ask_ct) : '—'}</td>
                    <td className="r num hide-sm">{fmtPct(rapPct(i.ask_ct, i.rap_ct))}</td>
                    <td className="nw">
                      <span className={'badge' + (i.status === 'available' && !i.held_for ? '' : ' grey')}>{statusLabel(i)}</span>
                      {i.ownership === 'memo_in' && <span className="badge grey">MI</span>}
                    </td>
                    <td className="hide-sm">{supplier(i.supplier_id) || <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={14} className="small">
                  {list.length} stones · {tot.ct.toFixed(2)} ct · cost {money(tot.cost)}{tot.ask ? ` · asking ${money(tot.ask)}` : ''}
                </td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

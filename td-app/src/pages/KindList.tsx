import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { downloadCsv, money, money0 } from '../lib/format'
import { go } from '../lib/router'
import { Icon } from '../components/ui'
import Snap from '../components/Snap'
import { ageClass, daysOwned, statusLabel, type Item } from '../lib/stock'

type Col = { label: string; cls?: string; get: (i: Item) => ReactNode; csv: (i: Item) => string | number | null }
const range = (a: string, b: string) => [a, b].filter(Boolean).join('–')
const onHandCt = (i: Item) => Math.round((Number(i.carat) - Number(i.memo_ct)) * 1000) / 1000

const COLS: Record<'parcel' | 'jewelry', Col[]> = {
  parcel: [
    { label: 'Shape', get: (i) => i.shape, csv: (i) => i.shape },
    { label: 'Size', get: (i) => i.size_cat || '—', csv: (i) => i.size_cat },
    { label: 'Color', get: (i) => range(i.color, i.color_to) || '—', csv: (i) => range(i.color, i.color_to) },
    { label: 'Clarity', get: (i) => range(i.clarity, i.clarity_to) || '—', csv: (i) => range(i.clarity, i.clarity_to) },
    { label: 'Pcs', cls: 'r num', get: (i) => i.pcs, csv: (i) => i.pcs },
    { label: 'Ct', cls: 'r num', get: (i) => Number(i.carat).toFixed(2), csv: (i) => i.carat },
    { label: 'On hand', cls: 'r num', get: (i) => `${i.pcs - i.memo_pcs} / ${onHandCt(i).toFixed(2)}`, csv: (i) => onHandCt(i) },
    { label: 'On memo', cls: 'r num hide-sm', get: (i) => (i.memo_ct > 0 ? `${i.memo_pcs} / ${Number(i.memo_ct).toFixed(2)}` : '—'), csv: (i) => i.memo_ct },
    { label: 'Cost/ct', cls: 'r num', get: (i) => (i.cost_ct != null ? money0(i.cost_ct) : '—'), csv: (i) => i.cost_ct },
    { label: 'Ask/ct', cls: 'r num hide-sm', get: (i) => (i.ask_ct != null ? money0(i.ask_ct) : '—'), csv: (i) => i.ask_ct },
  ],
  jewelry: [
    { label: 'Type', get: (i) => i.jewelry_type, csv: (i) => i.jewelry_type },
    { label: 'Description', get: (i) => i.title || '—', csv: (i) => i.title },
    { label: 'Metal', get: (i) => i.metal || '—', csv: (i) => i.metal },
    { label: 'Style #', cls: 'hide-sm', get: (i) => i.style_no || '—', csv: (i) => i.style_no },
    { label: 'Center', cls: 'hide-sm', get: (i) => (i.center_id ? 'Mounted' : '—'), csv: (i) => (i.center_id ? 'yes' : '') },
    { label: 'Side ct', cls: 'r num hide-sm', get: (i) => (i.side_ct != null ? Number(i.side_ct).toFixed(2) : '—'), csv: (i) => i.side_ct },
    { label: 'Cost', cls: 'r num', get: (i) => (i.cost_total != null ? money0(i.cost_total) : '—'), csv: (i) => i.cost_total },
    { label: 'Asking', cls: 'r num', get: (i) => (i.ask_total != null ? money0(i.ask_total) : '—'), csv: (i) => i.ask_total },
  ],
}

export default function KindList({ kind }: { kind: 'parcel' | 'jewelry' }) {
  const [rows, setRows] = useState<Item[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'stock' | 'memo_in' | 'archived' | 'all'>('stock')
  useEffect(() => {
    setRows(null)
    supabase.from('items').select('*').eq('kind', kind).order('stock_no', { ascending: false }).limit(5000)
      .then(({ data, error }) => (error ? setErr(errText(error)) : setRows(data as Item[])))
  }, [kind])
  const cols = COLS[kind]
  const list = useMemo(() => (rows ?? []).filter((i) => {
    const inStock = i.status === 'available' || i.status === 'on_memo'
    if (view === 'stock' && !inStock) return false
    if (view === 'memo_in' && !(inStock && i.ownership === 'memo_in')) return false
    if (view === 'archived' && i.status !== 'archived') return false
    const w = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hay = [i.stock_no, ...cols.map((c) => c.csv(i)), i.vendor_stock, i.held_for, i.remarks].join(' ').toLowerCase()
    return w.every((x) => hay.includes(x))
  }), [rows, q, view, cols])
  const totCost = list.reduce((a, i) => a + Number(i.cost_total ?? 0), 0)
  const totCt = list.reduce((a, i) => a + Number(i.carat ?? 0), 0)
  const title = kind === 'parcel' ? 'Diamond parcels' : 'Jewelry'

  return (
    <>
      <div className="page-head">
        <div><h1>{title}</h1><div className="sub">{kind === 'parcel' ? 'Lots by pieces and carats; on hand and on memo kept apart' : 'Finished pieces; mount loose diamonds into them'}</div></div>
        <div className="row">
          <button className="btn" disabled={!list.length} onClick={() => downloadCsv(`td-${kind}.csv`, [['Stock#', ...cols.map((c) => c.label), 'Status', 'Ownership'], ...list.map((i) => [i.stock_no, ...cols.map((c) => c.csv(i)), statusLabel(i), i.ownership])])}><Icon name="download" /> Export</button>
          {kind === 'parcel' && <a className="btn" href="#/parcel-mixing/new"><Icon name="chart" /> Mix parcels</a>}
          {kind === 'parcel' && <Snap label="Snap memo/invoice" primary={false} />}
          <a className="btn primary" href={`#/${kind === 'parcel' ? 'parcels' : 'jewelry'}/new`}><Icon name="plus" /> {kind === 'parcel' ? 'New parcel' : 'New piece'}</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-pad row" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="search" style={{ flex: '1 1 240px' }}><Icon name="search" /><input className="input" placeholder="Search stock #, shape, colour, metal…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="chips">
            {([['stock', 'In stock'], ['memo_in', 'Memo-in'], ['archived', kind === 'parcel' ? 'Mixed out / archived' : 'Archived'], ['all', 'All']] as const).map(([k, l]) => (
              <button key={k} className={'chip' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
        </div>
        {rows === null ? <div className="loading">Loading…</div> : list.length === 0 ? <div className="empty"><div className="big">Nothing here yet</div></div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Stock #</th>{cols.map((c) => <th key={c.label} className={c.cls}>{c.label}</th>)}<th className="r">Days owned</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} onClick={() => go('stock/' + i.id)} className={i.status === 'available' || i.status === 'on_memo' ? '' : 'inactive'}>
                    <td className="num"><b style={{ fontWeight: 600 }}>{i.stock_no}</b></td>
                    {cols.map((c) => <td key={c.label} className={c.cls}>{c.get(i)}</td>)}
                    <td className={'r num ' + ageClass(daysOwned(i))}>{daysOwned(i) ?? <span className="faint">—</span>}</td>
                    <td className="nw"><span className={'badge' + (i.status === 'available' && !i.held_for ? '' : ' grey')}>{statusLabel(i)}</span>{i.ownership === 'memo_in' && <span className="badge grey">MI</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={cols.length + 3} className="small">{list.length} · {totCt.toFixed(2)} ct · cost {money(totCost)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

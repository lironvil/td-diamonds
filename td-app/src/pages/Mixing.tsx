import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { ItemPicker } from '../components/Pickers'
import { itemLabel, type Doc } from '../lib/docs'
import { CLARITIES, SHAPES, r2, type Item } from '../lib/stock'

export function MixList() {
  const { team } = useApp()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  useEffect(() => { supabase.from('docs').select('*').eq('kind', 'mix').order('doc_no', { ascending: false }).then(({ data }) => setDocs((data ?? []) as Doc[])) }, [])
  return (
    <>
      <div className="page-head">
        <div><h1>Parcel mixing</h1><div className="sub">Split a parcel or merge several; the cost per carat follows the goods.</div></div>
        <a className="btn primary" href="#/parcel-mixing/new"><Icon name="plus" /> New mix</a>
      </div>
      <div className="card">
        {docs === null ? <div className="loading">Loading…</div> : docs.length === 0 ? <div className="empty"><div className="big">No mixes yet</div></div> : (
          <ul className="feed">
            {docs.map((d) => (
              <li key={d.id} onClick={() => go('docs/' + d.id)} style={{ cursor: 'pointer' }}>
                <span className="dot"><Icon name="chart" /></span>
                <div><div className="what">Mix #{d.doc_no}</div><div className="detail">{d.notes || '—'}</div></div>
                <span className="time">{day(d.doc_date)} · {personName(d.created_by, team)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

type Out = { item: Item; pcs: string; ct: string }
type In = { item: Item | null; pcs: string; ct: string; shape: string; color: string; color_to: string; clarity: string; clarity_to: string; size_cat: string }
const blankIn = (src?: Item): In => ({ item: null, pcs: '', ct: '', shape: src?.shape ?? '', color: src?.color ?? '', color_to: src?.color_to ?? '', clarity: src?.clarity ?? '', clarity_to: src?.clarity_to ?? '', size_cat: src?.size_cat ?? '' })

export function MixNew() {
  const { toast } = useApp()
  const [outs, setOuts] = useState<Out[]>([])
  const [ins, setIns] = useState<In[]>([])
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const n = (s: string) => Number(s.replace(/,/g, '')) || 0
  const moved = r2(outs.reduce((a, o) => a + (n(o.ct) === Number(o.item.carat) ? Number(o.item.cost_total ?? 0) : Number(o.item.cost_ct ?? 0) * n(o.ct)), 0))
  const outCt = outs.reduce((a, o) => a + n(o.ct), 0), inCt = ins.reduce((a, i) => a + n(i.ct), 0)
  const outPcs = outs.reduce((a, o) => a + n(o.pcs), 0), inPcs = ins.reduce((a, i) => a + n(i.pcs), 0)
  const newCpc = inCt > 0 ? r2(moved / inCt) : null
  const setIn = (i: number, k: keyof In, v: string | Item | null) => setIns(ins.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const isParcelOwned = (i: Item) => i.kind === 'parcel' && i.ownership === 'owned' && i.status === 'available'

  async function save() {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('mix_parcels', { p: {
      notes,
      out: outs.map((o) => ({ item_id: o.item.id, pcs: n(o.pcs), carat: n(o.ct) })),
      into: ins.map((i) => (i.item ? { item_id: i.item.id, pcs: n(i.pcs), carat: n(i.ct) }
        : { pcs: n(i.pcs), carat: n(i.ct), new: { shape: i.shape, color: i.color, color_to: i.color_to, clarity: i.clarity, clarity_to: i.clarity_to, size_cat: i.size_cat } })),
    } })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Mix #${data.doc_no} done`); go('docs/' + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/parcel-mixing" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Parcel mixing</a>
      <div className="page-head"><div><h1>New mix</h1><div className="sub">1. Take goods out of parcels. 2. Put them into new or existing parcels. The cost moves with them.</div></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>1 · Out of</h2></div>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <ItemPicker placeholder="Parcel stock #…" filter={isParcelOwned} exclude={outs.map((o) => o.item.id)}
            onPick={(i) => { setOuts([...outs, { item: i, pcs: String(i.pcs - i.memo_pcs), ct: String(r2(Number(i.carat) - Number(i.memo_ct))) }]); if (!ins.length) setIns([blankIn(i)]) }} />
        </div>
        {outs.length > 0 && (
          <div className="table-wrap"><table className="t review">
            <thead><tr><th>Stock #</th><th>Parcel</th><th className="r">On hand</th><th className="r">Pcs out</th><th className="r">Ct out</th><th className="r">Cost/ct</th><th /></tr></thead>
            <tbody>{outs.map((o, i) => (
              <tr key={o.item.id} style={{ cursor: 'default' }}>
                <td>{o.item.stock_no}</td><td>{itemLabel(o.item)}</td>
                <td className="r num">{o.item.pcs - o.item.memo_pcs} / {(Number(o.item.carat) - Number(o.item.memo_ct)).toFixed(2)}</td>
                <td className="r"><input className="input sm num" style={{ width: 64 }} value={o.pcs} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, pcs: e.target.value } : x)))} /></td>
                <td className="r"><input className="input sm num" style={{ width: 76 }} value={o.ct} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, ct: e.target.value } : x)))} /></td>
                <td className="r num">{o.item.cost_ct != null ? money(o.item.cost_ct) : '—'}</td>
                <td><button className="btn ghost danger sm" onClick={() => setOuts(outs.filter((_, j) => j !== i))}><Icon name="x" /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>2 · Into</h2><button className="btn sm" onClick={() => setIns([...ins, blankIn(outs[0]?.item)])}><Icon name="plus" /> Add parcel</button></div>
        {ins.length === 0 ? <div className="empty">Pick a parcel above first.</div> : (
          <div className="sub-rows card-pad">
            {ins.map((x, i) => (
              <div key={i} className="sub-row">
                <div className="f" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Goes to<div style={{ color: 'var(--text)', fontWeight: 600, paddingTop: 6 }}>{x.item ? `#${x.item.stock_no} (existing)` : 'New parcel'}</div></div>
                {!x.item && <>
                <label className="f">Shape<select className="input sm" value={x.shape} onChange={(e) => setIn(i, 'shape', e.target.value)}><option value="">?</option>{[...SHAPES, 'Mixed'].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="f">Size<input className="input sm" value={x.size_cat} onChange={(e) => setIn(i, 'size_cat', e.target.value)} /></label>
                <label className="f">Color from<input className="input sm" value={x.color} onChange={(e) => setIn(i, 'color', e.target.value.toUpperCase())} /></label>
                <label className="f">to<input className="input sm" value={x.color_to} onChange={(e) => setIn(i, 'color_to', e.target.value.toUpperCase())} /></label>
                <label className="f">Clarity from<select className="input sm" value={x.clarity} onChange={(e) => setIn(i, 'clarity', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="f">to<select className="input sm" value={x.clarity_to} onChange={(e) => setIn(i, 'clarity_to', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                </>}
                <label className="f">Pcs<input className="input sm num" value={x.pcs} onChange={(e) => setIn(i, 'pcs', e.target.value)} /></label>
                <label className="f">Ct<input className="input sm num" value={x.ct} onChange={(e) => setIn(i, 'ct', e.target.value)} /></label>
                <button className="btn ghost danger sm" onClick={() => setIns(ins.filter((_, j) => j !== i))}><Icon name="x" /></button>
              </div>
            ))}
                        <div style={{ maxWidth: 420 }}>
              <ItemPicker placeholder="Add to an existing parcel: stock #…" filter={isParcelOwned} exclude={[...outs.map((o) => o.item.id), ...ins.filter((x) => x.item).map((x) => x.item!.id)]}
                onPick={(it) => setIns([...ins, { ...blankIn(it), item: it }])} />
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="row" style={{ gap: 24 }}>
          <div><div className="muted small">Out</div><b>{outPcs} pcs · {outCt.toFixed(2)} ct</b></div>
          <div><div className="muted small">In</div><b style={{ color: Math.abs(inCt - outCt) > 0.001 && inCt > 0 ? 'var(--warn)' : undefined }}>{inPcs} pcs · {inCt.toFixed(2)} ct</b></div>
          <div><div className="muted small">Cost moved</div><b>{money(moved)}</b></div>
          <div><div className="muted small">New cost/ct</div><b>{newCpc != null ? money(newCpc) : '—'}</b></div>
        </div>
        {inCt > 0 && Math.abs(inCt - outCt) > 0.001 && <div className="small" style={{ color: 'var(--warn)', marginTop: 8 }}>Carats in ({inCt.toFixed(2)}) differ from carats out ({outCt.toFixed(2)}). The cost is spread over the carats in.</div>}
        <label className="f" style={{ marginTop: 12 }}>Note<input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. re-sorted by colour" /></label>
      </div>
      <div className="sticky-bar">
        <button className="btn" onClick={() => go('parcel-mixing')}>Cancel</button>
        <button className="btn primary" disabled={busy || !outs.length || !ins.length || inCt <= 0} onClick={save}>{busy ? 'Saving…' : 'Finalize mix'}</button>
      </div>
    </>
  )
}

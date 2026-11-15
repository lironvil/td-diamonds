import { useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import Snap from '../components/Snap'
import { AccountPicker } from '../components/Pickers'
import { CLARITIES, SHAPES } from '../lib/stock'

type L = { kind: 'white_diamond' | 'parcel'; shape: string; pcs: string; carat: string; color: string; clarity: string; cert_no: string; vendor_stock: string; cost_total: string }
const blank = (): L => ({ kind: 'white_diamond', shape: '', pcs: '1', carat: '', color: '', clarity: '', cert_no: '', vendor_stock: '', cost_total: '' })

/** Memo-in typed by hand (the fast way is Snap: the photo fills all of this). */
export default function MemoInNew() {
  const { toast } = useApp()
  const [sup, setSup] = useState<{ id: string } | null>(null)
  const [vendorDoc, setVendorDoc] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<L[]>([blank()])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, k: keyof L, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,]/g, '')))

  async function save() {
    if (!sup) return setErr('Choose the supplier.')
    const ls = lines.filter((l) => l.shape || l.carat)
    if (!ls.length) return setErr('Add at least one stone.')
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('create_memo_in', {
      p_header: { supplier_id: sup.id, vendor_doc: vendorDoc, received: date },
      p_lines: ls.map((l) => ({ kind: l.kind, shape: l.shape, pcs: l.kind === 'parcel' ? num(l.pcs) : 1, carat: num(l.carat), color: l.color, clarity: l.clarity,
        cert_no: l.cert_no, vendor_stock: l.vendor_stock, cost_total: num(l.cost_total) })),
    })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Memo-in #${data.doc_no} saved`); go('memo-in/' + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/memo-in" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Memo-in</a>
      <div className="page-head">
        <div><h1>New memo-in</h1><div className="sub">Faster: snap the supplier’s memo and every line is filled in for you.</div></div>
        <Snap label="Snap memo instead" primary={false} />
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="wide" style={{ maxWidth: 520 }}><AccountPicker label="Supplier *" value={sup?.id ?? ''} types={['supplier', 'partner']} onChange={setSup} autoFocus /></div>
          <label className="f">Their memo #<input className="input" value={vendorDoc} onChange={(e) => setVendorDoc(e.target.value)} /></label>
          <label className="f">Received<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="t review">
            <thead><tr><th>Type</th><th>Shape</th><th className="r">Pcs</th><th className="r">Ct</th><th>Col</th><th>Clar</th><th>Report #</th><th className="hide-sm">Their stock #</th><th className="r">Cost $</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td><select className="input sm" value={l.kind} onChange={(e) => set(i, 'kind', e.target.value)}><option value="white_diamond">Stone</option><option value="parcel">Parcel</option></select></td>
                  <td><select className="input sm" style={{ minWidth: 100 }} value={l.shape} onChange={(e) => set(i, 'shape', e.target.value)}><option value="">?</option>{[...SHAPES, 'Mixed'].map((s) => <option key={s}>{s}</option>)}</select></td>
                  <td className="r">{l.kind === 'parcel' ? <input className="input sm num" style={{ width: 56 }} value={l.pcs} onChange={(e) => set(i, 'pcs', e.target.value)} /> : 1}</td>
                  <td className="r"><input className="input sm num" style={{ width: 70 }} value={l.carat} onChange={(e) => set(i, 'carat', e.target.value)} /></td>
                  <td><input className="input sm" style={{ width: 52 }} value={l.color} onChange={(e) => set(i, 'color', e.target.value.toUpperCase())} /></td>
                  <td><select className="input sm" style={{ minWidth: 72 }} value={l.clarity} onChange={(e) => set(i, 'clarity', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td><input className="input sm num" style={{ width: 115 }} value={l.cert_no} onChange={(e) => set(i, 'cert_no', e.target.value)} /></td>
                  <td className="hide-sm"><input className="input sm" style={{ width: 80 }} value={l.vendor_stock} onChange={(e) => set(i, 'vendor_stock', e.target.value)} /></td>
                  <td className="r"><input className="input sm num" style={{ width: 100 }} value={l.cost_total} onChange={(e) => set(i, 'cost_total', e.target.value)} /></td>
                  <td><button className="btn ghost danger sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={10} className="small">
              <button className="btn sm" onClick={() => setLines([...lines, blank()])}><Icon name="plus" /> Add line</button>
              <span style={{ marginLeft: 12 }}>{lines.reduce((a, l) => a + (Number(l.carat) || 0), 0).toFixed(2)} ct · {money(lines.reduce((a, l) => a + (num(l.cost_total) ?? 0), 0))}</span>
            </td></tr></tfoot>
          </table>
        </div>
      </div>
      <div className="sticky-bar">
        <button className="btn" onClick={() => go('memo-in')}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save memo-in'}</button>
      </div>
    </>
  )
}

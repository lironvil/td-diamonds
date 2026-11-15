import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { AccountPicker, ItemPicker } from '../components/Pickers'
import { itemLabel } from '../lib/docs'
import { r2, type Item } from '../lib/stock'

type L = { item: Item; pcs: string; ct: string; amount: string }

/** New memo: pick customer, scan stones in, price defaults to asking, save. */
export default function MemoNew() {
  const { toast } = useApp()
  const [acc, setAcc] = useState<{ id: string; company: string; memo_terms: number | null } | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [terms, setTerms] = useState('')
  const [lines, setLines] = useState<L[]>([])
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const pre = new URLSearchParams(location.hash.split('?')[1] ?? '').get('item')
    if (pre) supabase.from('items').select('*').eq('id', pre).maybeSingle().then(({ data }) => { if (data && data.status === 'available') add(data as Item) })
  }, [])

  function add(i: Item) {
    if (i.kind === 'parcel') {
      const pcs = i.pcs - i.memo_pcs, ct = r2(Number(i.carat) - Number(i.memo_ct))
      setLines((ls) => [...ls, { item: i, pcs: String(pcs), ct: String(ct), amount: i.ask_ct != null ? (r2(Number(i.ask_ct) * ct)).toFixed(2) : '' }])
    } else setLines((ls) => [...ls, { item: i, pcs: '1', ct: String(i.carat ?? ''), amount: i.ask_total != null ? Number(i.ask_total).toFixed(2) : '' }])
  }
  const set = (idx: number, k: keyof L, v: string) => setLines(lines.map((l, j) => {
    if (j !== idx) return l
    const n = { ...l, [k]: v }
    if (k === 'ct' && l.item.kind === 'parcel' && l.item.ask_ct != null && Number(v) > 0) n.amount = r2(Number(l.item.ask_ct) * Number(v)).toFixed(2)
    return n
  }))
  const total = lines.reduce((a, l) => a + (Number(l.amount.replace(/[$,]/g, '')) || 0), 0)

  async function save() {
    if (!acc) return setErr('Choose the customer.')
    if (!lines.length) return setErr('Add at least one item.')
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('create_memo', { p: {
      account_id: acc.id, doc_date: date, terms: terms === '' ? null : Number(terms), notes,
      lines: lines.map((l) => ({ item_id: l.item.id, pcs: l.item.kind === 'parcel' ? Number(l.pcs) : null, carat: l.item.kind === 'parcel' ? Number(l.ct) : null,
        amount: l.amount.trim() === '' ? null : Number(l.amount.replace(/[$,]/g, '')) })),
    } })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Memo #${data.doc_no} created`); go('memos/' + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/memos" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Memos</a>
      <div className="page-head"><div><h1>New memo</h1><div className="sub">Scan or type stock numbers. Prices start at the asking price.</div></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="wide" style={{ maxWidth: 520 }}>
            <AccountPicker label="Customer *" value={acc?.id ?? ''} types={['customer', 'prospect', 'partner']} autoFocus
              onChange={(a) => { setAcc(a); setTerms(a?.memo_terms != null ? String(a.memo_terms) : '') }} />
          </div>
          <label className="f">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="f">Terms (days)<input className="input" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 14" /></label>
          <label className="f wide">Internal note<input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      </div>
      <div className="card">
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <ItemPicker onPick={add} exclude={lines.filter((l) => l.item.kind !== 'parcel').map((l) => l.item.id)}
            filter={(i) => i.status === 'available' && !(i.kind === 'parcel' && Number(i.carat) - Number(i.memo_ct) <= 0)} />
        </div>
        {lines.length === 0 ? <div className="empty">No items yet.</div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Stock #</th><th>Description</th><th className="r">Pcs</th><th className="r">Ct</th><th className="r">Price $</th><th /></tr></thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={idx} style={{ cursor: 'default' }}>
                    <td className="num">{l.item.stock_no}</td>
                    <td>{itemLabel(l.item)}{l.item.held_for && <div className="small" style={{ color: 'var(--warn)' }}>Held for {l.item.held_for}. Sending it clears the hold.</div>}</td>
                    <td className="r">{l.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 64, textAlign: 'right' }} value={l.pcs} onChange={(e) => set(idx, 'pcs', e.target.value)} /> : 1}</td>
                    <td className="r">{l.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 80, textAlign: 'right' }} value={l.ct} onChange={(e) => set(idx, 'ct', e.target.value)} /> : Number(l.item.carat ?? 0).toFixed(2)}</td>
                    <td className="r"><input className="input sm num" style={{ width: 110, textAlign: 'right' }} value={l.amount} placeholder="price" onChange={(e) => set(idx, 'amount', e.target.value)} /></td>
                    <td><button className="btn ghost danger sm" onClick={() => setLines(lines.filter((_, j) => j !== idx))} aria-label="Remove"><Icon name="x" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6} className="small">{lines.length} items · {lines.reduce((a, l) => a + (Number(l.ct) || 0), 0).toFixed(2)} ct · {money(total)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
      <div className="sticky-bar">
        <button className="btn" onClick={() => go('memos')}>Cancel</button>
        <button className="btn primary" disabled={busy || !acc || !lines.length} onClick={save}>{busy ? 'Saving…' : 'Create memo'}</button>
      </div>
    </>
  )
}

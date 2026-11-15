import { useEffect, useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import type { Doc, DocLine } from '../lib/docs'
import type { Item } from '../lib/stock'

type Row = { line: DocLine; doc: Doc; item: Item; company: string; pcs: string; ct: string }

/** One screen: scan stock #s coming back from any customers' memos, then one tap returns them all. */
export default function QuickReturn() {
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [done, setDone] = useState<{ id: string; doc_no: number; memo_no: number; company: string }[]>([])
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  async function find() {
    const t = q.trim(); if (!t) return
    setMsg(null)
    const { data: it } = await supabase.from('items').select('*').or(`stock_no.eq.${/^\d+$/.test(t) ? t : -1},cert_no.eq.${t.replace(/[^\w]/g, '')}`).limit(5)
    const item = (it ?? [])[0] as Item | undefined
    if (!item) { setMsg(`No item with stock # or report # ${t}.`); return }
    const { data: ls } = await supabase.from('doc_lines').select('*, docs!inner(*)').eq('item_id', item.id).eq('docs.kind', 'memo').eq('docs.status', 'open')
    const open = (ls ?? []).filter((l) => l.done_ct < l.carat) as (DocLine & { docs: Doc })[]
    if (!open.length) { setMsg(`#${item.stock_no} is not out on any open memo.`); setQ(''); return }
    const fresh = open.filter((l) => !rows.some((r) => r.line.id === l.id))
    if (!fresh.length) { setMsg(`#${item.stock_no} is already on the list.`); setQ(''); return }
    const accIds = [...new Set(fresh.map((l) => l.docs.account_id))]
    const { data: accs } = await supabase.from('accounts').select('id,company').in('id', accIds)
    setRows((r) => [...r, ...fresh.map((l) => ({ line: l, doc: l.docs, item, company: accs?.find((a) => a.id === l.docs.account_id)?.company ?? '',
      pcs: String(l.pcs - l.done_pcs), ct: String(Number(l.carat) - Number(l.done_ct)) }))])
    setQ(''); ref.current?.focus()
  }

  async function process() {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('return_memo', {
      p_lines: rows.map((r) => (r.item.kind === 'parcel' ? { line_id: r.line.id, pcs: Number(r.pcs), carat: Number(r.ct) } : { line_id: r.line.id })),
      p_date: date, p_note: 'Quick return',
    })
    setBusy(false)
    if (error) return setErr(errText(error))
    setDone(data); setRows([]); toast(`${data.length} return slip${data.length === 1 ? '' : 's'} created`)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/memos" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Memos</a>
      <div className="page-head"><div><h1>Memo quick return</h1><div className="sub">Scan or type the stock # (or GIA #) of everything that came back, from any customer.</div></div></div>
      {err && <div className="alert">{err}</div>}
      {done.length > 0 && (
        <div className="alert ok">Returned. {done.map((d) => <span key={d.id} style={{ marginRight: 10 }}><a href={'#/docs/' + d.id}>Slip #{d.doc_no}</a> (memo #{d.memo_no}, {d.company})</span>)}</div>
      )}
      <div className="card">
        <div className="card-pad row" style={{ borderBottom: '1px solid var(--line)' }}>
          <input ref={ref} className="input" style={{ flex: '1 1 260px' }} placeholder="Stock # or GIA #, then Enter" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} />
          <button className="btn" onClick={find}>Add</button>
          <label className="f">Return date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {msg && <div className="card-pad small" style={{ color: 'var(--warn)', paddingBottom: 0 }}>{msg}</div>}
        {rows.length === 0 ? <div className="empty">Nothing scanned yet.</div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Stock #</th><th>Description</th><th>Memo #</th><th>Customer</th><th className="r">Pcs</th><th className="r">Ct</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.line.id} style={{ cursor: 'default' }}>
                    <td className="num">{r.item.stock_no}</td>
                    <td>{r.line.descr.replace(/^#\d+ /, '')}</td>
                    <td><a href={'#/memos/' + r.doc.id} onClick={(e) => { e.preventDefault(); go('memos/' + r.doc.id) }}>{r.doc.doc_no}</a></td>
                    <td>{r.company}</td>
                    <td className="r">{r.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 60 }} value={r.pcs} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pcs: e.target.value } : x)))} /> : 1}</td>
                    <td className="r">{r.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 76 }} value={r.ct} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ct: e.target.value } : x)))} /> : Number(r.line.carat).toFixed(2)}</td>
                    <td className="r num">{r.line.amount != null ? money(r.line.amount) : '—'}</td>
                    <td><button className="btn ghost danger sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="sticky-bar">
        <button className="btn primary" disabled={busy || !rows.length} onClick={process}>{busy ? 'Saving…' : `Return ${rows.length} item${rows.length === 1 ? '' : 's'}`}</button>
      </div>
    </>
  )
}

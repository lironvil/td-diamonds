import { useCallback, useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { DOC_TITLE, daysSince, lineOpen, openAmount, type Doc, type DocLine } from '../lib/docs'
import type { Item } from '../lib/stock'

const BASE: Record<string, string> = { memo: 'memos', memo_in: 'memo-in', memo_return: 'docs', memo_in_return: 'docs', mix: 'docs' }

export default function DocView({ id }: { id: string }) {
  const { team, toast } = useApp()
  const [d, setD] = useState<Doc | null>(null)
  const [lines, setLines] = useState<DocLine[]>([])
  const [items, setItems] = useState<Record<string, Item>>({})
  const [acc, setAcc] = useState<{ id: string; company: string } | null>(null)
  const [related, setRelated] = useState<Doc[]>([])
  const [src, setSrc] = useState<Doc | null>(null)
  const [sel, setSel] = useState<Record<string, { pcs: string; ct: string } | undefined>>({})
  const [retDate, setRetDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('docs').select('*').eq('id', id).maybeSingle()
    if (error || !data) return setErr(error ? errText(error) : 'Document not found.')
    const doc = data as Doc
    setD(doc)
    const [l, rel] = await Promise.all([
      supabase.from('doc_lines').select('*').eq('doc_id', id).order('line_no'),
      supabase.from('docs').select('*').eq('source_doc_id', id).order('doc_no'),
    ])
    const ls = (l.data ?? []) as DocLine[]
    setLines(ls); setRelated((rel.data ?? []) as Doc[]); setSel({})
    if (ls.length) {
      const { data: it } = await supabase.from('items').select('*').in('id', [...new Set(ls.map((x) => x.item_id))])
      setItems(Object.fromEntries((it ?? []).map((x) => [x.id, x as Item])))
    }
    if (doc.account_id) supabase.from('accounts').select('id,company').eq('id', doc.account_id).maybeSingle().then(({ data }) => setAcc(data))
    if (doc.source_doc_id) supabase.from('docs').select('*').eq('id', doc.source_doc_id).maybeSingle().then(({ data }) => setSrc(data as Doc))
  }, [id])
  useEffect(() => { load() }, [load])

  if (!d) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  const canReturn = (d.kind === 'memo' || d.kind === 'memo_in') && d.status === 'open'
  const chosen = Object.entries(sel).filter(([, v]) => v)
  const totalAmt = lines.reduce((a, l) => a + Number(l.amount ?? 0), 0)
  const totalCt = lines.reduce((a, l) => a + Number(l.carat), 0)
  const openLines = lines.filter(lineOpen)

  function toggle(l: DocLine) {
    setSel((s) => ({ ...s, [l.id]: s[l.id] ? undefined : { pcs: String(l.pcs - l.done_pcs), ct: (Number(l.carat) - Number(l.done_ct)).toFixed(3).replace(/\.?0+$/, '') } }))
  }
  async function doReturn() {
    if (!d) return
    setBusy(true); setErr(null)
    const payload = chosen.map(([lineId, v]) => {
      const it = items[lines.find((l) => l.id === lineId)!.item_id]
      return it?.kind === 'parcel' ? { line_id: lineId, pcs: Number(v!.pcs), carat: Number(v!.ct) } : { line_id: lineId }
    })
    const { data, error } = await supabase.rpc(d.kind === 'memo' ? 'return_memo' : 'return_memo_in', { p_lines: payload, p_date: retDate, p_note: '' })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Returned · slip #${(data as { doc_no: number }[]).map((r) => r.doc_no).join(', #')}`)
    load()
  }
  async function voidMemo() {
    if (!confirm('Void this memo? Everything on it goes back to stock.')) return
    const { error } = await supabase.rpc('void_memo', { p_id: id })
    if (error) return setErr(errText(error))
    toast('Memo voided'); load()
  }

  const back = d.kind === 'memo' || d.kind === 'memo_return' ? ['#/memos', 'Memos'] : d.kind === 'mix' ? ['#/parcel-mixing', 'Parcel mixing'] : ['#/memo-in', 'Memo-in']

  return (
    <>
      <a className="btn ghost sm" href={back[0]} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> {back[1]}</a>
      <div className="page-head">
        <div>
          <h1>{DOC_TITLE[d.kind]} #{d.doc_no}{acc ? ` · ${acc.company}` : ''}</h1>
          <div className="sub row" style={{ gap: 8, marginTop: 6 }}>
            <span>{day(d.doc_date)}</span>
            {d.vendor_doc && <span>· their #{d.vendor_doc}</span>}
            {d.due_date && d.status === 'open' && <span>· due {day(d.due_date)}</span>}
            {(d.kind === 'memo' || d.kind === 'memo_in') && d.status === 'open' && <span>· {daysSince(d.doc_date)} days</span>}
            <span className={'badge' + (d.status === 'open' ? '' : ' grey')}>{d.status === 'open' ? 'Open' : d.status === 'void' ? 'Void' : 'Closed'}</span>
            {src && <span>· from <a href={`#/${BASE[src.kind]}/${src.id}`}>{DOC_TITLE[src.kind]} #{src.doc_no}</a></span>}
          </div>
        </div>
        <div className="row">
          {d.kind === 'memo' && d.status === 'open' && !lines.some((l) => l.done_ct > 0) && <button className="btn ghost danger" onClick={voidMemo}>Void</button>}
          <a className="btn" href={`#/print/${d.id}`}><Icon name="invoice" /> Print</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="card">
        <div className="card-head">
          <h2>{lines.length} line{lines.length === 1 ? '' : 's'} · {totalCt.toFixed(2)} ct · {money(totalAmt)}</h2>
          {canReturn && openLines.length > 0 && (
            <button className="btn sm" onClick={() => setSel(chosen.length === openLines.length ? {} : Object.fromEntries(openLines.map((l) => [l.id, { pcs: String(l.pcs - l.done_pcs), ct: String(Number(l.carat) - Number(l.done_ct)) }])))}>
              {chosen.length === openLines.length ? 'Clear' : 'Select all open'}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr>
              {canReturn && <th />}<th>Stock #</th><th>Description</th>{d.kind === 'mix' && <th>Direction</th>}
              <th className="r">Pcs</th><th className="r">Ct</th><th className="r hide-sm">$/ct</th><th className="r">Amount</th>
              {(d.kind === 'memo' || d.kind === 'memo_in') && <th>Status</th>}
            </tr></thead>
            <tbody>
              {lines.map((l) => {
                const it = items[l.item_id]; const s = sel[l.id]; const open = lineOpen(l)
                const partial = l.done_ct > 0 && open
                return (
                  <tr key={l.id} style={{ cursor: 'default' }} className={open || !(d.kind === 'memo' || d.kind === 'memo_in') ? '' : 'inactive'}>
                    {canReturn && <td>{open && <input type="checkbox" checked={!!s} onChange={() => toggle(l)} aria-label="Select" />}</td>}
                    <td className="num"><a href={'#/stock/' + l.item_id} onClick={(e) => { e.preventDefault(); go('stock/' + l.item_id) }}>{it?.stock_no ?? '—'}</a></td>
                    <td>{l.descr.replace(/^#\d+ /, '')}
                      {s && it?.kind === 'parcel' && (
                        <div className="row" style={{ marginTop: 6 }}>
                          <label className="f" style={{ width: 90 }}>Pcs back<input className="input sm" value={s.pcs} onChange={(e) => setSel({ ...sel, [l.id]: { ...s, pcs: e.target.value } })} /></label>
                          <label className="f" style={{ width: 100 }}>Ct back<input className="input sm" value={s.ct} onChange={(e) => setSel({ ...sel, [l.id]: { ...s, ct: e.target.value } })} /></label>
                        </div>
                      )}
                    </td>
                    {d.kind === 'mix' && <td>{l.direction === 'out' ? 'Out' : 'In'}</td>}
                    <td className="r num">{l.pcs}</td>
                    <td className="r num">{Number(l.carat).toFixed(2)}</td>
                    <td className="r num hide-sm">{l.price_ct != null ? money(l.price_ct) : '—'}</td>
                    <td className="r num">{l.amount != null ? money(l.amount) : '—'}</td>
                    {(d.kind === 'memo' || d.kind === 'memo_in') && (
                      <td className="nw small">{d.status === 'void' ? 'Void' : !open ? <span className="faint">{d.kind === 'memo' ? 'Returned' : 'Returned / bought'}</span>
                        : partial ? <span style={{ color: 'var(--warn)' }}>{(Number(l.carat) - Number(l.done_ct)).toFixed(2)} ct still out · {money(openAmount(l))}</span> : 'Out'}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {canReturn && chosen.length > 0 && (
          <div className="card-pad row" style={{ borderTop: '1px solid var(--line)', justifyContent: 'flex-end' }}>
            <label className="f">Return date<input className="input" type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} /></label>
            <button className="btn primary" style={{ alignSelf: 'flex-end' }} disabled={busy} onClick={doReturn}>
              {busy ? 'Saving…' : `${d.kind === 'memo' ? 'Returned to TD' : 'Return to supplier'}: ${chosen.length} line${chosen.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>

      {related.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Returns</h2></div>
          <ul className="feed">
            {related.map((r) => (
              <li key={r.id} onClick={() => go('docs/' + r.id)} style={{ cursor: 'pointer' }}>
                <span className="dot"><Icon name="undo" /></span>
                <div><div className="what">{DOC_TITLE[r.kind]} #{r.doc_no}</div><div className="detail">{day(r.doc_date)} · {personName(r.created_by, team)}</div></div>
                <span className="time">{when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="faint small" style={{ marginTop: 12 }}>Created by {personName(d.created_by, team)} · {when(d.created_at)}{d.notes ? ` · ${d.notes}` : ''}</div>
    </>
  )
}

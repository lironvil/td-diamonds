import { useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money } from '../lib/format'
import { go } from '../lib/router'
import { Icon } from '../components/ui'
import Snap from '../components/Snap'
import { daysSince, lineOpen, openAmount, type Doc, type DocLine } from '../lib/docs'

/** Memos (to customers) or memo-in (from suppliers): open first, days out, overdue. */
export default function DocList({ kind }: { kind: 'memo' | 'memo_in' }) {
  const isIn = kind === 'memo_in'
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [lines, setLines] = useState<DocLine[]>([])
  const [accs, setAccs] = useState<Record<string, string>>({})
  const [view, setView] = useState<'open' | 'closed' | 'all'>('open')
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('docs').select('*').eq('kind', kind).order('doc_no', { ascending: false }).limit(2000).then(async ({ data, error }) => {
      if (error) return setErr(errText(error))
      setDocs(data as Doc[])
      const ids = (data ?? []).filter((d) => d.status === 'open').map((d) => d.id)
      if (ids.length) { const { data: l } = await supabase.from('doc_lines').select('*').in('doc_id', ids); setLines((l ?? []) as DocLine[]) }
    })
    supabase.from('accounts').select('id,company').then(({ data }) => setAccs(Object.fromEntries((data ?? []).map((a) => [a.id, a.company]))))
  }, [kind])

  const list = useMemo(() => (docs ?? []).filter((d) => {
    if (view === 'open' && d.status !== 'open') return false
    if (view === 'closed' && d.status === 'open') return false
    const w = q.toLowerCase().trim()
    return !w || `${d.doc_no} ${accs[d.account_id ?? ''] ?? ''} ${d.vendor_doc}`.toLowerCase().includes(w)
  }), [docs, view, q, accs])

  const stats = (d: Doc) => {
    const ls = lines.filter((l) => l.doc_id === d.id && lineOpen(l))
    return { n: ls.length, ct: ls.reduce((a, l) => a + Number(l.carat) - Number(l.done_ct), 0), amt: ls.reduce((a, l) => a + openAmount(l), 0) }
  }
  const openTotal = list.filter((d) => d.status === 'open').reduce((a, d) => a + stats(d).amt, 0)

  return (
    <>
      <div className="page-head">
        <div><h1>{isIn ? 'Memo-in' : 'Memos'}</h1><div className="sub">{isIn ? 'Goods suppliers sent TD on memo' : 'Goods TD sent to customers on memo'}</div></div>
        <div className="row">
          {!isIn && <a className="btn" href="#/memo-quick-return"><Icon name="undo" /> Quick return</a>}
          {isIn && <Snap label="Snap supplier memo" primary={false} />}
          <a className="btn primary" href={isIn ? '#/memo-in/new' : '#/memos/new'}><Icon name="plus" /> {isIn ? 'New memo-in' : 'New memo'}</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-pad row" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="search" style={{ flex: '1 1 240px' }}><Icon name="search" />
            <input className="input" placeholder={isIn ? 'Memo-in #, supplier, their memo #' : 'Memo #, customer'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="chips">
            {(['open', 'closed', 'all'] as const).map((v) => <button key={v} className={'chip' + (view === v ? ' on' : '')} onClick={() => setView(v)}>{v === 'open' ? 'Open' : v === 'closed' ? 'Closed' : 'All'}</button>)}
          </div>
        </div>
        {docs === null ? <div className="loading">Loading…</div> : list.length === 0 ? (
          <div className="empty"><div className="big">{view === 'open' ? `No open ${isIn ? 'memo-in' : 'memos'}` : 'Nothing here'}</div>
            {isIn ? 'Snap a supplier memo, or enter one by hand.' : 'Create a memo for a customer.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr>
                <th>#</th><th>Date</th><th>{isIn ? 'Supplier' : 'Customer'}</th>{isIn && <th className="hide-sm">Their #</th>}
                <th className="r">Open items</th><th className="r hide-sm">Open ct</th><th className="r">Open value</th><th className="r">Days</th><th>Status</th>
              </tr></thead>
              <tbody>
                {list.map((d) => {
                  const s = stats(d)
                  const overdue = d.status === 'open' && d.due_date && d.due_date < new Date().toISOString().slice(0, 10)
                  return (
                    <tr key={d.id} onClick={() => go((isIn ? 'memo-in/' : 'memos/') + d.id)} className={d.status === 'void' ? 'inactive' : ''}>
                      <td className="num"><b style={{ fontWeight: 600 }}>{d.doc_no}</b></td>
                      <td className="nw">{day(d.doc_date)}</td>
                      <td>{accs[d.account_id ?? ''] ?? '—'}</td>
                      {isIn && <td className="hide-sm">{d.vendor_doc || '—'}</td>}
                      <td className="r num">{d.status === 'open' ? s.n : '—'}</td>
                      <td className="r num hide-sm">{d.status === 'open' ? s.ct.toFixed(2) : '—'}</td>
                      <td className="r num">{d.status === 'open' ? money(s.amt) : '—'}</td>
                      <td className="r num" style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{d.status === 'open' ? daysSince(d.doc_date) : '—'}</td>
                      <td><span className={'badge' + (d.status === 'open' ? (overdue ? ' bad' : '') : ' grey')}>{d.status === 'open' ? (overdue ? 'Overdue' : 'Open') : d.status === 'void' ? 'Void' : 'Closed'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
              {view !== 'closed' && <tfoot><tr><td colSpan={9} className="small">{list.filter((d) => d.status === 'open').length} open · {money(openTotal)} out</td></tr></tfoot>}
            </table>
          </div>
        )}
      </div>
    </>
  )
}

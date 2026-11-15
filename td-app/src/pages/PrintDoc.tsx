import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { day, money } from '../lib/format'
import { PRINT_TITLE, settings, type Doc, type DocLine } from '../lib/docs'
import type { Item } from '../lib/stock'
import type { Account } from '../lib/types'

/** Clean printable document (memo, return slip, memo-in receipt). Uses the browser's Print / Save as PDF. */
export default function PrintDoc({ id }: { id: string }) {
  const [d, setD] = useState<Doc | null>(null)
  const [lines, setLines] = useState<DocLine[]>([])
  const [items, setItems] = useState<Record<string, Item>>({})
  const [acc, setAcc] = useState<Account | null>(null)
  const [src, setSrc] = useState<Doc | null>(null)
  const [s, setS] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      const [{ data: doc }, st] = await Promise.all([supabase.from('docs').select('*').eq('id', id).maybeSingle(), settings()])
      if (!doc) return
      setD(doc as Doc); setS(st)
      const { data: ls } = await supabase.from('doc_lines').select('*').eq('doc_id', id).order('line_no')
      setLines((ls ?? []) as DocLine[])
      const ids = [...new Set((ls ?? []).map((l) => l.item_id))]
      if (ids.length) { const { data: it } = await supabase.from('items').select('*').in('id', ids); setItems(Object.fromEntries((it ?? []).map((x) => [x.id, x as Item]))) }
      if (doc.account_id) { const { data: a } = await supabase.from('accounts').select('*').eq('id', doc.account_id).maybeSingle(); setAcc(a as Account) }
      if (doc.source_doc_id) { const { data: sd } = await supabase.from('docs').select('*').eq('id', doc.source_doc_id).maybeSingle(); setSrc(sd as Doc) }
    })()
  }, [id])

  if (!d) return <div className="loading">Loading…</div>
  const totCt = lines.reduce((a, l) => a + Number(l.carat), 0)
  const totPcs = lines.reduce((a, l) => a + l.pcs, 0)
  const tot = lines.reduce((a, l) => a + Number(l.amount ?? 0), 0)
  const addr = acc ? [acc.address1, acc.address2, [acc.city, acc.state, acc.zip].filter(Boolean).join(', '), acc.country !== 'USA' ? acc.country : ''].filter(Boolean) : []
  const toLabel = d.kind === 'memo' || d.kind === 'memo_return' ? 'Customer' : 'Supplier'

  return (
    <div className="print-page">
      <div className="no-print row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn ghost" onClick={() => history.back()}>← Back</button>
        <button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <div className="sheet">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ font: '600 26px/1 var(--serif)', letterSpacing: '0.12em' }}>TD DIAMONDS</div>
            <div className="small" style={{ whiteSpace: 'pre-line', marginTop: 8, lineHeight: 1.5 }}>
              {s.company_name}{'\n'}{s.company_address}{s.company_phone ? `\nTel: ${s.company_phone}` : ''}{s.company_email ? `\n${s.company_email}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '600 20px/1.2 var(--sans)', letterSpacing: '0.08em' }}>{PRINT_TITLE[d.kind]}</div>
            <div style={{ marginTop: 6 }}>No. <b>{d.doc_no}</b></div>
            <div>Date: {day(d.doc_date)}</div>
            {d.due_date && d.kind === 'memo' && <div>Terms: {d.terms} days (due {day(d.due_date)})</div>}
            {d.vendor_doc && <div>Supplier ref: {d.vendor_doc}</div>}
            {src && <div>Ref: {PRINT_TITLE[src.kind].toLowerCase()} #{src.doc_no}</div>}
          </div>
        </div>
        {acc && (
          <div style={{ marginTop: 22 }}>
            <div className="small" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666' }}>{toLabel}</div>
            <div style={{ fontWeight: 600 }}>{acc.company}</div>
            {addr.map((l, i) => <div key={i}>{l}</div>)}
            {acc.phone && <div>Tel: {acc.phone}</div>}
          </div>
        )}
        <table className="ptable">
          <thead><tr><th>#</th><th>Stock #</th><th>Description</th><th className="r">Pcs</th><th className="r">Carats</th><th className="r">$/ct</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td><td>{items[l.item_id]?.stock_no}</td><td>{l.descr.replace(/^#\d+ /, '')}</td>
                <td className="r">{l.pcs}</td><td className="r">{Number(l.carat).toFixed(2)}</td>
                <td className="r">{l.price_ct != null ? money(l.price_ct) : ''}</td><td className="r">{l.amount != null ? money(l.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="r">{totPcs}</td><td className="r">{totCt.toFixed(2)}</td><td /><td className="r">{money(tot)}</td></tr></tfoot>
        </table>
        {d.print_notes && <div style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{d.print_notes}</div>}
        {d.kind === 'memo' && s.memo_terms_text && <div className="small" style={{ marginTop: 18, whiteSpace: 'pre-wrap' }}>{s.memo_terms_text}</div>}
        <div className="row" style={{ marginTop: 48, gap: 60 }}>
          <div style={{ borderTop: '1px solid #222', paddingTop: 6, minWidth: 220 }} className="small">Received by</div>
          <div style={{ borderTop: '1px solid #222', paddingTop: 6, minWidth: 160 }} className="small">Date</div>
        </div>
      </div>
    </div>
  )
}

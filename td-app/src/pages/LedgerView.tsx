import { useCallback, useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { LINE_COLS, LTITLE, balance, lpath, type LDoc, type LLine, type Payment } from '../lib/ledger'

export default function LedgerView({ id }: { id: string }) {
  const { me, team, toast } = useApp()
  const [d, setD] = useState<LDoc | null>(null)
  const [lines, setLines] = useState<LLine[]>([])
  const [stock, setStock] = useState<Record<string, number>>({})
  const [acc, setAcc] = useState<{ id: string; company: string } | null>(null)
  const [partners, setPartners] = useState<Record<string, string>>({})
  const [pays, setPays] = useState<(Payment & { app: number; active: boolean })[]>([])
  const [credits, setCredits] = useState<LDoc[]>([])
  const [src, setSrc] = useState<LDoc | null>(null)
  const [profit, setProfit] = useState<{ cost: number; amount: number; td_profit: number; lines: { line_id: string; cost: number | null; td_profit: number | null }[] } | null>(null)
  const [sel, setSel] = useState<Record<string, { pcs: string; ct: string } | undefined>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('ledger_docs').select('*').eq('id', id).maybeSingle()
    if (!data) return setErr('Document not found.')
    const doc = data as LDoc; setD(doc); setSel({})
    const [l, apps, cr] = await Promise.all([
      supabase.from('ledger_lines').select(LINE_COLS).eq('doc_id', id).order('line_no'),
      supabase.from('payment_apps').select('amount, active, payments(*)').eq('doc_id', id),
      supabase.from('ledger_docs').select('*').eq('source_id', id).order('doc_no'),
    ])
    const ls = (l.data ?? []) as unknown as LLine[]; setLines(ls)
    setPays(((apps.data ?? []) as unknown as { amount: number; active: boolean; payments: Payment }[]).map((x) => ({ ...x.payments, app: x.amount, active: x.active })))
    setCredits((cr.data ?? []) as LDoc[])
    const ids = ls.map((x) => x.item_id).filter(Boolean) as string[]
    if (ids.length) supabase.from('items').select('id,stock_no').in('id', ids).then(({ data }) => setStock(Object.fromEntries((data ?? []).map((x) => [x.id, x.stock_no]))))
    const pids = [...new Set(ls.map((x) => x.partner_id).filter(Boolean))] as string[]
    supabase.from('accounts').select('id,company').in('id', [doc.account_id, ...pids]).then(({ data }) => {
      setAcc((data ?? []).find((a) => a.id === doc.account_id) ?? null); setPartners(Object.fromEntries((data ?? []).map((a) => [a.id, a.company])))
    })
    if (doc.source_id) supabase.from('ledger_docs').select('*').eq('id', doc.source_id).maybeSingle().then(({ data }) => setSrc(data as LDoc))
    if (me.role === 'owner' && (doc.kind === 'invoice' || doc.kind === 'credit_invoice')) supabase.rpc('invoice_profit', { p_doc: id }).then(({ data }) => setProfit(data))
  }, [id, me.role])
  useEffect(() => { load() }, [load])

  if (!d) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  const isSale = d.kind === 'invoice' || d.kind === 'credit_invoice'
  const canCredit = (d.kind === 'invoice' || d.kind === 'purchase') && d.status !== 'void'
  const chosen = Object.entries(sel).filter(([, v]) => v)
  const openLine = (l: LLine) => l.item_id && (l.done_ct < Number(l.carat) || l.done_pcs < l.pcs)

  async function credit() {
    if (!d) return
    setBusy(true); setErr(null)
    const p_lines = chosen.map(([lid, v]) => ({ line_id: lid, pcs: v!.pcs === '' ? null : Number(v!.pcs), carat: v!.ct === '' ? null : Number(v!.ct) }))
    const { data, error } = await supabase.rpc(d.kind === 'invoice' ? 'credit_invoice' : 'credit_purchase', { p_lines, p_date: null, p_note: '' })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`${d.kind === 'invoice' ? 'Credit' : 'Return'} #${data.doc_no} · ${money(data.total)}`); load()
  }
  const lineProfit = (lid: string) => profit?.lines.find((x) => x.line_id === lid)

  return (
    <>
      <a className="btn ghost sm" href={isSale ? '#/invoices' : '#/purchases'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> {isSale ? 'Invoices' : 'Purchases'}</a>
      <div className="page-head">
        <div>
          <h1>{LTITLE[d.kind]} #{d.doc_no}{acc ? ` · ${acc.company}` : ''}</h1>
          <div className="sub row" style={{ gap: 8, marginTop: 6 }}>
            <span>{day(d.doc_date)}</span>{d.vendor_doc && <span>· their #{d.vendor_doc}</span>}
            {d.due_date && d.status === 'open' && <span>· due {day(d.due_date)}</span>}
            <span className={'badge' + (d.status === 'open' ? '' : ' grey')}>{d.status === 'open' ? 'Open' : d.status === 'paid' ? (d.kind.startsWith('credit') ? 'Done' : 'Paid') : 'Void'}</span>
            {src && <span>· from <a href={'#/' + lpath(src)}>{LTITLE[src.kind]} #{src.doc_no}</a></span>}
          </div>
        </div>
        <div className="row">
          {d.status === 'open' && (d.kind === 'invoice' || d.kind === 'purchase') && (
            <a className="btn" href={`#/${d.kind === 'invoice' ? 'payments-in' : 'payments-out'}/new?account=${d.account_id}&doc=${d.id}`}><Icon name="cash" /> {d.kind === 'invoice' ? 'Receive payment' : 'Pay'}</a>
          )}
          <a className="btn" href={`#/print/${d.id}`}><Icon name="invoice" /> Print</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid tiles" style={{ marginBottom: 16 }}>
        <div className="card tile"><div className="label">Total</div><div className="value num">{money(d.total)}</div></div>
        <div className="card tile"><div className="label">{d.kind.startsWith('credit') ? 'Applied' : 'Paid / credited'}</div><div className="value num">{money(d.paid)}</div></div>
        {!d.kind.startsWith('credit') && <div className="card tile"><div className="label">Balance</div><div className="value num" style={balance(d) < 0 ? { color: 'var(--ok)' } : undefined}>{money(balance(d))}</div>{balance(d) < 0 && <div className="note">credit in the customer's favour</div>}</div>}
        {profit && <div className="card tile" style={{ borderColor: 'var(--gold-deep)' }}><div className="label">TD profit (owner only)</div><div className="value num">{money(profit.td_profit)}</div><div className="note">cost {money(profit.cost)}</div></div>}
      </div>

      <div className="card">
        <div className="card-head"><h2>{lines.length} line{lines.length === 1 ? '' : 's'}</h2>
          {canCredit && chosen.length > 0 && <button className="btn primary sm" disabled={busy} onClick={credit}>{d.kind === 'invoice' ? `Customer returned ${chosen.length}` : `Return ${chosen.length} to supplier`}</button>}
        </div>
        <div className="table-wrap"><table className="t">
          <thead><tr>{canCredit && <th />}<th>Stock #</th><th>Description</th><th className="r">Pcs</th><th className="r">Ct</th><th className="r hide-sm">$/ct</th><th className="r">Amount</th>{profit && <th className="r">Profit</th>}</tr></thead>
          <tbody>{lines.map((l) => {
            const s = sel[l.id]; const op = openLine(l); const lp = lineProfit(l.id)
            return (
              <tr key={l.id} style={{ cursor: 'default' }} className={!l.item_id || op || !canCredit ? '' : 'inactive'}>
                {canCredit && <td>{op && <input type="checkbox" checked={!!s} onChange={() => setSel({ ...sel, [l.id]: s ? undefined : { pcs: '', ct: '' } })} />}</td>}
                <td className="num">{l.item_id ? <a href={'#/stock/' + l.item_id} onClick={(e) => { e.preventDefault(); go('stock/' + l.item_id) }}>{stock[l.item_id] ?? '…'}</a> : ''}</td>
                <td>{l.descr.replace(/^#\d+ /, '')}
                  {l.partner_id && <div className="small" style={{ color: 'var(--partner)' }}>Partnership · {partners[l.partner_id]} {l.partner_share}%{l.paid_by_partner ? ' · partner paid the supplier' : ''}</div>}
                  {!op && l.item_id && canCredit && <div className="small faint">{d.kind === 'invoice' ? 'Returned' : 'Returned to supplier'}</div>}
                  {s && l.pcs > 1 && <div className="row" style={{ marginTop: 6 }}>
                    <label className="f" style={{ width: 90 }}>Pcs back<input className="input sm" placeholder={String(l.pcs - l.done_pcs)} value={s.pcs} onChange={(e) => setSel({ ...sel, [l.id]: { ...s, pcs: e.target.value } })} /></label>
                    <label className="f" style={{ width: 100 }}>Ct back<input className="input sm" placeholder={String(Number(l.carat) - Number(l.done_ct))} value={s.ct} onChange={(e) => setSel({ ...sel, [l.id]: { ...s, ct: e.target.value } })} /></label></div>}
                </td>
                <td className="r num">{l.item_id ? l.pcs : ''}</td><td className="r num">{l.item_id ? Number(l.carat).toFixed(2) : ''}</td>
                <td className="r num hide-sm">{l.price_ct != null ? money(l.price_ct) : ''}</td><td className="r num">{money(l.amount)}</td>
                {profit && <td className="r num">{lp?.td_profit != null ? money(lp.td_profit) : ''}</td>}
              </tr>)
          })}</tbody>
        </table></div>
      </div>

      {(pays.length > 0 || credits.length > 0) && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Payments & credits</h2></div>
          <ul className="feed">
            {pays.map((p) => (
              <li key={p.id + p.app} onClick={() => go((p.kind === 'in' ? 'payments-in/' : 'payments-out/') + p.id)} style={{ cursor: 'pointer' }}>
                <span className="dot"><Icon name="cash" /></span>
                <div><div className="what">Payment #{p.doc_no} · {money(p.app)}{!p.active ? ` (${p.status === 'nsf' ? 'bounced' : 'void'})` : ''}</div><div className="detail">{p.method} {p.reference} · {day(p.pay_date)}</div></div>
                <span className="time">{when(p.created_at)}</span>
              </li>))}
            {credits.map((c) => (
              <li key={c.id} onClick={() => go(lpath(c))} style={{ cursor: 'pointer' }}>
                <span className="dot"><Icon name="undo" /></span>
                <div><div className="what">{LTITLE[c.kind]} #{c.doc_no} · {money(c.total)}</div><div className="detail">{day(c.doc_date)} · {personName(c.created_by, team)}</div></div>
                <span className="time">{when(c.created_at)}</span>
              </li>))}
          </ul>
        </div>
      )}
      <div className="faint small" style={{ marginTop: 12 }}>Created by {personName(d.created_by, team)} · {when(d.created_at)}{d.notes ? ` · ${d.notes}` : ''}</div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money } from '../lib/format'
import { go } from '../lib/router'
import Snap from '../components/Snap'

export type Waiting = {
  item_id: string; stock_no: number; descr: string; supplier_id: string; supplier: string; memo_in_id: string; memo_in_no: number
  vendor_memo: string; memo_in_line_id: string; memo_in_cost: number | null; invoice_id: string; invoice_no: number; inv_date: string
  customer_id: string; customer: string; days: number
}

/** Memo-in stones already sold to a customer, still waiting for the supplier's invoice (no vendor bill yet). */
export default function AwaitingBills() {
  const [rows, setRows] = useState<Waiting[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { supabase.rpc('memo_in_sold_waiting').then(({ data, error }) => (error ? setErr(errText(error)) : setRows((data ?? []) as Waiting[]))) }, [])
  const total = (rows ?? []).reduce((a, r) => a + Number(r.memo_in_cost ?? 0), 0)

  return (
    <>
      <div className="page-head">
        <div><h1>Sold from memo-in, waiting for vendor invoice</h1>
          <div className="sub">Stones sold to customers while still on memo to TD. Each becomes a vendor bill when the supplier’s invoice is entered.</div></div>
        <Snap label="Snap the vendor invoice" />
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card">
        <div className="card-head"><h2>{rows ? `${rows.length} stone${rows.length === 1 ? '' : 's'}` : ''}</h2>{rows && rows.length > 0 && <span className="faint small">memo-in value {money(total)}</span>}</div>
        {rows === null ? <div className="loading">Loading…</div> : rows.length === 0 ? (
          <div className="empty"><div className="big">Nothing waiting</div>Every memo-in stone sold so far has its vendor invoice.</div>
        ) : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Stock #</th><th>Stone</th><th>Supplier</th><th>Memo-in</th><th className="r">Memo-in $</th><th>Sold on</th><th>Customer</th><th className="r">Days</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.item_id + r.invoice_id} style={{ cursor: 'default' }}>
                <td className="nw"><a href={'#/stock/' + r.item_id}>#{r.stock_no}</a></td>
                <td>{r.descr}</td>
                <td><a href={'#/accounts/' + r.supplier_id}>{r.supplier}</a></td>
                <td className="nw"><a href={'#/memo-in/' + r.memo_in_id}>#{r.memo_in_no}</a>{r.vendor_memo ? <span className="faint"> ({r.vendor_memo})</span> : ''}</td>
                <td className="r num">{money(r.memo_in_cost)}</td>
                <td className="nw"><a href={'#/invoices/' + r.invoice_id}>Inv #{r.invoice_no}</a><div className="small faint">{day(r.inv_date)}</div></td>
                <td><a href={'#/accounts/' + r.customer_id}>{r.customer}</a></td>
                <td className="r num" style={r.days > 30 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{r.days}</td>
                <td className="nw"><button className="btn sm" onClick={() => go(`purchases/new?memo_in=${r.memo_in_id}&lines=${r.memo_in_line_id}`)}>Enter vendor invoice</button></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  )
}

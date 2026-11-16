import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { AccountPicker, ItemPicker } from '../components/Pickers'
import { itemLabel, type DocLine } from '../lib/docs'
import { queryParam } from '../lib/ledger'
import { r2, type Item } from '../lib/stock'

type L = { item: Item; memoLine: DocLine | null; memoNo: number | null; pcs: string; ct: string; amount: string }

/** New invoice. Items in stock, or items this customer has on memo (the memo is updated automatically). */
export default function InvoiceNew() {
  const { toast } = useApp()
  const [acc, setAcc] = useState<{ id: string; company: string } | null>(null)
  const [terms, setTerms] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<L[]>([])
  const [onMemo, setOnMemo] = useState<(DocLine & { docs: { doc_no: number; account_id: string } })[]>([])
  const [charges, setCharges] = useState<{ descr: string; amount: string }[]>([])
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pickAccount(a: { id: string; company: string } | null) {
    setAcc(a); setLines([])
    if (!a) return setOnMemo([])
    const { data: full } = await supabase.from('accounts').select('invoice_terms').eq('id', a.id).maybeSingle()
    setTerms(full?.invoice_terms != null ? String(full.invoice_terms) : '')
    const { data } = await supabase.from('doc_lines').select('*, docs!inner(doc_no, account_id, kind, status)').eq('docs.kind', 'memo').eq('docs.status', 'open').eq('docs.account_id', a.id)
    setOnMemo(((data ?? []) as typeof onMemo).filter((l) => l.done_ct < l.carat))
    return data
  }
  // From a memo page: ?memo=<id>&lines=a,b  — or from a stone page: ?item=<id>
  useEffect(() => {
    (async () => {
      const memo = queryParam('memo'), ids = (queryParam('lines') ?? '').split(',').filter(Boolean), itemId = queryParam('item')
      if (memo) {
        const { data: m } = await supabase.from('docs').select('account_id').eq('id', memo).maybeSingle()
        if (!m) return
        const { data: a } = await supabase.from('accounts').select('id,company').eq('id', m.account_id).maybeSingle()
        await pickAccount(a)
        const { data: ls } = await supabase.from('doc_lines').select('*, docs!inner(doc_no, account_id)').in('id', ids)
        const { data: its } = await supabase.from('items').select('*').in('id', (ls ?? []).map((l) => l.item_id))
        setLines((ls ?? []).map((l) => {
          const it = (its ?? []).find((x) => x.id === l.item_id) as Item
          const ct = Number(l.carat) - Number(l.done_ct)
          return { item: it, memoLine: l, memoNo: l.docs.doc_no, pcs: String(l.pcs - l.done_pcs), ct: String(r2(ct)),
            amount: l.amount != null ? (it.kind === 'parcel' && l.price_ct ? r2(Number(l.price_ct) * ct) : Number(l.amount)).toFixed(2) : '' }
        }))
      } else if (itemId) {
        const { data } = await supabase.from('items').select('*').eq('id', itemId).maybeSingle()
        if (data && data.status === 'available') addItem(data as Item)
      }
    })()
  }, [])

  function addItem(i: Item) {
    const ml = onMemo.find((l) => l.item_id === i.id && !lines.some((x) => x.memoLine?.id === l.id))
    if (ml) {
      const ct = Number(ml.carat) - Number(ml.done_ct)
      setLines((ls) => [...ls, { item: i, memoLine: ml, memoNo: ml.docs.doc_no, pcs: String(ml.pcs - ml.done_pcs), ct: String(r2(ct)),
        amount: ml.amount != null ? (i.kind === 'parcel' && ml.price_ct ? r2(Number(ml.price_ct) * ct) : Number(ml.amount)).toFixed(2) : '' }])
      return
    }
    const ct = i.kind === 'parcel' ? r2(Number(i.carat) - Number(i.memo_ct)) : Number(i.carat ?? 0)
    setLines((ls) => [...ls, { item: i, memoLine: null, memoNo: null, pcs: String(i.kind === 'parcel' ? i.pcs - i.memo_pcs : 1), ct: String(ct),
      amount: i.kind === 'parcel' ? (i.ask_ct != null ? r2(Number(i.ask_ct) * ct).toFixed(2) : '') : i.ask_total != null ? Number(i.ask_total).toFixed(2) : '' }])
  }
  const set = (i: number, k: keyof L, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const num = (s: string) => Number(s.replace(/[$,]/g, '')) || 0
  const total = lines.reduce((a, l) => a + num(l.amount), 0) + charges.reduce((a, c) => a + num(c.amount), 0)

  async function save() {
    if (!acc) return setErr('Choose the customer.')
    if (lines.some((l) => l.amount.trim() === '')) return setErr('Enter a price on every line.')
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('create_invoice', { p: {
      account_id: acc.id, doc_date: date, terms: terms === '' ? null : Number(terms), notes, memo_id: queryParam('memo'),
      lines: lines.map((l) => ({ item_id: l.item.id, memo_line_id: l.memoLine?.id ?? null, amount: num(l.amount),
        pcs: l.item.kind === 'parcel' ? Number(l.pcs) : null, carat: l.item.kind === 'parcel' ? Number(l.ct) : null })),
      charges: charges.filter((c) => c.descr && c.amount).map((c) => ({ descr: c.descr, amount: num(c.amount) })),
    } })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Invoice #${data.doc_no} created`); go('invoices/' + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/invoices" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Invoices</a>
      <div className="page-head"><div><h1>New invoice</h1><div className="sub">Scan stones in stock, or stones this customer has on memo.</div></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="wide" style={{ maxWidth: 520 }}><AccountPicker label="Customer *" value={acc?.id ?? ''} types={['customer', 'prospect', 'partner']} onChange={pickAccount} autoFocus={!queryParam('memo')} /></div>
          <label className="f">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="f">Terms (days)<input className="input" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
          <label className="f wide">Internal note<input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
      </div>
      <div className="card">
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <ItemPicker onPick={addItem} exclude={lines.filter((l) => l.item.kind !== 'parcel').map((l) => l.item.id)}
            filter={(i) => !i.mounted_in && (i.status === 'available' || onMemo.some((l) => l.item_id === i.id))} />
          {onMemo.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>{acc?.company} has {onMemo.length} item{onMemo.length === 1 ? '' : 's'} on memo. Scan them to invoice from the memo.</div>}
        </div>
        {lines.length > 0 && (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Stock #</th><th>Description</th><th className="r">Pcs</th><th className="r">Ct</th><th className="r">Price $</th><th /></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i} style={{ cursor: 'default' }}>
                <td className="num">{l.item.stock_no}</td>
                <td>{itemLabel(l.item)}
                  {l.memoNo && <div className="small" style={{ color: 'var(--accent)' }}>From memo #{l.memoNo}</div>}
                  {l.item.ownership === 'memo_in' && <div className="small" style={{ color: 'var(--warn)' }}>Memo-in stone: remember to buy it from the supplier</div>}
                  {l.item.partner_id && <div className="small" style={{ color: 'var(--partner)' }}>Partnership stone: partner's share is recorded automatically</div>}
                </td>
                <td className="r">{l.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 60 }} value={l.pcs} onChange={(e) => set(i, 'pcs', e.target.value)} /> : 1}</td>
                <td className="r">{l.item.kind === 'parcel' ? <input className="input sm num" style={{ width: 76 }} value={l.ct} onChange={(e) => set(i, 'ct', e.target.value)} /> : Number(l.item.carat ?? 0).toFixed(2)}</td>
                <td className="r"><input className="input sm num" style={{ width: 110, textAlign: 'right' }} value={l.amount} onChange={(e) => set(i, 'amount', e.target.value)} /></td>
                <td><button className="btn ghost danger sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="card-pad" style={{ borderTop: '1px solid var(--line)' }}>
          {charges.map((c, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <input className="input" style={{ flex: '1 1 200px' }} placeholder="Charge, e.g. Shipping / Setting" value={c.descr} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, descr: e.target.value } : x)))} />
              <input className="input num" style={{ width: 120 }} placeholder="$" value={c.amount} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button className="btn ghost danger sm" onClick={() => setCharges(charges.filter((_, j) => j !== i))}><Icon name="x" /></button>
            </div>))}
          <button className="btn sm" onClick={() => setCharges([...charges, { descr: '', amount: '' }])}><Icon name="plus" /> Add charge</button>
          <span style={{ float: 'right', fontWeight: 600 }}>Total {money(total)}</span>
        </div>
      </div>
      <div className="sticky-bar">
        <button className="btn" onClick={() => go('invoices')}>Cancel</button>
        <button className="btn primary" disabled={busy || !acc || (!lines.length && !charges.length)} onClick={save}>{busy ? 'Saving…' : 'Create invoice'}</button>
      </div>
    </>
  )
}

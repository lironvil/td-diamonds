import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { go } from '../lib/router'
import { useApp } from './ui'
import { amt, matchLines, memoInLines, newStone, normCert, saveHandoff, type InvLine, type Match, type MiCand } from '../lib/invoiceMatch'

type Diff = { stock: string; memo: number | null; inv: number }

/**
 * Supplier invoice photo -> purchase.
 * Asks "Is this from a memo-in?". Yes: matches every line to that supplier's memo-in (GIA # first, then lot #) and asks for one click.
 * No: the stones are bought as new stones; a GIA # already on an open memo-in is offered "Buy it from the memo-in".
 */
export default function InvoicePurchase({ intakeId, supplierId, supplierName, vendorDoc, date, lines, closed }: {
  intakeId: string; supplierId: string; supplierName: string; vendorDoc: string; date: string; lines: InvLine[]; closed: boolean
}) {
  const { toast } = useApp()
  const [fromMemo, setFromMemo] = useState<boolean | null>(null)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [conflicts, setConflicts] = useState<Record<number, MiCand>>({})
  const [buyFromMemo, setBuyFromMemo] = useState<Record<number, MiCand>>({})
  const [dupes, setDupes] = useState<Record<number, number>>({})
  const [confirm, setConfirm] = useState<{ diffs: Diff[]; run: () => void } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const sig = JSON.stringify([supplierId, lines.map((l) => [l.cert_no, l.vendor_stock])])

  useEffect(() => {
    setErr(null); setMatches(null); setConflicts({}); setBuyFromMemo({}); setDupes({})
    if (fromMemo === null || !supplierId || !lines.length) return
    setLoading(true)
    ;(async () => {
      try {
        if (fromMemo) {
          const cands = await memoInLines({ supplierId })
          setOpenCount(new Set(cands.filter((c) => c.open).map((c) => c.doc_id)).size)
          setMatches(matchLines(lines, cands))
        } else {
          const certs = [...new Set(lines.map((l) => l.cert_no).filter(Boolean))]
          const cands = (await memoInLines({ certs })).filter((c) => c.open)
          const cf: Record<number, MiCand> = {}
          for (const l of lines) { const c = cands.find((x) => normCert(x.cert_no) === normCert(l.cert_no)); if (l.cert_no && c) cf[l.key] = c }
          setConflicts(cf)
          if (certs.length) {
            const { data } = await supabase.from('items').select('stock_no, cert_no, ownership').in('cert_no', certs).in('status', ['available', 'on_memo']).eq('ownership', 'owned')
            const d: Record<number, number> = {}
            for (const l of lines) { const x = (data ?? []).find((r) => r.cert_no === l.cert_no); if (x) d[l.key] = x.stock_no }
            setDupes(d)
          }
        }
      } catch (e) { setErr(errText(e)) } finally { setLoading(false) }
    })()
  }, [fromMemo, sig])

  const names = (supplierName && `${supplierName}`) || 'this supplier'
  const label = (l: InvLine) => [l.carat && Number(l.carat).toFixed(2) + 'ct', l.shape, l.color, l.clarity, l.cert_no && `GIA ${l.cert_no}`, !l.cert_no && l.vendor_stock && `lot ${l.vendor_stock}`].filter(Boolean).join(' ')
  const missingPrice = lines.filter((l) => amt(l.cost_total) == null)

  function manual() {
    saveHandoff(intakeId, { supplierId, vendorDoc, date, lines })
    go(`purchases/new?intake=${intakeId}`)
  }

  async function submit(payload: unknown[], diffs: Diff[]) {
    const run = async () => {
      setConfirm(null); setBusy(true); setErr(null)
      const { data, error } = await supabase.rpc('purchase_from_intake', { p_id: intakeId, p: { account_id: supplierId, vendor_doc: vendorDoc, doc_date: date || null, lines: payload } })
      setBusy(false)
      if (error) return setErr(errText(error))
      toast(`Purchase #${data.doc_no} saved · ${payload.length} stone${payload.length === 1 ? '' : 's'}`)
      go('purchases/' + data.id)
    }
    if (diffs.length) setConfirm({ diffs, run }); else run()
  }

  function saveFromMemo() {
    if (!matches) return
    const diffs: Diff[] = []
    const payload = matches.map((m) => {
      const inv = amt(m.line.cost_total)!
      if (m.cand!.amount == null || Math.abs(m.cand!.amount - inv) >= 0.01) diffs.push({ stock: `#${m.cand!.stock_no} ${label(m.line)}`, memo: m.cand!.amount, inv })
      return { memo_in_line_id: m.cand!.line_id, amount: inv }
    })
    submit(payload, diffs)
  }

  function saveDirect() {
    const diffs: Diff[] = []
    const payload = lines.map((l) => {
      const inv = amt(l.cost_total)!
      const c = buyFromMemo[l.key]
      if (c) {
        if (c.amount == null || Math.abs(c.amount - inv) >= 0.01) diffs.push({ stock: `#${c.stock_no} ${label(l)}`, memo: c.amount, inv })
        return { memo_in_line_id: c.line_id, amount: inv }
      }
      return { amount: inv, new: newStone(l) }
    })
    submit(payload, diffs)
  }

  if (closed) return null
  const bad = matches?.filter((m) => m.problem !== 'none') ?? []
  const blockedConflicts = Object.entries(conflicts).filter(([k, c]) => !buyFromMemo[Number(k)] && c.account_id === supplierId)
  const otherSupplier = Object.entries(conflicts).filter(([, c]) => c.account_id !== supplierId)

  return (
    <>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>Is this from a memo-in?</h3>
        <div className="row" style={{ gap: 8 }}>
          <button className={'btn' + (fromMemo === true ? ' primary' : '')} onClick={() => setFromMemo(true)}>Yes, from a memo-in</button>
          <button className={'btn' + (fromMemo === false ? ' primary' : '')} onClick={() => setFromMemo(false)}>No, new stones</button>
        </div>
        {fromMemo !== null && !supplierId && <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>Choose the supplier above first.</div>}
        {missingPrice.length > 0 && fromMemo !== null && <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>Enter the price on line{missingPrice.length > 1 ? 's' : ''} {missingPrice.map((l) => l.key + 1).join(', ')}.</div>}
        {err && <div className="alert" style={{ marginTop: 12, marginBottom: 0 }}>{err}</div>}
        {loading && <div className="loading" style={{ padding: 10 }}>Checking memo-ins…</div>}
      </div>

      {fromMemo === true && matches && supplierId && (
        bad.length > 0 ? (
          <div className="card card-pad">
            <div className="alert" style={{ marginBottom: 12 }}>
              {openCount === 0 ? <>There is no open memo-in from {names}.</> : <>Some lines don’t match a memo-in from {names}.</>}
            </div>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
              {bad.map((m) => (
                <li key={m.line.key}>Line {m.line.key + 1}: {label(m.line)} — {m.problem === 'done'
                  ? <>on memo-in #{m.cand!.doc_no} (stock #{m.cand!.stock_no}) but already returned or bought</>
                  : 'no matching memo-in stone'}</li>
              ))}
            </ul>
            <button className="btn" onClick={manual}>Enter the purchase myself</button>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>Matched to memo-in</h2><span className="faint small">{matches.length} of {matches.length} lines</span></div>
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Invoice line</th><th>Memo-in</th><th>Stock #</th><th className="r">Memo-in $</th><th className="r">Invoice $</th></tr></thead>
              <tbody>{matches.map((m) => {
                const inv = amt(m.line.cost_total), diff = inv != null && m.cand!.amount != null && Math.abs(inv - m.cand!.amount) >= 0.01
                return (
                  <tr key={m.line.key} style={{ cursor: 'default' }}>
                    <td>{label(m.line)}<div className="small faint">matched by {m.by === 'gia' ? 'GIA #' : 'lot #'}</div></td>
                    <td className="nw">#{m.cand!.doc_no}{m.cand!.vendor_doc ? <span className="faint"> ({m.cand!.vendor_doc})</span> : ''}</td>
                    <td className="nw"><a href={'#/stock/' + m.cand!.item_id}>#{m.cand!.stock_no}</a>{m.cand!.item_status === 'sold' && <span className="badge grey" style={{ marginLeft: 6 }}>Sold</span>}</td>
                    <td className="r num">{money(m.cand!.amount)}</td>
                    <td className="r num" style={diff ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{money(inv)}</td>
                  </tr>)
              })}</tbody>
            </table></div>
            <div className="sticky-bar" style={{ marginTop: 0 }}>
              <button className="btn" onClick={manual} disabled={busy}>Enter it myself</button>
              <button className="btn primary" disabled={busy || missingPrice.length > 0} onClick={saveFromMemo}>{busy ? 'Saving…' : `Confirm purchase of ${matches.length} stone${matches.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        )
      )}

      {fromMemo === false && supplierId && !loading && (
        <div className="card card-pad">
          {Object.entries(conflicts).filter(([, c]) => c.account_id === supplierId).map(([k, c]) => {
            const l = lines.find((x) => x.key === Number(k))!
            return (
              <div key={k} className={'alert' + (buyFromMemo[Number(k)] ? ' info' : '')} style={{ marginBottom: 10 }}>
                GIA {l.cert_no} is on memo-in #{c.doc_no} from {names}.{' '}
                {buyFromMemo[Number(k)] ? <b>Will be bought from the memo-in (stock #{c.stock_no}).</b>
                  : <>Buy it from the memo-in? <button className="btn sm primary" style={{ marginLeft: 6 }} onClick={() => setBuyFromMemo({ ...buyFromMemo, [Number(k)]: c })}>Buy from memo-in #{c.doc_no}</button></>}
              </div>)
          })}
          {otherSupplier.map(([k, c]) => {
            const l = lines.find((x) => x.key === Number(k))!
            return <div key={k} className="alert" style={{ marginBottom: 10 }}>GIA {l.cert_no} is on memo-in #{c.doc_no} from another supplier (stock #{c.stock_no}). Check the supplier, or return it on that memo-in first.</div>
          })}
          {Object.entries(dupes).map(([k, no]) => {
            const l = lines.find((x) => x.key === Number(k))!
            return <div key={k} className="alert" style={{ marginBottom: 10 }}>GIA {l.cert_no} is already TD’s stock as #{no}.</div>
          })}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={manual} disabled={busy}>Enter it myself</button>
            <button className="btn primary" disabled={busy || missingPrice.length > 0 || blockedConflicts.length > 0 || otherSupplier.length > 0 || Object.keys(dupes).length > 0} onClick={saveDirect}>
              {busy ? 'Saving…' : `Save purchase · ${lines.length} stone${lines.length === 1 ? '' : 's'} · ${money(lines.reduce((a, l) => a + (amt(l.cost_total) ?? 0), 0))}`}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="help-back" onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div className="help-box card" style={{ width: 'min(620px, 100%)' }} role="dialog" aria-label="Prices differ">
            <div className="card-head"><h3>Prices differ from the memo-in</h3></div>
            <div className="card-pad">
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Stone</th><th className="r">Memo-in</th><th className="r">Invoice</th><th className="r">Change</th></tr></thead>
                <tbody>{confirm.diffs.map((d, i) => (
                  <tr key={i} style={{ cursor: 'default' }}><td>{d.stock}</td><td className="r num">{money(d.memo)}</td><td className="r num"><b>{money(d.inv)}</b></td>
                    <td className="r num">{d.memo != null ? (d.inv - d.memo > 0 ? '+' : '') + money(d.inv - d.memo) : ''}</td></tr>))}
                </tbody>
              </table></div>
              <div className="muted small" style={{ marginTop: 10 }}>The invoice price becomes the stone’s cost, also on any customer invoice it is already on.</div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
                <button className="btn primary" autoFocus onClick={confirm.run}>Continue</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

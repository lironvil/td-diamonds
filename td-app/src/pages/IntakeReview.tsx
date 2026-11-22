import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money, personName, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { CLARITIES, DOC_KIND, SHAPES, matchAccount, r2, readIntake, signedUrl, type Extraction, type Intake, type XStone } from '../lib/stock'
import { ItemPicker } from '../components/Pickers'
import InvoicePurchase from '../components/InvoicePurchase'

type Acc = { id: string; company: string; types: string[] }
type Line = {
  key: number; include: boolean; existingId: string | null; existingNo: number | null
  shape: string; carat: string; color: string; clarity: string; lab: string; cert_no: string; vendor_stock: string
  rap_ct: string; cost_total: string; priceCt: number | null; extra: XStone
}
const EXTRA_KEYS = ['cut', 'polish', 'symmetry', 'fluorescence', 'measurements', 'depth_pct', 'table_pct', 'girdle', 'culet', 'inscription', 'cert_date', 'key_to_symbols', 'lab_comments']
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: string) => { const x = Number(v.replace(/[$,\s]/g, '')); return v.trim() && isFinite(x) ? x : null }

export default function IntakeReview({ id }: { id: string }) {
  const { team, toast } = useApp()
  const [it, setIt] = useState<Intake | null>(null)
  const [urls, setUrls] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [accs, setAccs] = useState<Acc[]>([])
  const [reading, setReading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('memo')
  const [supplierId, setSupplierId] = useState('')
  const [ownership, setOwnership] = useState<'owned' | 'memo_in'>('memo_in')
  const [vendorDoc, setVendorDoc] = useState('')
  const [received, setReceived] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const started = useRef(false)

  async function loadAccounts() {
    const { data } = await supabase.from('accounts').select('id,company,types').eq('active', true).order('company')
    setAccs(data ?? []); return (data ?? []) as Acc[]
  }

  async function applyExtraction(x: Extraction, list: Acc[]) {
    const k = x.document_type === 'other' ? 'memo' : x.document_type
    setKind(k)
    setOwnership(k === 'memo' ? 'memo_in' : 'owned')
    setVendorDoc(x.doc_number ?? '')
    setReceived(x.doc_date && x.doc_date <= new Date().toISOString().slice(0, 10) ? x.doc_date : new Date().toISOString().slice(0, 10))
    const m = matchAccount(x.supplier, list)
    setSupplierId(m?.id ?? '')
    const certs = x.stones.map((st) => s(st.cert_no)).filter(Boolean)
    const existing: Record<string, { id: string; stock_no: number }> = {}
    if (certs.length) {
      const { data } = await supabase.from('items').select('id,stock_no,cert_no').in('cert_no', certs).in('status', ['available', 'on_memo'])
      for (const r of data ?? []) existing[r.cert_no] = r
    }
    setLines(x.stones.map((st, i) => {
      const carat = typeof st.carat === 'number' ? st.carat : null
      const amount = typeof st.amount === 'number' ? st.amount : typeof st.price_ct === 'number' && carat ? r2(st.price_ct * carat) : null
      const ex = existing[s(st.cert_no)]
      const extra: XStone = {}
      for (const key of EXTRA_KEYS) if (st[key] != null) extra[key] = st[key]
      return {
        key: i, include: true, existingId: ex?.id ?? null, existingNo: ex?.stock_no ?? null,
        shape: s(st.shape), carat: s(carat), color: s(st.color), clarity: s(st.clarity), lab: s(st.lab) || 'GIA', cert_no: s(st.cert_no),
        vendor_stock: s(st.vendor_stock), rap_ct: s(st.rap_ct), cost_total: amount != null ? amount.toFixed(2) : '',
        priceCt: typeof st.price_ct === 'number' ? st.price_ct : null, extra,
      }
    }))
  }

  async function load() {
    const [{ data, error }, list] = await Promise.all([supabase.from('intakes').select('*').eq('id', id).maybeSingle(), loadAccounts()])
    if (error || !data) { setErr(error ? errText(error) : 'Photo not found.'); return }
    const intake = data as Intake
    setIt(intake)
    Promise.all(intake.files.map((f) => signedUrl(f.path))).then((u) => setUrls(u.map((x) => x ?? '')))
    if (intake.extraction) applyExtraction(intake.extraction, list)
    else if (!started.current && (intake.status === 'new' || intake.status === 'failed')) { started.current = true; read(false, list) }
  }
  useEffect(() => { load() }, [id])

  async function read(force: boolean, list = accs) {
    setReading(true); setErr(null)
    try {
      const x = await readIntake(id, force)
      await applyExtraction(x, list)
      const { data } = await supabase.from('intakes').select('*').eq('id', id).maybeSingle()
      if (data) setIt(data as Intake)
    } catch (e) { setErr(errText(e)) } finally { setReading(false) }
  }

  const x = it?.extraction
  const included = lines.filter((l) => l.include)
  const sum = r2(included.filter((l) => !l.existingId).reduce((a, l) => a + (n(l.cost_total) ?? 0), 0))
  const allSum = r2(lines.reduce((a, l) => a + (n(l.cost_total) ?? 0), 0))
  const checks = useMemo(() => {
    const out: { level: 'bad' | 'warn' | 'ok'; text: string }[] = []
    if (x?.doc_total != null && lines.length) {
      const diff = r2(allSum - x.doc_total)
      out.push(Math.abs(diff) < 0.01
        ? { level: 'ok', text: `Lines add up to the document total ${money(x.doc_total)}.` }
        : { level: 'bad', text: `Lines add up to ${money(allSum)}, the document says ${money(x.doc_total)} (difference ${money(diff)}).` })
    }
    const seen = new Set<string>()
    for (const l of lines) {
      const label = `Line ${l.key + 1}`
      if (l.cert_no && seen.has(l.cert_no)) out.push({ level: 'bad', text: `${label}: report ${l.cert_no} appears twice.` })
      if (l.cert_no) seen.add(l.cert_no)
      if (!l.include) continue
      if (!l.shape || !n(l.carat)) out.push({ level: 'bad', text: `${label}: shape and carat are needed.` })
      if (l.priceCt && n(l.carat) && n(l.cost_total) != null && Math.abs(r2(l.priceCt * n(l.carat)!) - n(l.cost_total)!) > 1)
        out.push({ level: 'warn', text: `${label}: $/ct × carat = ${money(r2(l.priceCt * n(l.carat)!))}, amount says ${money(n(l.cost_total))}.` })
      if (kind === 'invoice') continue
      if (kind === 'gia_cert' && !l.existingId) out.push({ level: 'bad', text: `${label}: ${l.lab} ${l.cert_no || 'report'} is not in stock. A certificate only updates a stone already in stock — pick the stock # below, or enter new stones through a memo-in or a purchase.` })
      if (l.existingId) out.push({ level: 'warn', text: kind === 'gia_cert' ? `${label}: updates stock #${l.existingNo} — grading from the certificate, certificate attached; price and supplier stay as they are.` : `${label}: ${l.lab} ${l.cert_no} is already in stock as #${l.existingNo}. Saving updates its grading and attaches this ${DOC_KIND[kind]?.toLowerCase() ?? 'file'}; price and supplier stay as they are.` })
    }
    if (kind !== 'invoice' && ownership === 'memo_in' && !supplierId) out.push({ level: 'bad', text: 'Choose the supplier (memo-in stones belong to a supplier).' })
    return out
  }, [lines, x, ownership, supplierId, allSum, kind])
  const blocking = checks.some((c) => c.level === 'bad' && !c.text.includes('document says'))

  const setLine = (key: number, k: keyof Line, v: string | boolean) => setLines(lines.map((l) => (l.key === key ? { ...l, [k]: v } : l)))

  async function addSupplier() {
    if (!x?.supplier) return
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('save_account', { p: { company: x.supplier, types: ['supplier'] } })
    setBusy(false)
    if (error) return setErr(errText(error))
    await loadAccounts(); setSupplierId(data.id); toast(`${x.supplier} added as supplier #${data.acct_no}`)
  }

  async function save() {
    setBusy(true); setErr(null)
    const payload = included.map((l) => {
      const grading = { shape: l.shape, carat: n(l.carat), color: l.color, clarity: l.clarity, lab: l.lab, cert_no: l.cert_no, ...l.extra }
      if (l.existingId) return { id: l.existingId, ...grading }
      return { ...grading, vendor_stock: l.vendor_stock, rap_ct: n(l.rap_ct), cost_total: n(l.cost_total) }
    })
    const header = { doc_kind: kind, supplier_id: supplierId || null, ownership, vendor_doc: vendorDoc, received: received || null }
    const { data, error } = await supabase.rpc('save_intake', { p_id: id, p_header: header, p_lines: payload })
    setBusy(false)
    if (error) return setErr(errText(error))
    const all = data as { id: string; stock_no: number; updated?: boolean; memo_in_id?: string; memo_in_no?: number }[]
    const mi = all.find((r) => r.memo_in_id)
    const res = all.filter((r) => r.id)
    const added = res.filter((r) => !r.updated), upd = res.filter((r) => r.updated)
    toast([added.length && `${added.length} added (#${added.map((r) => r.stock_no).join(', #')})`, upd.length && `${upd.length} updated`].filter(Boolean).join(' · '))
    if (mi) { toast(`Memo-in #${mi.memo_in_no} created with ${added.length} item${added.length === 1 ? '' : 's'}`); go('memo-in/' + mi.memo_in_id) }
    else if (res.length === 1) go('stock/' + res[0].id)
    else go('stock')
  }

  async function discard() {
    if (!confirm('Discard this photo? Nothing will be added to stock.')) return
    const { error } = await supabase.rpc('discard_intake', { p_id: id })
    if (error) return setErr(errText(error))
    toast('Discarded'); go('inbox')
  }

  if (!it) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  const closed = it.status === 'saved' || it.status === 'discarded'
  const supplierMissing = x?.supplier && !supplierId

  return (
    <>
      <a className="btn ghost sm" href="#/inbox" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Inbox</a>
      <div className="page-head">
        <div>
          <h1>{x ? [DOC_KIND[kind], x.supplier, x.doc_number && '#' + x.doc_number].filter(Boolean).join(' · ') : 'Reading the photo…'}</h1>
          <div className="sub">Sent by {personName(it.created_by, team)}{it.source === 'memo_app' ? ' from the Memo app' : ''} · {when(it.created_at)}</div>
        </div>
        {!closed && (
          <div className="row">
            <button className="btn ghost danger" onClick={discard} disabled={busy}>Discard</button>
            <button className="btn" onClick={() => read(true)} disabled={reading || busy}>Read again</button>
          </div>
        )}
      </div>
      {closed && (
        <div className="alert info">
          {it.status === 'saved' ? <>Saved by {personName(it.closed_by ?? '', team)} · {when(it.closed_at)}. {it.item_ids.length} stone{it.item_ids.length === 1 ? '' : 's'}: <a href="#/stock">open White diamonds</a></> : `Discarded by ${personName(it.closed_by ?? '', team)}.`}
        </div>
      )}
      {err && <div className="alert">{err}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)', alignItems: 'start' }} data-review>
        <div className="card" style={{ position: 'sticky', top: 12, overflow: 'hidden' }}>
          {it.files.length > 1 && (
            <div className="chips card-pad" style={{ paddingBottom: 0 }}>
              {it.files.map((_, i) => <button key={i} className={'chip' + (page === i ? ' on' : '')} onClick={() => setPage(i)}>Page {i + 1}</button>)}
            </div>
          )}
          <div className="card-pad">
            {!urls[page] ? <div className="loading">Loading photo…</div> : it.files[page]?.mime === 'application/pdf'
              ? <iframe title="Document" src={urls[page]} style={{ width: '100%', height: 640, border: 0, borderRadius: 8 }} />
              : <a href={urls[page]} target="_blank" rel="noreferrer"><img src={urls[page]} alt="Document" style={{ width: '100%', borderRadius: 8, display: 'block' }} /></a>}
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          {reading && <div className="card card-pad"><div className="loading" style={{ padding: 10 }}>Reading the document… usually 5–20 seconds.</div></div>}
          {it.status === 'failed' && !reading && !x && <div className="alert">{it.error || 'Reading failed.'} You can tap Read again, or <a href="#/stock/new">type the stone in</a>.</div>}

          {x && (
            <>
              {x.warnings.length > 0 && (
                <div className="card card-pad">
                  <h3 style={{ marginBottom: 8 }}>Notes from the reader</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">{x.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}

              <div className="card card-pad">
                <h3 style={{ marginBottom: 12 }}>Document</h3>
                <div className="chips" style={{ marginBottom: 12 }}>
                  {['gia_cert', 'memo', 'invoice'].map((k) => (
                    <button key={k} disabled={closed} className={'chip' + (kind === k ? ' on' : '')} onClick={() => { setKind(k); setOwnership(k === 'memo' ? 'memo_in' : 'owned') }}>{DOC_KIND[k]}</button>
                  ))}
                  {kind === 'memo' && <>
                  <span style={{ width: 12 }} />
                  <button disabled={closed} className={'chip' + (ownership === 'owned' ? ' on' : '')} onClick={() => setOwnership('owned')}>Owned by TD</button>
                  <button disabled={closed} className={'chip' + (ownership === 'memo_in' ? ' on' : '')} onClick={() => setOwnership('memo_in')}>Memo-in</button>
                  </>}
                </div>
                {kind !== 'gia_cert' && <div className="form-grid">
                  <label className="f">Supplier{ownership === 'memo_in' ? ' *' : ''}
                    <select className="input" disabled={closed} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">{x.supplier ? `Not matched: ${x.supplier}` : '—'}</option>
                      {accs.filter((a) => a.types.includes('supplier') || a.types.includes('partner') || a.id === supplierId).map((a) => <option key={a.id} value={a.id}>{a.company}</option>)}
                    </select>
                  </label>
                  <label className="f">Vendor {DOC_KIND[kind]?.toLowerCase()} #<input className="input" disabled={closed} value={vendorDoc} onChange={(e) => setVendorDoc(e.target.value)} /></label>
                  <label className="f">{kind === 'invoice' ? 'Invoice date' : 'Received'}<input className="input" type="date" disabled={closed} value={received} onChange={(e) => setReceived(e.target.value)} /></label>
                </div>}
                {supplierMissing && !closed && kind !== 'gia_cert' && <button className="btn sm" style={{ marginTop: 10 }} onClick={addSupplier} disabled={busy}><Icon name="plus" /> Add “{x.supplier}” as a new supplier</button>}
              </div>

              <div className="card">
                <div className="card-head"><h2>{lines.length} stone{lines.length === 1 ? '' : 's'} read</h2><span className="faint small">Tap a line for full grading</span></div>
                <div className="table-wrap">
                  <table className="t review">
                    <thead><tr><th /><th>Shape</th><th className="r">Ct</th><th>Col</th><th>Clar</th><th>Report #</th><th className="hide-sm">Vendor #</th><th className="r">Cost $</th></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <Fragment key={l.key}>
                          <tr className={l.include ? '' : 'inactive'} style={{ cursor: 'default' }}>
                            <td><input type="checkbox" disabled={closed} checked={l.include} onChange={(e) => setLine(l.key, 'include', e.target.checked)} aria-label="Include" /></td>
                            <td><select className="input sm" style={{ minWidth: 104 }} disabled={closed} value={l.shape} onChange={(e) => setLine(l.key, 'shape', e.target.value)}><option value="">?</option>{SHAPES.map((x) => <option key={x}>{x}</option>)}</select></td>
                            <td className="r"><input className="input sm num" disabled={closed} style={{ width: 70, textAlign: 'right' }} value={l.carat} onChange={(e) => setLine(l.key, 'carat', e.target.value)} /></td>
                            <td><input className="input sm" disabled={closed} style={{ width: 52 }} value={l.color} onChange={(e) => setLine(l.key, 'color', e.target.value.toUpperCase())} /></td>
                            <td><select className="input sm" style={{ minWidth: 76 }} disabled={closed} value={l.clarity} onChange={(e) => setLine(l.key, 'clarity', e.target.value)}><option value="">—</option>{CLARITIES.map((x) => <option key={x}>{x}</option>)}</select></td>
                            <td className="nw"><input className="input sm num" disabled={closed} style={{ width: 120 }} value={l.cert_no} onChange={(e) => setLine(l.key, 'cert_no', e.target.value.replace(/\s/g, ''))} />
                              {l.existingNo && kind !== 'invoice' && <div className="small" style={{ color: 'var(--warn)' }}>{kind === 'gia_cert' ? 'Updates' : 'In stock'} #{l.existingNo}{kind === 'gia_cert' && !closed && <button className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, existingId: null, existingNo: null } : x)))} aria-label="Change stone">×</button>}</div>}
                              {kind === 'gia_cert' && !l.existingId && !closed && <div style={{ width: 200, marginTop: 4 }}><ItemPicker placeholder="Stock # this belongs to"
                                filter={(x) => x.kind === 'white_diamond'} onPick={(x) => setLines(lines.map((y) => (y.key === l.key ? { ...y, existingId: x.id, existingNo: x.stock_no } : y)))} /></div>}</td>
                            <td className="hide-sm"><input className="input sm" disabled={closed} style={{ width: 80 }} value={l.vendor_stock} onChange={(e) => setLine(l.key, 'vendor_stock', e.target.value)} /></td>
                            <td className="r nw">
                              {l.existingId && kind !== 'invoice' ? <span className="faint small">kept</span> : <input className="input sm num" disabled={closed} style={{ width: 100, textAlign: 'right' }} value={l.cost_total} onChange={(e) => setLine(l.key, 'cost_total', e.target.value)} />}
                              <button className="btn ghost sm" style={{ padding: '2px 6px' }} onClick={() => setOpen(open === l.key ? null : l.key)} aria-label="More">{open === l.key ? '−' : '+'}</button>
                            </td>
                          </tr>
                          {open === l.key && (
                            <tr style={{ cursor: 'default' }}>
                              <td />
                              <td colSpan={7} className="small muted">
                                {Object.keys(l.extra).length === 0 ? 'No more details on this document.' :
                                  Object.entries(l.extra).map(([k, v]) => <span key={k} style={{ marginRight: 14, display: 'inline-block' }}><b style={{ fontWeight: 600 }}>{k.replace(/_/g, ' ')}:</b> {String(v)}</span>)}
                                {l.rap_ct && <span style={{ display: 'inline-block' }}><b style={{ fontWeight: 600 }}>rap/ct:</b> {money(n(l.rap_ct))}</span>}
                                <div className="faint" style={{ marginTop: 4 }}>Edit these after saving, on the stone’s page.</div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={8} className="small">
                      {kind === 'gia_cert' ? `${included.length} to update`
                        : kind === 'invoice' ? `${included.length} line${included.length === 1 ? '' : 's'} · ${included.reduce((a, l) => a + (n(l.carat) ?? 0), 0).toFixed(2)} ct · total ${money(r2(included.reduce((a, l) => a + (n(l.cost_total) ?? 0), 0)))}`
                        : <>{included.length} to save · {included.reduce((a, l) => a + (n(l.carat) ?? 0), 0).toFixed(2)} ct · new stones cost {money(sum)}</>}
                    </td></tr></tfoot>
                  </table>
                </div>
              </div>

              <div className="card card-pad">
                <h3 style={{ marginBottom: 8 }}>Checks</h3>
                {checks.length === 0 ? <div className="muted">Nothing to flag.</div> : (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                    {checks.map((c, i) => (
                      <li key={i} style={{ color: c.level === 'bad' ? 'var(--bad)' : c.level === 'warn' ? 'var(--warn)' : 'var(--ok)' }}>
                        {c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕'} {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {kind === 'invoice' ? (
                <InvoicePurchase intakeId={id} closed={closed} supplierId={supplierId} supplierName={accs.find((a) => a.id === supplierId)?.company ?? ''}
                  vendorDoc={vendorDoc} date={received}
                  lines={included.map((l) => ({ key: l.key, shape: l.shape, carat: l.carat, color: l.color, clarity: l.clarity, lab: l.lab, cert_no: l.cert_no, vendor_stock: l.vendor_stock, rap_ct: l.rap_ct, cost_total: l.cost_total, extra: l.extra }))} />
              ) : !closed && (
                <div className="sticky-bar" style={{ marginTop: 0 }}>
                  <button className="btn primary" disabled={busy || blocking || included.length === 0} onClick={save}>
                    {busy ? 'Saving…' : kind === 'gia_cert' ? `Update ${included.length} stone${included.length === 1 ? '' : 's'}` : `Save ${included.length} stone${included.length === 1 ? '' : 's'} to stock`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

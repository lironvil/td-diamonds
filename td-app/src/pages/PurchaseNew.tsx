import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { AccountPicker } from '../components/Pickers'
import { queryParam } from '../lib/ledger'
import { CLARITIES, SHAPES, matchAccount, type Intake } from '../lib/stock'
import { matchLines, memoInLines, newStone, readHandoff, type InvLine } from '../lib/invoiceMatch'

type MiLine = { id: string; doc_id: string; item_id: string; pcs: number; carat: number; amount: number | null; done_ct: number; descr: string; docs: { doc_no: number; doc_date: string; vendor_doc: string } }
type Part = { on: boolean; partner: string; share: string; paidByPartner: boolean }
type NewL = { kind: 'white_diamond' | 'parcel'; shape: string; pcs: string; carat: string; color: string; clarity: string; cert_no: string; amount: string; part: Part; inv?: InvLine }
const noPart = (): Part => ({ on: false, partner: '', share: '50', paidByPartner: false })
const blank = (): NewL => ({ kind: 'white_diamond', shape: '', pcs: '1', carat: '', color: '', clarity: '', cert_no: '', amount: '', part: noPart() })
const toNew = (l: InvLine): NewL => ({ ...blank(), shape: l.shape, carat: l.carat, color: l.color, clarity: l.clarity, cert_no: l.cert_no, amount: l.cost_total, inv: l })

/** New purchase (vendor bill): tick memo-in stones you are buying, and/or add new stones. Partnership per line. */
export default function PurchaseNew() {
  const { toast } = useApp()
  const [sup, setSup] = useState<{ id: string; company: string } | null>(null)
  const [vendorDoc, setVendorDoc] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [terms, setTerms] = useState('')
  const [mi, setMi] = useState<MiLine[]>([])
  const [pick, setPick] = useState<Record<string, { amount: string; part: Part } | undefined>>({})
  const [news, setNews] = useState<NewL[]>([])
  const [partners, setPartners] = useState<{ id: string; company: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const intakeId = queryParam('intake')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { supabase.from('accounts').select('id,company').eq('active', true).order('company').then(({ data }) => setPartners(data ?? [])) }, [])
  async function pickSupplier(a: { id: string; company: string } | null, preselect: string[] = []) {
    setSup(a); setPick({})
    if (!a) return setMi([])
    const { data: acc } = await supabase.from('accounts').select('invoice_terms').eq('id', a.id).maybeSingle()
    setTerms(acc?.invoice_terms != null ? String(acc.invoice_terms) : '')
    const { data } = await supabase.from('doc_lines').select('*, docs!inner(doc_no, doc_date, vendor_doc, kind, status, account_id)')
      .eq('docs.kind', 'memo_in').eq('docs.status', 'open').eq('docs.account_id', a.id)
    const open = ((data ?? []) as MiLine[]).filter((l) => l.done_ct < l.carat)
    setMi(open)
    if (preselect.length) setPick(Object.fromEntries(open.filter((l) => preselect.includes(l.id)).map((l) => [l.id, { amount: l.amount != null ? String(l.amount) : '', part: noPart() }])))
  }
  useEffect(() => {
    const memo = queryParam('memo_in'); if (!memo) return
    const ids = (queryParam('lines') ?? '').split(',').filter(Boolean)
    supabase.from('docs').select('account_id').eq('id', memo).maybeSingle().then(async ({ data }) => {
      if (!data) return
      const { data: a } = await supabase.from('accounts').select('id,company').eq('id', data.account_id).maybeSingle()
      pickSupplier(a, ids)
    })
  }, [])

  // From an invoice photo in the Inbox: supplier, invoice #, date; memo-in stones that match are ticked at the invoice price, the rest are new stones.
  useEffect(() => {
    if (!intakeId) return
    ;(async () => {
      const { data } = await supabase.from('intakes').select('*').eq('id', intakeId).maybeSingle()
      const it = data as Intake | null
      if (!it || it.status === 'saved' || it.status === 'discarded') return setErr('This invoice photo was already handled.')
      let h = readHandoff(intakeId)
      if (!h && it.extraction) {
        const { data: accs } = await supabase.from('accounts').select('id,company').eq('active', true)
        const x = it.extraction
        h = { supplierId: matchAccount(x.supplier, accs ?? [])?.id ?? '', vendorDoc: x.doc_number ?? '', date: x.doc_date ?? '',
          lines: x.stones.map((st, i) => { const v = (k: string) => (st[k] == null ? '' : String(st[k])); return { key: i, shape: v('shape'), carat: v('carat'), color: v('color'), clarity: v('clarity'), lab: v('lab') || 'GIA', cert_no: v('cert_no'), vendor_stock: v('vendor_stock'), rap_ct: v('rap_ct'), cost_total: v('amount'), extra: {} } }) }
      }
      if (!h) return
      setVendorDoc(h.vendorDoc); if (h.date) setDate(h.date)
      if (!h.supplierId) { setNote('Invoice photo loaded. Choose the supplier.'); setNews(h.lines.map(toNew)); return }
      const { data: a } = await supabase.from('accounts').select('id,company').eq('id', h.supplierId).maybeSingle()
      await pickSupplier(a)
      const m = matchLines(h.lines, (await memoInLines({ supplierId: h.supplierId })).filter((c) => c.open))
      const picked = m.filter((x) => x.cand)
      setPick(Object.fromEntries(picked.map((x) => [x.cand!.line_id, { amount: x.line.cost_total, part: noPart() }])))
      setNews(m.filter((x) => !x.cand).map((x) => toNew(x.line)))
      setNote(`From the invoice photo: ${picked.length} line${picked.length === 1 ? '' : 's'} ticked from memo-in, ${m.length - picked.length} as new stones. Check and save.`)
    })()
  }, [])

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[$,]/g, '')))
  const partFields = (p: Part) => (p.on && p.partner ? { partner_id: p.partner, partner_share: Number(p.share) || 50, paid_by_partner: p.paidByPartner } : {})
  const chosen = Object.entries(pick).filter(([, v]) => v)
  const owed = chosen.reduce((a, [, v]) => a + (v!.part.on && v!.part.paidByPartner ? 0 : num(v!.amount) ?? 0), 0) + news.reduce((a, n) => a + (n.part.on && n.part.paidByPartner ? 0 : num(n.amount) ?? 0), 0)

  async function save() {
    if (!sup) return setErr('Choose the supplier.')
    const lines = [
      ...chosen.map(([id, v]) => ({ memo_in_line_id: id, amount: num(v!.amount), ...partFields(v!.part) })),
      ...news.filter((n) => n.shape || n.carat).map((n) => ({ amount: num(n.amount), ...partFields(n.part),
        new: { ...(n.inv && n.kind === 'white_diamond' ? newStone(n.inv) : {}), kind: n.kind, shape: n.shape, pcs: n.kind === 'parcel' ? num(n.pcs) : 1, carat: num(n.carat), color: n.color, clarity: n.clarity, cert_no: n.cert_no } })),
    ]
    if (!lines.length) return setErr('Tick memo-in stones or add new stones.')
    setBusy(true); setErr(null)
    const p = { account_id: sup.id, vendor_doc: vendorDoc, doc_date: date, terms: terms === '' ? null : Number(terms), lines }
    const { data, error } = intakeId ? await supabase.rpc('purchase_from_intake', { p_id: intakeId, p }) : await supabase.rpc('create_purchase', { p })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(`Purchase #${data.doc_no} saved`); go('purchases/' + data.id)
  }

  return (
    <>
      <a className="btn ghost sm" href="#/purchases" style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Purchases</a>
      <div className="page-head"><div><h1>New purchase</h1><div className="sub">The supplier’s invoice to TD. Memo-in stones you buy become TD stock and leave the memo-in.</div></div></div>
      {err && <div className="alert">{err}</div>}
      {note && <div className="alert info">{note} <a href={'#/inbox/' + intakeId}>See the invoice photo</a></div>}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="wide" style={{ maxWidth: 520 }}><AccountPicker label="Supplier *" value={sup?.id ?? ''} types={['supplier', 'partner']} onChange={(a) => pickSupplier(a)} autoFocus={!queryParam('memo_in')} /></div>
          <label className="f">Their invoice #<input className="input" value={vendorDoc} onChange={(e) => setVendorDoc(e.target.value)} /></label>
          <label className="f">Date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="f">Terms (days)<input className="input" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
        </div>
      </div>

      {sup && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>From memo-in ({mi.length} open)</h2></div>
          {mi.length === 0 ? <div className="empty">{sup.company} has no open memo-in stones.</div> : (
            <div className="table-wrap"><table className="t">
              <thead><tr><th /><th>Memo-in</th><th>Stone</th><th className="r">Ct</th><th className="r">Price $</th></tr></thead>
              <tbody>{mi.map((l) => {
                const v = pick[l.id]
                return (
                  <tr key={l.id} style={{ cursor: 'default' }}>
                    <td><input type="checkbox" checked={!!v} onChange={() => setPick({ ...pick, [l.id]: v ? undefined : { amount: l.amount != null ? String(l.amount) : '', part: noPart() } })} /></td>
                    <td className="nw">#{l.docs.doc_no}{l.docs.vendor_doc ? ` (their ${l.docs.vendor_doc})` : ''}<div className="small faint">{day(l.docs.doc_date)}</div></td>
                    <td>{l.descr}{v && <PartBox partners={partners} supId={sup?.id} p={v.part} onChange={(p) => setPick({ ...pick, [l.id]: { ...v, part: p } })} />}</td>
                    <td className="r num">{(Number(l.carat) - Number(l.done_ct)).toFixed(2)}</td>
                    <td className="r">{v ? <input className="input sm num" style={{ width: 110, textAlign: 'right' }} value={v.amount} onChange={(e) => setPick({ ...pick, [l.id]: { ...v, amount: e.target.value } })} /> : l.amount != null ? money(l.amount) : '—'}</td>
                  </tr>)
              })}</tbody>
            </table></div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>New stones</h2><button className="btn sm" onClick={() => setNews([...news, blank()])}><Icon name="plus" /> Add stone</button></div>
        {news.length === 0 ? <div className="empty small">Only for stones that didn’t come in on memo.</div> : (
          <div className="sub-rows card-pad">{news.map((n, i) => {
            const set = (k: keyof NewL, v: string | Part) => setNews(news.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
            return (
              <div key={i} className="sub-row">
                <label className="f">Type<select className="input sm" value={n.kind} onChange={(e) => set('kind', e.target.value)}><option value="white_diamond">Stone</option><option value="parcel">Parcel</option></select></label>
                <label className="f">Shape<select className="input sm" value={n.shape} onChange={(e) => set('shape', e.target.value)}><option value="">?</option>{[...SHAPES, 'Mixed'].map((s) => <option key={s}>{s}</option>)}</select></label>
                {n.kind === 'parcel' && <label className="f">Pcs<input className="input sm" value={n.pcs} onChange={(e) => set('pcs', e.target.value)} /></label>}
                <label className="f">Ct<input className="input sm" value={n.carat} onChange={(e) => set('carat', e.target.value)} /></label>
                <label className="f">Color<input className="input sm" value={n.color} onChange={(e) => set('color', e.target.value.toUpperCase())} /></label>
                <label className="f">Clarity<select className="input sm" value={n.clarity} onChange={(e) => set('clarity', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="f">Report #<input className="input sm" value={n.cert_no} onChange={(e) => set('cert_no', e.target.value)} /></label>
                <label className="f">Cost $<input className="input sm" value={n.amount} onChange={(e) => set('amount', e.target.value)} /></label>
                <button className="btn ghost danger sm" onClick={() => setNews(news.filter((_, j) => j !== i))}><Icon name="x" /></button>
                <div style={{ flexBasis: '100%' }}><PartBox partners={partners} supId={sup?.id} p={n.part} onChange={(p) => set('part', p)} /></div>
              </div>)
          })}</div>
        )}
      </div>
      <div className="sticky-bar">
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>Owed to supplier: <b>{money(owed)}</b></span>
        <button className="btn" onClick={() => go('purchases')}>Cancel</button>
        <button className="btn primary" disabled={busy || !sup} onClick={save}>{busy ? 'Saving…' : 'Save purchase'}</button>
      </div>
    </>
  )
}

function PartBox({ p, onChange, partners, supId }: { p: Part; onChange: (p: Part) => void; partners: { id: string; company: string }[]; supId?: string }) {
  return (
    <div className="row small" style={{ gap: 8, marginTop: 6 }}>
      <label className="check"><input type="checkbox" checked={p.on} onChange={(e) => onChange({ ...p, on: e.target.checked })} /> Partnership</label>
      {p.on && <>
        <select className="input sm" style={{ width: 180 }} value={p.partner} onChange={(e) => onChange({ ...p, partner: e.target.value })}>
          <option value="">Partner…</option>{partners.filter((x) => x.id !== supId).map((x) => <option key={x.id} value={x.id}>{x.company}</option>)}</select>
        <label className="check">Partner %<input className="input sm num" style={{ width: 56 }} value={p.share} onChange={(e) => onChange({ ...p, share: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={p.paidByPartner} onChange={(e) => onChange({ ...p, paidByPartner: e.target.checked })} /> Partner paid the supplier</label>
      </>}
    </div>
  )
}

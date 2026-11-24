import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money, personName, readableChanges, when } from '../lib/format'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import { ageClass, daysOwned, describe, fmtPct, rapPct, signedUrl, statusLabel, uploadFiles, type Item } from '../lib/stock'
import { DOC_TITLE, itemLabel, type Doc, type DocLine } from '../lib/docs'
import PartnerPanel from '../components/PartnerPanel'
import AddCert from '../components/AddCert'
import MountedStones from '../components/MountedStones'
import type { LogRow } from '../lib/types'

const ACTION: Record<string, string> = {
  CREATE: 'added', EDIT: 'edited', HOLD: 'held', RELEASE: 'released hold', ARCHIVE: 'archived', RESTORE: 'restored', FILES: 'files',
  MEMO: 'memo out', RETURN: 'returned', MIX: 'mixed', MOUNT: 'mounted', UNMOUNT: 'unmounted', SOLD: 'sold', BOUGHT: 'bought', COST: 'added cost', PARTNER: 'partnership',
}

export default function StockView({ id }: { id: string }) {
  const { team, toast } = useApp()
  const [i, setI] = useState<Item | null>(null)
  const [sup, setSup] = useState<{ id: string; company: string } | null>(null)
  const [log, setLog] = useState<LogRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hold, setHold] = useState<{ who: string; until: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [where, setWhere] = useState<(DocLine & { docs: Doc })[]>([])
  const [accName, setAccName] = useState<Record<string, string>>({})
  const [linked, setLinked] = useState<Record<string, Item>>({})

  const load = useCallback(async () => {
    const [it, l] = await Promise.all([
      supabase.from('items').select('*').eq('id', id).maybeSingle(),
      supabase.from('audit_log').select('*').eq('entity', 'item').eq('entity_id', id).order('at', { ascending: false }),
    ])
    if (it.error) return setErr(errText(it.error))
    if (!it.data) return setErr('Stone not found.')
    const item = it.data as Item
    setI(item); setLog(l.data ?? [])
    const { data: dl } = await supabase.from('doc_lines').select('*, docs!inner(*)').eq('item_id', id).in('docs.kind', ['memo', 'memo_in']).neq('docs.status', 'void')
    const ws = ((dl ?? []) as (DocLine & { docs: Doc })[]).sort((a, b) => b.docs.doc_date.localeCompare(a.docs.doc_date))
    setWhere(ws)
    const accIds = [...new Set(ws.map((w) => w.docs.account_id).filter(Boolean))] as string[]
    if (accIds.length) supabase.from('accounts').select('id,company').in('id', accIds).then(({ data }) => setAccName(Object.fromEntries((data ?? []).map((a) => [a.id, a.company]))))
    const linkIds = [item.center_id, item.mounted_in].filter(Boolean) as string[]
    if (linkIds.length) supabase.from('items').select('*').in('id', linkIds).then(({ data }) => setLinked(Object.fromEntries((data ?? []).map((x) => [x.id, x as Item]))))
    else setLinked({})
    if (item.supplier_id) {
      const { data } = await supabase.from('accounts').select('id,company').eq('id', item.supplier_id).maybeSingle()
      setSup(data)
    } else setSup(null)
  }, [id])
  useEffect(() => { load() }, [load])

  async function rpc(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(done); load()
  }
  async function openFile(path: string) {
    const w = window.open('', '_blank')
    const url = await signedUrl(path)
    if (url && w) w.location.href = url
    else { w?.close(); setErr('Could not open the file.') }
  }
  async function addFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true); setErr(null)
    try {
      const files = (await uploadFiles(Array.from(list), 'items')).map((f) => ({ ...f, kind: f.mime === 'application/pdf' ? 'cert' : 'photo' }))
      const { error } = await supabase.rpc('add_item_files', { p_id: id, p_files: files })
      if (error) throw error
      toast('File added'); load()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }

  if (err && !i) return <><a className="btn ghost sm" href="#/stock"><Icon name="back" /> White diamonds</a><div className="alert" style={{ marginTop: 14 }}>{err}</div></>
  if (!i) return <div className="loading">Loading…</div>

  const inStock = (i.status === 'available' || i.status === 'on_memo') && !i.mounted_in
  const costRap = rapPct(i.cost_ct, i.rap_ct), askRap = rapPct(i.ask_ct, i.rap_ct)

  return (
    <>
      <a className="btn ghost sm" href={i.kind === 'parcel' ? '#/parcels' : i.kind === 'jewelry' ? '#/jewelry' : '#/stock'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> {i.kind === 'parcel' ? 'Parcels' : i.kind === 'jewelry' ? 'Jewelry' : 'White diamonds'}</a>
      <div className="page-head">
        <div>
          <h1>#{i.stock_no} · {i.kind === 'white_diamond' ? describe(i) : itemLabel(i)}</h1>
          <div className="sub row" style={{ gap: 8, marginTop: 8 }}>
            {i.cert_no && <span className="num">{i.lab} {i.cert_no}</span>}
            <span className={'badge' + (i.status === 'available' && !i.held_for ? '' : ' grey')}>{statusLabel(i)}</span>
            <span className="badge grey">{i.ownership === 'memo_in' ? 'Memo-in' : 'Owned'}</span>
            {daysOwned(i) != null && <span className={'age-chip ' + ageClass(daysOwned(i))} title={`Owned since ${day(i.owned_since)}`}>Owned {daysOwned(i)} days</span>}
            {i.partner_id && <span className="badge partner">Partnership {100 - Number(i.partner_share)}/{i.partner_share}</span>}
            {i.mounted_in && linked[i.mounted_in] && <span className="small">Mounted in <a href={'#/stock/' + i.mounted_in}>#{linked[i.mounted_in].stock_no}</a></span>}
            {i.held_for && <span className="muted small">Held for <b>{i.held_for}</b>{i.held_until ? ` until ${day(i.held_until)}` : ''}</span>}
          </div>
        </div>
        <div className="row">
          {inStock && (i.held_for
            ? <button className="btn" disabled={busy} onClick={() => rpc('set_item_hold', { p_id: id, p_held_for: '', p_until: null }, 'Hold released')}>Release hold</button>
            : <button className="btn" disabled={busy} onClick={() => setHold({ who: '', until: '' })}>Hold</button>)}
          {i.status === 'available' && <button className="btn" disabled={busy} onClick={() => confirm('Archive this stone? It leaves the stock list but keeps its history.') && rpc('set_item_archived', { p_id: id, p_archived: true }, 'Archived')}>Archive</button>}
          {i.status === 'archived' && !i.mounted_in && <button className="btn" disabled={busy} onClick={() => rpc('set_item_archived', { p_id: id, p_archived: false }, 'Back in stock')}>Restore</button>}
          {i.status === 'available' && !i.mounted_in && <a className="btn" href={`#/memos/new?item=${id}`}>Memo out</a>}
          {i.status === 'available' && !i.mounted_in && <a className="btn" href={`#/invoices/new?item=${id}`}>Invoice</a>}
          <button className="btn primary" onClick={() => go(`stock/${id}/edit`)}><Icon name="edit" /> Edit</button>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      {hold && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="f" style={{ flex: '1 1 220px' }}>Hold for (customer or note)<input className="input" autoFocus value={hold.who} onChange={(e) => setHold({ ...hold, who: e.target.value })} /></label>
            <label className="f">Until (optional)<input className="input" type="date" value={hold.until} onChange={(e) => setHold({ ...hold, until: e.target.value })} /></label>
            <button className="btn primary" disabled={busy || !hold.who.trim()} onClick={async () => { await rpc('set_item_hold', { p_id: id, p_held_for: hold.who, p_until: hold.until || null }, 'Held'); setHold(null) }}>Hold</button>
            <button className="btn ghost" onClick={() => setHold(null)}>Cancel</button>
          </div>
        </div>
      )}

      {i.kind === 'jewelry' && <div className="card card-pad" style={{ marginBottom: 16 }}>
        <MountedStones piece={id} centerId={i.center_id} canEdit={i.status === 'available'} onChange={load} />
      </div>}
      <div className="grid sections">
        {i.kind === 'parcel' && (
          <Card title="Parcel">
            <KV k="Shape" v={i.shape} /><KV k="Size" v={i.size_cat} />
            <KV k="Color" v={[i.color, i.color_to].filter(Boolean).join(' – ')} /><KV k="Clarity" v={[i.clarity, i.clarity_to].filter(Boolean).join(' – ')} />
            <KV k="Total" v={`${i.pcs} pcs · ${Number(i.carat).toFixed(2)} ct`} />
            <KV k="On hand" v={<b>{i.pcs - i.memo_pcs} pcs · {(Number(i.carat) - Number(i.memo_ct)).toFixed(2)} ct</b>} />
            <KV k="On memo" v={i.memo_ct > 0 ? `${i.memo_pcs} pcs · ${Number(i.memo_ct).toFixed(2)} ct` : ''} />
          </Card>
        )}
        {i.kind === 'jewelry' && (
          <Card title="Piece">
            <KV k="Type" v={i.jewelry_type} /><KV k="Description" v={i.title} /><KV k="Metal" v={[i.metal, i.metal_wt != null ? i.metal_wt + ' g' : ''].filter(Boolean).join(' · ')} />
            <KV k="Style #" v={i.style_no} /><KV k="Ring size" v={i.ring_size} />
            <KV k="Side stones" v={[i.side_pcs != null ? i.side_pcs + ' pcs' : '', i.side_ct != null ? Number(i.side_ct).toFixed(2) + ' ct' : ''].filter(Boolean).join(' · ')} />
          </Card>
        )}
        {i.kind === 'white_diamond' && <Card title="Grading">
          <KV k="Shape" v={i.shape} /><KV k="Carat" v={Number(i.carat).toFixed(2)} />
          <KV k="Color" v={i.color} /><KV k="Clarity" v={i.clarity} />
          <KV k="Cut / Polish / Sym" v={[i.cut, i.polish, i.symmetry].filter(Boolean).join(' / ')} />
          <KV k="Fluorescence" v={i.fluorescence} />
          <KV k="Measurements" v={i.measurements} />
          <KV k="Depth / Table" v={[i.depth_pct != null ? i.depth_pct + '%' : '', i.table_pct != null ? i.table_pct + '%' : ''].filter(Boolean).join(' / ')} />
          <KV k="Girdle" v={i.girdle} /><KV k="Culet" v={i.culet} />
          <KV k="Lab report" v={i.cert_no ? `${i.lab} ${i.cert_no}${i.cert_date ? ' · ' + day(i.cert_date) : ''}` : ''} />
          <KV k="Inscription" v={i.inscription} />
          <KV k="Key to symbols" v={i.key_to_symbols} />
          <KV k="Lab comments" v={i.lab_comments} />
        </Card>}
        {i.kind === 'jewelry' ? (
          <Card title="Price">
            <KV k="Metal" v={i.metal_cost != null ? money(i.metal_cost) : ''} /><KV k="Labour" v={i.labor_cost != null ? money(i.labor_cost) : ''} />
            <KV k="Stones" v={i.stones_cost != null ? money(i.stones_cost) : ''} />
            <KV k="Total cost" v={i.cost_total != null ? <b>{money(i.cost_total)}</b> : ''} />
            <KV k="Asking" v={i.ask_total != null ? <b>{money(i.ask_total)}</b> : ''} />
          </Card>
        ) : <Card title="Price">
          <KV k="Rap list / ct" v={i.rap_ct != null ? money(i.rap_ct) : ''} />
          <KV k="Cost / ct" v={i.cost_ct != null ? <>{money(i.cost_ct)} <span className="muted small">{costRap != null ? fmtPct(costRap) : ''}</span></> : ''} />
          <KV k="Cost total" v={i.cost_total != null ? <b>{money(i.cost_total)}</b> : ''} />
          <KV k="Asking / ct" v={i.ask_ct != null ? <>{money(i.ask_ct)} <span className="muted small">{askRap != null ? fmtPct(askRap) : ''}</span></> : ''} />
          <KV k="Asking total" v={i.ask_total != null ? <b>{money(i.ask_total)}</b> : ''} />
        </Card>}
        <Card title="Source & location">
          <KV k="Ownership" v={i.ownership === 'memo_in' ? 'Memo-in (supplier’s stone)' : 'Owned by TD'} />
          <KV k="Supplier" v={sup ? <a href={'#/accounts/' + sup.id}>{sup.company}</a> : ''} />
          <KV k="Vendor stock #" v={i.vendor_stock} />
          <KV k="Vendor memo / inv #" v={i.vendor_doc} />
          <KV k="Received" v={i.received ? day(i.received) : ''} />
          <KV k="Owned since" v={i.owned_since ? <span className={ageClass(daysOwned(i))}>{day(i.owned_since)}{daysOwned(i) != null ? ` · ${daysOwned(i)} days` : ''}</span> : ''} />
          <KV k="Location" v={i.location} />
          <KV k="Origin" v={i.origin} />
          {i.remarks && <KV k="Remarks" v={<span style={{ whiteSpace: 'pre-wrap' }}>{i.remarks}</span>} />}
        </Card>
        <PartnerPanel item={i} onChange={load} />
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 12 }}><h3>Files</h3><span className="spacer" />
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            {i.kind === 'white_diamond' && <AddCert item={i} onDone={load} />}
            <button className="btn sm" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="plus" /> Add</button>
          </div>
          {i.files.length === 0 ? <div className="muted small">No files. Add the GIA PDF or photos.</div> : i.files.map((f) => (
            <div key={f.path} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="badge grey">{({ cert: 'Certificate', memo: 'Memo', invoice: 'Invoice', photo: 'Photo' } as Record<string, string>)[f.kind] ?? 'File'}</span>
              <a href="#" onClick={(e) => { e.preventDefault(); openFile(f.path) }} style={{ flex: 1, wordBreak: 'break-all' }}>{f.name}</a>
              <button className="btn sm ghost danger" title="Remove from this stone" onClick={() => confirm(`Remove ${f.name} from this stone?`) && rpc('remove_item_file', { p_id: id, p_path: f.path }, 'Removed')}><Icon name="x" /></button>
            </div>
          ))}
          {i.cert_no && i.lab === 'GIA' && (
            <a className="btn sm ghost" style={{ marginTop: 10, marginLeft: -8 }} href={`https://www.gia.edu/report-check?reportno=${i.cert_no}`} target="_blank" rel="noreferrer">Check on GIA website ↗</a>
          )}
        </div>
      </div>

      {where.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Memos</h2></div>
          <ul className="feed">
            {where.map((w) => {
              const open = w.docs.status === 'open' && Number(w.done_ct) < Number(w.carat)
              return (
                <li key={w.id} onClick={() => go((w.docs.kind === 'memo' ? 'memos/' : 'memo-in/') + w.doc_id)} style={{ cursor: 'pointer' }}>
                  <span className="dot"><Icon name={w.docs.kind === 'memo' ? 'memo' : 'box'} /></span>
                  <div><div className="what">{DOC_TITLE[w.docs.kind]} #{w.docs.doc_no} · {accName[w.docs.account_id ?? ''] ?? ''}</div>
                    <div className="detail">{w.pcs > 1 ? `${w.pcs} pcs · ` : ''}{Number(w.carat).toFixed(2)} ct{w.amount != null ? ' · ' + money(w.amount) : ''} · {open ? <b style={{ color: 'var(--accent)' }}>{w.docs.kind === 'memo' ? 'out now' : 'open'}</b> : 'closed'}</div></div>
                  <span className="time">{day(w.docs.doc_date)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>History</h2></div>
        <ul className="feed">
          {log.map((l) => (
            <li key={l.id}>
              <span className="dot">{personName(l.actor, team).slice(0, 2).toUpperCase()}</span>
              <div><div className="what">{personName(l.actor, team)} · {ACTION[l.action] ?? l.action.toLowerCase()}</div><div className="detail">{readableChanges(l.summary)}</div></div>
              <span className="time">{when(l.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card card-pad"><h3 style={{ marginBottom: 12 }}>{title}</h3><dl className="kv">{children}</dl></div>
}
function KV({ k, v }: { k: string; v: ReactNode }) {
  return <><dt>{k}</dt><dd>{v || <span className="faint">—</span>}</dd></>
}

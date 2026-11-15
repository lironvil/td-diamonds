import { useEffect, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import PriceTrio from '../components/PriceTrio'
import ItemForm from './ItemForm'
import { CLARITIES, FLUOR, GRADES, SHAPES, type Item } from '../lib/stock'

type Acc = { id: string; company: string; types: string[] }
type F = Record<string, string | number | null>

const TEXT_FIELDS = ['shape', 'color', 'clarity', 'cut', 'polish', 'symmetry', 'fluorescence', 'lab', 'cert_no', 'measurements', 'girdle', 'culet',
  'inscription', 'key_to_symbols', 'lab_comments', 'origin', 'location', 'vendor_stock', 'vendor_doc', 'remarks', 'ownership']
const blank: F = { shape: '', carat: '', color: '', clarity: '', cut: '', polish: '', symmetry: '', fluorescence: '', lab: 'GIA', cert_no: '', cert_date: '',
  measurements: '', depth_pct: '', table_pct: '', girdle: '', culet: '', inscription: '', key_to_symbols: '', lab_comments: '', origin: '',
  location: 'NYC', supplier_id: '', vendor_stock: '', vendor_doc: '', received: '', ownership: 'owned', remarks: '', stock_no: '',
  rap_ct: '', cost_total: null, ask_total: null }

export default function StockForm({ id }: { id?: string }) {
  const { toast } = useApp()
  const [f, setF] = useState<F | null>(id ? null : blank)
  const [accs, setAccs] = useState<Acc[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [otherKind, setOtherKind] = useState<'parcel' | 'jewelry' | null>(null)

  useEffect(() => {
    supabase.from('accounts').select('id,company,types').eq('active', true).order('company').then(({ data }) => setAccs(data ?? []))
    if (!id) return
    supabase.from('items').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error || !data) return setErr(error ? errText(error) : 'Stone not found.')
      const i = data as Item
      if (i.kind === 'parcel' || i.kind === 'jewelry') { setOtherKind(i.kind); return }
      const v: F = { ...blank }
      for (const k of Object.keys(blank)) v[k] = (i as unknown as F)[k] ?? (k === 'cost_total' || k === 'ask_total' ? null : '')
      setF(v)
      if (i.measurements || i.girdle || i.depth_pct) setMore(true)
    })
  }, [id])

  if (otherKind && id) return <ItemForm kind={otherKind} id={id} />
  if (!f) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  const set = (k: string, v: string | number | null) => setF({ ...f, [k]: v })
  const carat = Number(f.carat) > 0 ? Number(f.carat) : null
  const rap = Number(f.rap_ct) > 0 ? Number(f.rap_ct) : null
  const suppliers = accs.filter((a) => a.types.includes('supplier') || a.id === f.supplier_id)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f) return
    setErr(null)
    if (!f.shape) return setErr('Choose the shape.')
    if (!carat) return setErr('Enter the carat weight.')
    if (f.ownership === 'memo_in' && !f.supplier_id) return setErr('A memo-in stone needs its supplier.')
    const p: Record<string, unknown> = { id: id ?? null }
    for (const k of TEXT_FIELDS) p[k] = f[k] ?? ''
    for (const k of ['carat', 'depth_pct', 'table_pct', 'rap_ct', 'stock_no']) p[k] = f[k] === '' || f[k] == null ? null : Number(String(f[k]).replace(/[$,]/g, ''))
    for (const k of ['cert_date', 'received', 'supplier_id']) p[k] = f[k] || null
    p.cost_total = f.cost_total; p.ask_total = f.ask_total
    if (!id && p.stock_no == null) delete p.stock_no
    setBusy(true)
    const { data, error } = await supabase.rpc('save_item', { p })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(id ? 'Saved' : `Stock #${data.stock_no} added`)
    go('stock/' + data.id)
  }

  const inp = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => (
    <label className={'f ' + cls}>{label}<input className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></label>
  )
  const sel = (k: string, label: string, opts: string[], blankLabel = '—') => (
    <label className="f">{label}
      <select className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">{blankLabel}</option>{opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  )

  return (
    <form onSubmit={save}>
      <a className="btn ghost sm" href={id ? `#/stock/${id}` : '#/stock'} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> {id ? 'Back' : 'White diamonds'}</a>
      <div className="page-head">
        <div><h1>{id ? `Edit #${f.stock_no}` : 'Add a stone'}</h1>
          <div className="sub">{id ? 'Changes are recorded in the stone’s history.' : 'Shape and carat are required. Faster: snap the GIA certificate from White diamonds.'}</div></div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid" style={{ gap: 16 }}>
        <Block title="Stone">
          <div className="form-grid">
            {sel('shape', 'Shape *', SHAPES, 'Choose…')}
            {inp('carat', 'Carat *', { inputMode: 'decimal', required: true })}
            <label className="f">Color<input className="input" list="colors" value={(f.color as string) ?? ''} onChange={(e) => set('color', e.target.value.toUpperCase())} /></label>
            {sel('clarity', 'Clarity', CLARITIES)}
            {sel('cut', 'Cut', GRADES)}
            {sel('polish', 'Polish', GRADES)}
            {sel('symmetry', 'Symmetry', GRADES)}
            {sel('fluorescence', 'Fluorescence', FLUOR)}
            {inp('lab', 'Lab')}
            {inp('cert_no', 'Report #', { inputMode: 'numeric' })}
            {inp('cert_date', 'Report date', { type: 'date' })}
            {!id && inp('stock_no', 'Stock # (blank = next)', { inputMode: 'numeric' })}
          </div>
          <datalist id="colors">{'DEFGHIJKLM'.split('').map((c) => <option key={c} value={c} />)}</datalist>
          <button type="button" className="btn sm ghost" style={{ marginTop: 10, marginLeft: -8 }} onClick={() => setMore(!more)}>{more ? '− Fewer details' : '+ Measurements, girdle, inscription…'}</button>
          {more && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              {inp('measurements', 'Measurements')}
              {inp('depth_pct', 'Depth %', { inputMode: 'decimal' })}
              {inp('table_pct', 'Table %', { inputMode: 'decimal' })}
              {inp('girdle', 'Girdle')}
              {inp('culet', 'Culet')}
              {inp('inscription', 'Inscription')}
              {inp('origin', 'Origin')}
              {inp('key_to_symbols', 'Key to symbols', {}, 'wide')}
              {inp('lab_comments', 'Lab comments', {}, 'wide')}
            </div>
          )}
        </Block>

        <Block title="Price">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {inp('rap_ct', 'Rap list price / ct', { inputMode: 'decimal', placeholder: 'optional' })}
            <PriceTrio label="Cost" carat={carat} rap={rap} total={f.cost_total as number | null} onTotal={(t) => set('cost_total', t)} />
            <PriceTrio label="Asking price" carat={carat} rap={rap} total={f.ask_total as number | null} onTotal={(t) => set('ask_total', t)} />
          </div>
        </Block>

        <Block title="Source">
          <div className="chips" style={{ marginBottom: 12 }}>
            <button type="button" className={'chip' + (f.ownership === 'owned' ? ' on' : '')} onClick={() => set('ownership', 'owned')}>Owned by TD</button>
            <button type="button" className={'chip' + (f.ownership === 'memo_in' ? ' on' : '')} onClick={() => set('ownership', 'memo_in')}>Memo-in (supplier’s)</button>
          </div>
          <div className="form-grid">
            <label className="f">Supplier{f.ownership === 'memo_in' ? ' *' : ''}
              <select className="input" value={(f.supplier_id as string) ?? ''} onChange={(e) => set('supplier_id', e.target.value)}>
                <option value="">—</option>{suppliers.map((a) => <option key={a.id} value={a.id}>{a.company}</option>)}
              </select>
            </label>
            {inp('vendor_stock', 'Vendor stock #')}
            {inp('vendor_doc', 'Vendor memo / invoice #')}
            {inp('received', 'Received', { type: 'date' })}
            {inp('location', 'Location')}
            <label className="f wide">Remarks (internal)<textarea className="input" value={(f.remarks as string) ?? ''} onChange={(e) => set('remarks', e.target.value)} /></label>
          </div>
          {!suppliers.length && <div className="faint small" style={{ marginTop: 8 }}>No suppliers yet. <a href="#/accounts/new">Add one</a> (type: Supplier).</div>}
        </Block>
      </div>

      <div className="sticky-bar">
        {err && <span className="alert" style={{ margin: 0, marginRight: 'auto', padding: '8px 12px' }}>{err}</span>}
        <button type="button" className="btn" onClick={() => go(id ? `stock/${id}` : 'stock')}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Add stone'}</button>
      </div>
    </form>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card card-pad"><h3 style={{ marginBottom: 14 }}>{title}</h3>{children}</div>
}

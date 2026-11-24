import { useEffect, useState, type ReactNode } from 'react'
import { supabase, errText } from '../lib/supabase'
import { go } from '../lib/router'
import { Icon, useApp } from '../components/ui'
import PriceTrio from '../components/PriceTrio'
import { StonePicker } from '../components/MountedStones'
import { CLARITIES, SHAPES, type Item } from '../lib/stock'

type F = Record<string, string | number | null>
const JTYPES = ['Ring', 'Engagement ring', 'Band', 'Earrings', 'Pendant', 'Necklace', 'Bracelet', 'Brooch', 'Other']
const METALS = ['Platinum', '18K White', '18K Yellow', '18K Rose', '14K White', '14K Yellow', '14K Rose', 'Two-tone', 'Silver', 'Other']
const SIZES = ['Melee', '1/10', '1/8', '1/6', '1/5', '1/4', '1/3', '3/8', '1/2', '0.60', '0.70', '0.90', '1.00+']
const TEXT = ['shape', 'color', 'color_to', 'clarity', 'clarity_to', 'size_cat', 'title', 'jewelry_type', 'style_no', 'metal', 'ring_size', 'location', 'vendor_stock', 'vendor_doc', 'remarks', 'ownership', 'origin']
const NUM = ['pcs', 'carat', 'metal_wt', 'side_pcs', 'side_ct', 'metal_cost', 'labor_cost', 'stock_no']
const blank: F = { shape: '', color: '', color_to: '', clarity: '', clarity_to: '', size_cat: '', title: '', jewelry_type: '', style_no: '', metal: '', ring_size: '',
  location: 'NYC', vendor_stock: '', vendor_doc: '', remarks: '', ownership: 'owned', origin: '', pcs: '', carat: '', metal_wt: '', side_pcs: '', side_ct: '',
  metal_cost: '', labor_cost: '', stock_no: '', supplier_id: '', received: '', cost_total: null, ask_total: null }

/** Parcels and jewelry: one form, fields by type. */
export default function ItemForm({ kind, id }: { kind: 'parcel' | 'jewelry'; id?: string }) {
  const { toast } = useApp()
  const [f, setF] = useState<F | null>(id ? null : { ...blank })
  const [orig, setOrig] = useState<Item | null>(null)
  const [accs, setAccs] = useState<{ id: string; company: string; types: string[] }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stones, setStones] = useState<Parameters<typeof StonePicker>[0]['picked']>([])
  const [center, setCenter] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('accounts').select('id,company,types').eq('active', true).order('company').then(({ data }) => setAccs(data ?? []))
    if (!id) return
    supabase.from('items').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (!data) return setErr('Item not found.')
      const v: F = { ...blank }
      for (const k of Object.keys(blank)) v[k] = (data as unknown as F)[k] ?? (k === 'cost_total' || k === 'ask_total' ? null : '')
      setF(v); setOrig(data as Item)
    })
  }, [id])
  if (!f) return err ? <div className="alert">{err}</div> : <div className="loading">Loading…</div>
  const set = (k: string, v: string | number | null) => setF({ ...f, [k]: v })
  const carat = Number(f.carat) > 0 ? Number(f.carat) : null
  const isP = kind === 'parcel'
  const back = id ? `stock/${id}` : isP ? 'parcels' : 'jewelry'

  async function save() {
    if (!f) return
    setErr(null)
    const p: Record<string, unknown> = { id: id ?? null, kind }
    for (const k of TEXT) p[k] = f[k] ?? ''
    for (const k of NUM) p[k] = f[k] === '' || f[k] == null ? null : Number(String(f[k]).replace(/[$,]/g, ''))
    p.supplier_id = f.supplier_id || null; p.received = f.received || null
    p.ask_total = f.ask_total
    if (isP) p.cost_total = f.cost_total
    else if (f.metal_cost === '' && f.labor_cost === '' && f.cost_total != null) p.cost_total = f.cost_total
    if (!isP && id && orig?.stones_cost != null) p.stones_cost = orig.stones_cost
    if (!id && p.stock_no == null) delete p.stock_no
    if (isP && (!p.pcs || !p.carat)) return setErr('Enter pieces and carats.')
    if (!isP && !p.jewelry_type) return setErr('Choose the type.')
    setBusy(true)
    const { data, error } = await supabase.rpc('save_item', { p })
    setBusy(false)
    if (error) return setErr(errText(error))
    if (!id && !isP && stones.length) {
      const { error: me } = await supabase.rpc('mount_stones', { p_jewelry: data.id, p_stones: stones.map((x) => x.id), p_center: center })
      if (me) { toast(`Stock #${data.stock_no} added — stones not mounted: ${errText(me)}`); return go('stock/' + data.id) }
      toast(`Stock #${data.stock_no} added with ${stones.length} stone${stones.length === 1 ? '' : 's'}`); return go('stock/' + data.id)
    }
    toast(id ? 'Saved' : `Stock #${data.stock_no} added`); go('stock/' + data.id)
  }

  const inp = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, cls = '') => (
    <label className={'f ' + cls}>{label}<input className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></label>
  )
  const sel = (k: string, label: string, opts: string[]) => (
    <label className="f">{label}<select className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  )
  const jCost = (Number(f.metal_cost) || 0) + (Number(f.labor_cost) || 0) + Number(orig?.stones_cost ?? 0) + stones.reduce((a, x) => a + Number(x.cost_total ?? 0), 0)

  return (
    <>
      <a className="btn ghost sm" href={'#/' + back} style={{ marginLeft: -10, marginBottom: 8 }}><Icon name="back" /> Back</a>
      <div className="page-head"><div><h1>{id ? `Edit #${f.stock_no}` : isP ? 'New parcel' : 'New jewelry piece'}</h1></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="grid" style={{ gap: 16 }}>
        {isP ? (
          <Block title="Parcel">
            <div className="form-grid">
              {sel('shape', 'Shape *', [...SHAPES.filter((s) => s !== 'Other'), 'Mixed', 'Other'])}
              <label className="f">Size category<input className="input" list="sizes" value={(f.size_cat as string) ?? ''} onChange={(e) => set('size_cat', e.target.value)} /></label>
              {inp('pcs', 'Pieces *', { inputMode: 'numeric' })}
              {inp('carat', 'Total carats *', { inputMode: 'decimal' })}
              <label className="f">Color from / to<div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <input className="input" value={(f.color as string) ?? ''} onChange={(e) => set('color', e.target.value.toUpperCase())} />
                <input className="input" value={(f.color_to as string) ?? ''} onChange={(e) => set('color_to', e.target.value.toUpperCase())} /></div></label>
              <label className="f">Clarity from / to<div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <select className="input" value={(f.clarity as string) ?? ''} onChange={(e) => set('clarity', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select>
                <select className="input" value={(f.clarity_to as string) ?? ''} onChange={(e) => set('clarity_to', e.target.value)}><option value="">—</option>{CLARITIES.map((c) => <option key={c}>{c}</option>)}</select></div></label>
              {!id && inp('stock_no', 'Stock # (blank = next)', { inputMode: 'numeric' })}
            </div>
            <datalist id="sizes">{SIZES.map((s) => <option key={s} value={s} />)}</datalist>
            {orig && orig.memo_ct > 0 && <div className="small" style={{ color: 'var(--warn)', marginTop: 8 }}>{orig.memo_pcs} pcs / {Number(orig.memo_ct).toFixed(2)} ct are out on memo. The totals can't go below that.</div>}
          </Block>
        ) : (
          <Block title="Piece">
            <div className="form-grid">
              {sel('jewelry_type', 'Type *', JTYPES)}
              {inp('title', 'Description', { placeholder: 'e.g. Halo solitaire' }, 'wide')}
              {sel('metal', 'Metal', METALS)}
              {inp('metal_wt', 'Metal weight (g)', { inputMode: 'decimal' })}
              {inp('style_no', 'Style #')}
              {inp('ring_size', 'Ring size')}
              {inp('side_pcs', 'Side stones (pcs)', { inputMode: 'numeric' })}
              {inp('side_ct', 'Side stones (ct)', { inputMode: 'decimal' })}
              {inp('carat', 'Total diamond weight (ct)', { inputMode: 'decimal', placeholder: 'optional' })}
              {!id && inp('stock_no', 'Stock # (blank = next)', { inputMode: 'numeric' })}
            </div>
            <div className="faint small" style={{ marginTop: 8 }}>Stones from stock go in “Stones from stock” below; their cost is added automatically.</div>
          </Block>
        )}

        <Block title="Price">
          {isP ? (
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              <PriceTrio label="Cost" carat={carat} rap={null} total={f.cost_total as number | null} onTotal={(t) => set('cost_total', t)} />
              <PriceTrio label="Asking price" carat={carat} rap={null} total={f.ask_total as number | null} onTotal={(t) => set('ask_total', t)} />
            </div>
          ) : (
            <div className="form-grid">
              {inp('metal_cost', 'Metal cost $', { inputMode: 'decimal' })}
              {inp('labor_cost', 'Labour cost $', { inputMode: 'decimal' })}
              <div className="f" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Stones cost<div style={{ color: 'var(--text)', paddingTop: 8 }}>${(Number(orig?.stones_cost ?? 0) + stones.reduce((a, x) => a + Number(x.cost_total ?? 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="faint">(from mounted stones)</span></div></div>
              <div className="f" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Total cost<div style={{ color: 'var(--text)', paddingTop: 8, fontWeight: 600 }}>${jCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
              <label className="f">Asking price $<input className="input" inputMode="decimal" value={f.ask_total == null ? '' : String(f.ask_total)} onChange={(e) => set('ask_total', e.target.value.trim() === '' ? null : Number(e.target.value.replace(/[$,]/g, '')) || null)} /></label>
            </div>
          )}
        </Block>

        {!id && !isP && (
          <Block title="Stones from stock">
            <StonePicker picked={stones} setPicked={setStones} center={center} setCenter={setCenter} />
          </Block>
        )}

        <Block title="Source">
          <div className="chips" style={{ marginBottom: 12 }}>
            <button type="button" className={'chip' + (f.ownership === 'owned' ? ' on' : '')} onClick={() => set('ownership', 'owned')}>Owned by TD</button>
            <button type="button" className={'chip' + (f.ownership === 'memo_in' ? ' on' : '')} onClick={() => set('ownership', 'memo_in')}>Memo-in</button>
          </div>
          <div className="form-grid">
            <label className="f">Supplier<select className="input" value={(f.supplier_id as string) ?? ''} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">—</option>{accs.filter((a) => a.types.includes('supplier') || a.id === f.supplier_id).map((a) => <option key={a.id} value={a.id}>{a.company}</option>)}</select></label>
            {inp('vendor_stock', 'Vendor stock #')}
            {inp('vendor_doc', 'Vendor memo / invoice #')}
            {inp('received', 'Received', { type: 'date' })}
            {inp('location', 'Location')}
            <label className="f wide">Remarks<textarea className="input" value={(f.remarks as string) ?? ''} onChange={(e) => set('remarks', e.target.value)} /></label>
          </div>
        </Block>
      </div>
      <div className="sticky-bar">
        <button className="btn" onClick={() => go(back)}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : id ? 'Save changes' : 'Add'}</button>
      </div>
    </>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <div className="card card-pad"><h3 style={{ marginBottom: 14 }}>{title}</h3>{children}</div>
}

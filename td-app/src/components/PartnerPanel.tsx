import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { day, money } from '../lib/format'
import { useApp } from './ui'
import type { Item } from '../lib/stock'

type Entry = { id: string; kind: string; amount: number; note: string; entry_date: string }
type Cost = { id: string; kind: string; amount: number; shared: boolean; note: string; cost_date: string }
const KINDS: [string, string][] = [['gia', 'GIA / lab'], ['recut', 'Recut'], ['shipping', 'Shipping'], ['setting', 'Setting'], ['other', 'Other']]

/** On the stone page: extra costs, partnership (coloured), sell actions. */
export default function PartnerPanel({ item, onChange }: { item: Item; onChange: () => void }) {
  const { toast } = useApp()
  const [partner, setPartner] = useState<{ id: string; company: string } | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [accs, setAccs] = useState<{ id: string; company: string }[]>([])
  const [form, setForm] = useState<'' | 'cost' | 'partner' | 'psold'>('')
  const [c, setC] = useState({ kind: 'gia', amount: '', shared: false, note: '' })
  const [pf, setPf] = useState({ partner: '', share: '50', paidBy: 'td' })
  const [ps, setPs] = useState({ amount: '', note: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('item_costs').select('*').eq('item_id', item.id).order('at').then(({ data }) => setCosts((data ?? []) as Cost[]))
    if (item.partner_id) {
      supabase.from('accounts').select('id,company').eq('id', item.partner_id).maybeSingle().then(({ data }) => setPartner(data))
      supabase.from('partner_entries').select('*').eq('item_id', item.id).order('at').then(({ data }) => setEntries((data ?? []) as Entry[]))
    }
  }, [item])
  useEffect(() => { if (form === 'partner' && !accs.length) supabase.from('accounts').select('id,company').eq('active', true).order('company').then(({ data }) => setAccs(data ?? [])) }, [form])

  async function run(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setErr(errText(error))
    toast(done); setForm(''); onChange()
  }
  const inStock = item.status === 'available' || item.status === 'on_memo'
  const tdShare = item.partner_share != null ? 100 - Number(item.partner_share) : null
  const bal = entries.reduce((a, e) => a + Number(e.amount), 0)

  return (
    <>
      {item.partner_id && (
        <div className="card card-pad partner-card">
          <h3 style={{ marginBottom: 10, color: 'var(--partner)' }}>Partnership</h3>
          <dl className="kv">
            <dt>Partner</dt><dd><a href={'#/accounts/' + item.partner_id}>{partner?.company ?? '…'}</a></dd>
            <dt>Split</dt><dd>TD {tdShare}% · partner {item.partner_share}%</dd>
            <dt>Full cost</dt><dd>{item.cost_total != null ? money(item.cost_total) : '—'} <span className="faint">(TD’s share {item.cost_total != null && tdShare != null ? money(Number(item.cost_total) * tdShare / 100) : '—'})</span></dd>
            <dt>On this stone</dt><dd>{bal === 0 ? 'Even' : bal > 0 ? <>Partner owes TD <b>{money(bal)}</b></> : <>TD owes partner <b>{money(-bal)}</b></>}</dd>
          </dl>
          {entries.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{entries.map((e) => <div key={e.id}>{day(e.entry_date)} · {e.note} · {Number(e.amount) > 0 ? '+' : '−'}{money(Math.abs(Number(e.amount)))}</div>)}</div>}
          {item.status === 'available' && item.memo_ct == 0 && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setForm(form === 'psold' ? '' : 'psold')}>Partner sold it</button>}
        </div>
      )}

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 10 }}><h3>Extra costs</h3><span className="spacer" />
          {inStock && <button className="btn sm" onClick={() => setForm(form === 'cost' ? '' : 'cost')}>+ Add cost</button>}
          {inStock && !item.partner_id && item.ownership === 'owned' && <button className="btn sm" onClick={() => setForm(form === 'partner' ? '' : 'partner')}>Make partnership</button>}
        </div>
        {costs.length === 0 ? <div className="muted small">None. GIA, recut, shipping… are added to the stone’s cost.</div> :
          costs.map((x) => <div key={x.id} className="small" style={{ padding: '4px 0' }}>{day(x.cost_date)} · {KINDS.find((k) => k[0] === x.kind)?.[1]} · <b>{money(x.amount)}</b>{x.shared ? <span style={{ color: 'var(--partner)' }}> · split with partner</span> : ''}{x.note ? ` · ${x.note}` : ''}</div>)}
      </div>

      {err && <div className="alert" style={{ gridColumn: '1/-1' }}>{err}</div>}
      {form === 'cost' && (
        <div className="card card-pad" style={{ gridColumn: '1/-1' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="f">Type<select className="input" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="f">Amount $<input className="input num" autoFocus value={c.amount} onChange={(e) => setC({ ...c, amount: e.target.value })} /></label>
            <label className="f" style={{ flex: '1 1 160px' }}>Note<input className="input" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></label>
            {item.partner_id && <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={c.shared} onChange={(e) => setC({ ...c, shared: e.target.checked })} /> Split with partner</label>}
            <button className="btn primary" disabled={busy} onClick={() => run('add_item_cost', { p_item: item.id, p_kind: c.kind, p_amount: Number(c.amount.replace(/[$,]/g, '')), p_shared: c.shared, p_note: c.note, p_date: null }, 'Cost added')}>Add</button>
          </div>
        </div>
      )}
      {form === 'partner' && (
        <div className="card card-pad" style={{ gridColumn: '1/-1' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="f" style={{ flex: '1 1 220px' }}>Partner<select className="input" value={pf.partner} onChange={(e) => setPf({ ...pf, partner: e.target.value })}><option value="">Choose…</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.company}</option>)}</select></label>
            <label className="f">Partner %<input className="input num" style={{ width: 80 }} value={pf.share} onChange={(e) => setPf({ ...pf, share: e.target.value })} /></label>
            <label className="f">Who paid the supplier<select className="input" value={pf.paidBy} onChange={(e) => setPf({ ...pf, paidBy: e.target.value })}><option value="td">TD paid</option><option value="partner">Partner paid</option></select></label>
            <button className="btn primary" disabled={busy || !pf.partner} onClick={() => run('set_item_partner', { p_item: item.id, p_partner: pf.partner, p_share: Number(pf.share), p_paid_by: pf.paidBy }, 'Partnership saved')}>Save</button>
          </div>
        </div>
      )}
      {form === 'psold' && (
        <div className="card card-pad" style={{ gridColumn: '1/-1' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="f">Partner sold it for $<input className="input num" autoFocus value={ps.amount} onChange={(e) => setPs({ ...ps, amount: e.target.value })} /></label>
            <label className="f" style={{ flex: '1 1 200px' }}>Note (customer, invoice #)<input className="input" value={ps.note} onChange={(e) => setPs({ ...ps, note: e.target.value })} /></label>
            <button className="btn primary" disabled={busy} onClick={() => run('partner_sold', { p_item: item.id, p_amount: Number(ps.amount.replace(/[$,]/g, '')), p_date: null, p_note: ps.note }, 'Recorded: partner owes TD its share')}>Save</button>
          </div>
          <div className="faint small" style={{ marginTop: 6 }}>The stone leaves stock; the partner owes TD {tdShare}% of the sale price.</div>
        </div>
      )}
    </>
  )
}

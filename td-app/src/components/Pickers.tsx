import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { itemLabel } from '../lib/docs'
import type { Item } from '../lib/stock'

type Acc = { id: string; company: string; acct_no: number; types: string[]; memo_terms: number | null; city: string }

/** Type-to-search account picker. */
export function AccountPicker({ value, onChange, types, label, autoFocus }: {
  value: string; onChange: (a: Acc | null) => void; types?: string[]; label: string; autoFocus?: boolean
}) {
  const [all, setAll] = useState<Acc[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    supabase.from('accounts').select('id,company,acct_no,types,memo_terms,city').eq('active', true).order('company').then(({ data }) => setAll((data ?? []) as Acc[]))
  }, [])
  const sel = all.find((a) => a.id === value)
  const list = useMemo(() => {
    const w = q.toLowerCase()
    return all.filter((a) => (!types || a.types.some((t) => types.includes(t))) && (!w || `${a.company} ${a.acct_no} ${a.city}`.toLowerCase().includes(w))).slice(0, 30)
  }, [all, q, types])
  return (
    <label className="f" style={{ position: 'relative' }}>{label}
      <input className="input" autoFocus={autoFocus} placeholder="Type a name or acct #" value={open ? q : sel ? `${sel.company} (#${sel.acct_no})` : q}
        onFocus={() => { setOpen(true); setQ('') }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {open && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 280, overflowY: 'auto', marginTop: 4 }}>
          {list.length === 0 ? <div className="muted small" style={{ padding: 10 }}>No match. <a href="#/accounts/new">New account</a></div> : list.map((a) => (
            <div key={a.id} onMouseDown={() => { onChange(a); setOpen(false) }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--text)' }}>
              <b style={{ fontWeight: 600 }}>{a.company}</b> <span className="faint">#{a.acct_no}{a.city ? ' · ' + a.city : ''}</span>
            </div>
          ))}
        </div>
      )}
    </label>
  )
}

/** Stock search: type or scan a stock # / GIA #, or words; Enter adds an exact match. */
export function ItemPicker({ onPick, filter, placeholder = 'Scan or type stock # / GIA #…', exclude = [] }: {
  onPick: (i: Item) => void; filter: (i: Item) => boolean; placeholder?: string; exclude?: string[]
}) {
  const [all, setAll] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    supabase.from('items').select('*').in('status', ['available', 'on_memo']).order('stock_no', { ascending: false }).limit(5000)
      .then(({ data }) => { setAll((data ?? []) as Item[]); setLoaded(true) })
  }, [])
  useEffect(() => { if (loaded && pending) { setPending(false); enter() } }, [loaded, pending])
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return all.filter((i) => filter(i) && !exclude.includes(i.id) && words.every((w) => `${i.stock_no} ${i.cert_no} ${itemLabel(i)} ${i.vendor_stock}`.toLowerCase().includes(w))).slice(0, 12)
  }, [all, q, filter, exclude])
  function enter() {
    if (!loaded) { setPending(true); return }
    const t = q.trim()
    const exact = all.find((i) => String(i.stock_no) === t || (i.cert_no && i.cert_no === t))
    if (exact && filter(exact) && !exclude.includes(exact.id)) { onPick(exact); setQ(''); setMsg(''); return }
    if (exact) { setMsg(`#${exact.stock_no} can't be added here (${exact.status === 'on_memo' ? 'already on memo' : exclude.includes(exact.id) ? 'already added' : 'not available'}).`); return }
    if (list.length === 1) { onPick(list[0]); setQ(''); setMsg(''); return }
    setMsg(t ? 'No exact match.' : '')
  }
  return (
    <div style={{ position: 'relative' }}>
      <input ref={ref} className="input" placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setMsg('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enter() } }} />
      {msg && <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>{msg}</div>}
      {list.length > 0 && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 320, overflowY: 'auto', marginTop: 4 }}>
          {list.map((i) => (
            <div key={i.id} onMouseDown={(e) => { e.preventDefault(); onPick(i); setQ(''); ref.current?.focus() }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--text)' }}>
              <b style={{ fontWeight: 600 }}>#{i.stock_no}</b> {itemLabel(i)}
              {i.kind === 'parcel' && <span className="faint"> · on hand {i.pcs - i.memo_pcs} pcs / {(Number(i.carat) - Number(i.memo_ct)).toFixed(2)} ct</span>}
              {i.ownership === 'memo_in' && <span className="badge grey" style={{ marginLeft: 6 }}>MI</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

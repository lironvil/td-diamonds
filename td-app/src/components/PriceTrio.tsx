import { useEffect, useState } from 'react'
import { r2 } from '../lib/stock'

/** One price, three ways to enter it: per carat, total, or Rap %. Typing in any box fills the other two.
 *  The total (exact to the cent) is what gets saved. */
export default function PriceTrio({ label, carat, rap, total, onTotal }: {
  label: string; carat: number | null; rap: number | null; total: number | null; onTotal: (t: number | null) => void
}) {
  const [ct, setCt] = useState(''); const [tot, setTot] = useState(''); const [pct, setPct] = useState('')
  const [editing, setEditing] = useState<'ct' | 'tot' | 'pct' | null>(null)

  // Keep the boxes in step when carat / Rap / total change elsewhere.
  useEffect(() => {
    if (editing) return
    if (total == null || !carat) { setCt(''); setTot(total == null ? '' : String(total)); setPct(''); return }
    const perCt = r2(total / carat)
    setTot(total.toFixed(2)); setCt(perCt.toFixed(2))
    setPct(rap ? (Math.round((perCt / rap - 1) * 1000) / 10).toString() : '')
  }, [total, carat, rap, editing])

  const num = (s: string) => { const n = Number(s.replace(/[$,\s%]/g, '').replace('−', '-')); return s.trim() && isFinite(n) ? n : null }
  function change(which: 'ct' | 'tot' | 'pct', v: string) {
    setEditing(which)
    if (which === 'ct') setCt(v); if (which === 'tot') setTot(v); if (which === 'pct') setPct(v)
    const n = num(v)
    let t: number | null = null
    if (n != null && carat) {
      if (which === 'tot') t = r2(n)
      if (which === 'ct') t = r2(n * carat)
      if (which === 'pct' && rap) t = r2(r2(rap * (1 + n / 100)) * carat)
    }
    if (which === 'tot' && n != null && !carat) t = r2(n)
    if (n == null && v.trim() === '') t = null
    if (which !== 'ct') setCt(t != null && carat ? r2(t / carat).toFixed(2) : '')
    if (which !== 'tot') setTot(t != null ? t.toFixed(2) : '')
    if (which !== 'pct') setPct(t != null && carat && rap ? (Math.round((t / carat / rap - 1) * 1000) / 10).toString() : '')
    onTotal(t)
  }

  return (
    <div className="f" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
      {label}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 6, marginTop: 5 }}>
        <input className="input num" placeholder="$ / ct" inputMode="decimal" value={ct} onChange={(e) => change('ct', e.target.value)} onBlur={() => setEditing(null)} aria-label={label + ' per carat'} />
        <input className="input num" placeholder="Total $" inputMode="decimal" value={tot} onChange={(e) => change('tot', e.target.value)} onBlur={() => setEditing(null)} aria-label={label + ' total'} />
        <input className="input num" placeholder={rap ? 'Rap %' : 'no Rap'} disabled={!rap} inputMode="decimal" value={pct} onChange={(e) => change('pct', e.target.value)} onBlur={() => setEditing(null)} aria-label={label + ' Rap percent'} />
      </div>
    </div>
  )
}

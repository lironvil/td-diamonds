import { useCallback, useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { money } from '../lib/format'
import { useApp } from './ui'
import { ItemPicker } from './Pickers'
import type { Item } from '../lib/stock'

type Stone = Pick<Item, 'id' | 'stock_no' | 'kind' | 'shape' | 'carat' | 'color' | 'clarity' | 'lab' | 'cert_no' | 'cost_total' | 'pcs'>
const COLS = 'id,stock_no,kind,shape,carat,color,clarity,lab,cert_no,cost_total,pcs'
export const stoneText = (s: Stone) => [s.kind === 'parcel' ? `${s.pcs} pcs` : '', s.carat != null ? Number(s.carat).toFixed(2) + 'ct' : '', s.shape, s.color, s.clarity, s.cert_no ? `${s.lab} ${s.cert_no}` : ''].filter(Boolean).join(' ')
/** Loose stones that can go into a piece. */
export const mountable = (x: Item) => x.kind === 'white_diamond' && x.status === 'available' && !x.mounted_in

/** Picks several loose stones and which one is the center. Used on the jewelry page and in the new-jewelry form. */
export function StonePicker({ picked, setPicked, center, setCenter }: { picked: Stone[]; setPicked: (s: Stone[]) => void; center: string | null; setCenter: (id: string | null) => void }) {
  return (
    <div>
      {picked.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 8 }}><table className="t">
          <thead><tr><th>Center</th><th>Stock #</th><th>Stone</th><th className="r">Cost</th><th /></tr></thead>
          <tbody>{picked.map((s) => (
            <tr key={s.id} style={{ cursor: 'default' }}>
              <td><input type="radio" name="center" checked={center === s.id} onChange={() => setCenter(s.id)} aria-label={`#${s.stock_no} is the center stone`} /></td>
              <td>#{s.stock_no}</td><td>{stoneText(s)}</td><td className="r num">{money(s.cost_total)}</td>
              <td className="r"><button className="btn ghost sm" onClick={() => { setPicked(picked.filter((x) => x.id !== s.id)); if (center === s.id) setCenter(null) }}>Remove</button></td>
            </tr>))}
          </tbody>
        </table></div>
      )}
      <div style={{ maxWidth: 360 }}>
        <ItemPicker placeholder="Add a stone: stock # or GIA #" filter={(x) => mountable(x) && !picked.some((p) => p.id === x.id)}
          onPick={(x) => { setPicked([...picked, x as unknown as Stone]); if (!center && picked.length === 0) setCenter(x.id) }} />
      </div>
      {picked.length > 0 && <div className="faint small" style={{ marginTop: 6 }}>{center ? 'The marked stone is the center stone.' : 'No center stone marked (optional).'} Each stone’s cost is added to the piece. Small side stones not in stock: enter pcs / ct above.</div>}
    </div>
  )
}

/** Jewelry page: the stones in the piece, add several at once, take one out, change the center. */
export default function MountedStones({ piece, centerId, canEdit, onChange }: { piece: string; centerId: string | null; canEdit: boolean; onChange: () => void }) {
  const { toast } = useApp()
  const [stones, setStones] = useState<Stone[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Stone[]>([])
  const [center, setCenter] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => {
    supabase.from('items').select(COLS).eq('mounted_in', piece).order('stock_no').then(({ data }) => setStones((data ?? []) as Stone[]))
  }, [piece])
  useEffect(() => { load() }, [load, centerId])

  async function rpc(fn: string, args: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setErr(errText(error)); return false }
    toast(done); load(); onChange(); return true
  }
  async function mount() {
    const ok = await rpc('mount_stones', { p_jewelry: piece, p_stones: picked.map((s) => s.id), p_center: center && !centerId ? center : null },
      `${picked.length} stone${picked.length === 1 ? '' : 's'} mounted`)
    if (ok) { setPicked([]); setCenter(null); setAdding(false) }
  }
  const total = (stones ?? []).reduce((a, s) => a + Number(s.cost_total ?? 0), 0)

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>STONES IN THIS PIECE</div>
      {err && <div className="alert">{err}</div>}
      {stones === null ? <div className="faint">Loading…</div> : stones.length === 0 ? <div className="faint small" style={{ marginBottom: 8 }}>No stones from stock mounted yet.</div> : (
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Stock #</th><th>Stone</th><th className="r">Cost</th><th /></tr></thead>
          <tbody>{stones.map((s) => (
            <tr key={s.id} style={{ cursor: 'default' }}>
              <td className="nw"><a href={'#/stock/' + s.id}>#{s.stock_no}</a>{s.id === centerId && <span className="badge" style={{ marginLeft: 6 }}>Center</span>}</td>
              <td>{stoneText(s)}</td><td className="r num">{money(s.cost_total)}</td>
              <td className="r nw">{canEdit && <>
                {s.id !== centerId && <button className="btn ghost sm" disabled={busy} onClick={() => rpc('set_center_stone', { p_jewelry: piece, p_stone: s.id }, `#${s.stock_no} is now the center stone`)}>Make center</button>}
                <button className="btn ghost sm danger" disabled={busy} onClick={() => confirm(`Take #${s.stock_no} out? It goes back to loose stock and its cost leaves the piece.`) && rpc('unmount_item', { p_stone: s.id }, `#${s.stock_no} taken out`)}>Take out</button>
              </>}</td>
            </tr>))}
          </tbody>
          {stones.length > 1 && <tfoot><tr><td colSpan={2} style={{ fontWeight: 600 }}>{stones.length} stones</td><td className="r num" style={{ fontWeight: 600 }}>{money(total)}</td><td /></tr></tfoot>}
        </table></div>
      )}
      {canEdit && (adding ? (
        <div className="card card-pad" style={{ marginTop: 8 }}>
          <StonePicker picked={picked} setPicked={setPicked} center={centerId ? null : center} setCenter={centerId ? () => {} : setCenter} />
          {centerId && picked.length > 0 && <div className="faint small" style={{ marginTop: 6 }}>This piece already has a center stone; these are added as side stones.</div>}
          <div className="row" style={{ gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setAdding(false); setPicked([]); setCenter(null) }}>Cancel</button>
            <button className="btn primary" disabled={busy || !picked.length} onClick={mount}>{busy ? 'Saving…' : `Mount ${picked.length || ''} stone${picked.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      ) : <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>Add stones</button>)}
    </div>
  )
}

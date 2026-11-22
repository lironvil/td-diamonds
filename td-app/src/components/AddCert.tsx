import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { readIntake, uploadFiles, type Extraction, type Item } from '../lib/stock'
import { Icon, useApp } from './ui'

const FIELDS: [string, string][] = [
  ['lab', 'Lab'], ['cert_no', 'Report #'], ['cert_date', 'Report date'], ['shape', 'Shape'], ['carat', 'Carat'], ['color', 'Color'], ['clarity', 'Clarity'],
  ['cut', 'Cut'], ['polish', 'Polish'], ['symmetry', 'Symmetry'], ['fluorescence', 'Fluorescence'], ['measurements', 'Measurements'],
  ['depth_pct', 'Depth %'], ['table_pct', 'Table %'], ['girdle', 'Girdle'], ['culet', 'Culet'], ['inscription', 'Inscription'],
  ['key_to_symbols', 'Key to symbols'], ['lab_comments', 'Lab comments'],
]
const NUM = ['carat', 'depth_pct', 'table_pct']
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const same = (k: string, a: string, b: string) => (NUM.includes(k) ? a !== '' && b !== '' && Number(a) === Number(b) : a.toUpperCase() === b.toUpperCase())

/** White diamond page: photo or PDF of the certificate -> read -> show differences -> confirm -> grading filled in and certificate attached. */
export default function AddCert({ item, onDone }: { item: Item; onDone: () => void }) {
  const { toast } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'' | 'upload' | 'read' | 'save'>('')
  const [intake, setIntake] = useState<string | null>(null)
  const [x, setX] = useState<Extraction | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setErr(null); setX(null); setStep('upload')
    try {
      const files = await uploadFiles(Array.from(list).slice(0, 4), 'intake')
      const { data: id, error } = await supabase.rpc('create_intake', { p_files: files, p_kind: 'gia_cert', p_source: 'web', p_note: `Certificate for stock #${item.stock_no}` })
      if (error) throw error
      setIntake(id); setStep('read')
      const ex = await readIntake(id)
      if (!ex.stones.length) throw new Error('No certificate details could be read. Try a sharper photo or the PDF.')
      setX(ex)
    } catch (e) { setErr(errText(e)) } finally { setStep(''); if (input.current) input.current.value = '' }
  }

  const st = x?.stones[0] ?? {}
  const read = Object.fromEntries(FIELDS.map(([k]) => [k, str(st[k])]))
  const cur = Object.fromEntries(FIELDS.map(([k]) => [k, str((item as unknown as Record<string, unknown>)[k])]))
  const rows = FIELDS.filter(([k]) => read[k] !== '')
  const changed = rows.filter(([k]) => !same(k, cur[k], read[k]))
  const otherCert = cur.cert_no !== '' && read.cert_no !== '' && cur.cert_no !== read.cert_no

  async function cancel() {
    const id = intake
    setX(null); setIntake(null); setErr(null)
    if (id) await supabase.rpc('discard_intake', { p_id: id })
  }
  async function save() {
    if (!intake) return
    setStep('save'); setErr(null)
    const line: Record<string, unknown> = { id: item.id }
    for (const [k] of rows) line[k] = NUM.includes(k) ? Number(read[k]) : read[k]
    const { error } = await supabase.rpc('save_intake', { p_id: intake, p_header: { doc_kind: 'gia_cert' }, p_lines: [line] })
    setStep('')
    if (error) return setErr(errText(error))
    toast(changed.length ? `Certificate added · ${changed.length} detail${changed.length === 1 ? '' : 's'} updated` : 'Certificate added')
    setX(null); setIntake(null); onDone()
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="btn sm" disabled={step !== ''} onClick={() => input.current?.click()}>
        <Icon name="camera" /> {step === 'upload' ? 'Uploading…' : step === 'read' ? 'Reading… (5–20 s)' : 'Add GIA certificate'}
      </button>
      {err && !x && <div className="alert" style={{ marginTop: 8 }}>{err}</div>}
      {x && (
        <div className="help-back" onClick={(e) => { if (e.target === e.currentTarget) cancel() }}>
          <div className="help-box card" style={{ width: 'min(720px, 100%)' }} role="dialog" aria-label="Certificate details">
            <div className="card-head"><h3>Certificate for #{item.stock_no}</h3><button className="btn ghost sm" onClick={cancel} aria-label="Close"><Icon name="x" /></button></div>
            <div className="card-pad">
              {err && <div className="alert">{err}</div>}
              {x.document_type !== 'gia_cert' && <div className="alert">This doesn’t look like a grading certificate. Check the photo.</div>}
              {otherCert && <div className="alert">This is report {read.lab} {read.cert_no}, but the stone has {cur.lab} {cur.cert_no}. Make sure it’s the right certificate.</div>}
              {x.warnings.length > 0 && <ul className="muted small" style={{ marginTop: 0 }}>{x.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
              <div className="table-wrap"><table className="t">
                <thead><tr><th>Detail</th><th>Now</th><th>On the certificate</th></tr></thead>
                <tbody>{rows.map(([k, label]) => {
                  const diff = !same(k, cur[k], read[k])
                  return (
                    <tr key={k} style={{ cursor: 'default' }}>
                      <td className="nw">{label}</td>
                      <td className="faint">{cur[k] || '—'}</td>
                      <td style={diff ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{read[k]}</td>
                    </tr>)
                })}</tbody>
              </table></div>
              <div className="muted small" style={{ marginTop: 10 }}>
                {changed.length ? `${changed.length} detail${changed.length === 1 ? '' : 's'} will change (highlighted).` : 'Everything already matches.'} The certificate is attached to the stone. Price and supplier stay as they are.
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button className="btn" onClick={cancel} disabled={step === 'save'}>Cancel</button>
                <button className="btn primary" onClick={save} disabled={step === 'save'}>{step === 'save' ? 'Saving…' : 'Confirm'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

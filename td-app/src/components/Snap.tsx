import { useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { uploadFiles } from '../lib/stock'
import { go } from '../lib/router'
import { Icon } from './ui'

/** One button: take a photo (phone camera) or pick photos/PDFs. Creates an Inbox item and opens it for review. */
export default function Snap({ label = 'Snap a document', primary = true, big = false }: { label?: string; primary?: boolean; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true); setErr(null)
    try {
      const files = await uploadFiles(Array.from(list).slice(0, 10), 'intake')
      const { data, error } = await supabase.rpc('create_intake', { p_files: files, p_kind: 'auto', p_source: 'web', p_note: '' })
      if (error) throw error
      go('inbox/' + data)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {big ? (
        <button className="qa" onClick={() => input.current?.click()} disabled={busy}>
          <span className="ico"><Icon name="camera" /></span>
          <span className="t">{busy ? 'Uploading…' : label}</span>
          <span className="s">GIA cert, memo or invoice</span>
        </button>
      ) : (
        <button className={'btn' + (primary ? ' primary' : '')} onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="camera" /> {busy ? 'Uploading…' : label}
        </button>
      )}
      {err && <div className="alert" style={{ marginTop: 8 }}>{err}</div>}
    </>
  )
}

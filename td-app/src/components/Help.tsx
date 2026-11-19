import { useEffect, useRef, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { HELP_SCREENS, helpTitle } from '../lib/help'
import { Icon, useApp } from './ui'

type Row = { key: string; path: string; file_name: string | null; size_bytes: number | null; updated_at: string }
const MAX = 50 * 1024 * 1024
const TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']

async function uploadVideo(key: string, file: File) {
  if (file.size > MAX) throw new Error('Video is over 50 MB. Keep it under about 1 minute, or export at 720p.')
  const type = TYPES.includes(file.type) ? file.type : 'video/mp4'
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const path = `${key}/${Date.now()}.${ext}`
  const up = await supabase.storage.from('help').upload(path, file, { contentType: type })
  if (up.error) throw new Error(errText(up.error))
  const { data: old, error } = await supabase.rpc('save_help_video', { p_key: key, p_path: path, p_file_name: file.name, p_size: file.size })
  if (error) { await supabase.storage.from('help').remove([path]); throw new Error(errText(error)) }
  if (old) await supabase.storage.from('help').remove([old as string])
}

async function removeVideo(key: string) {
  const { data: old, error } = await supabase.rpc('remove_help_video', { p_key: key })
  if (error) throw new Error(errText(error))
  if (old) await supabase.storage.from('help').remove([old as string])
}

function UploadButton({ label, onFile, busy }: { label: string; onFile: (f: File) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="btn sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : label}</button>
      <input ref={ref} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
    </>
  )
}

/** Floating "Help" button shown on every screen that has a help key. */
export function HelpButton({ screen }: { screen: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="help-fab" onClick={() => setOpen(true)} title="How to use this screen" aria-label="Help video for this screen">
        <span className="help-q">?</span> Help
      </button>
      {open && <HelpModal screen={screen} onClose={() => setOpen(false)} />}
    </>
  )
}

function HelpModal({ screen, onClose }: { screen: string; onClose: () => void }) {
  const { me, toast } = useApp()
  const owner = me.role === 'owner'
  const [row, setRow] = useState<Row | null | undefined>(undefined)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('help_videos').select('*').eq('key', screen).maybeSingle()
    setRow(data as Row | null)
    setUrl(null)
    if (data) {
      const s = await supabase.storage.from('help').createSignedUrl((data as Row).path, 3600)
      setUrl(s.data?.signedUrl ?? null)
    }
  }
  useEffect(() => { load() }, [screen])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  async function put(f: File) {
    setBusy(true); setErr(null)
    try { await uploadVideo(screen, f); toast('Video saved'); await load() } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function del() {
    if (!row || !confirm('Remove this help video?')) return
    try { await removeVideo(row.key); toast('Video removed'); await load() } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="help-back" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="help-box card" role="dialog" aria-label={'Help: ' + helpTitle(screen)}>
        <div className="card-head">
          <h3>How to: {helpTitle(screen)}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="card-pad">
          {err && <div className="alert">{err}</div>}
          {row === undefined ? <div className="faint">Loading…</div>
            : url ? <video key={url} src={url} controls autoPlay playsInline className="help-video" />
            : row ? <div className="faint">Loading video…</div>
            : <div className="help-empty">No video for this screen yet.{owner && ' Upload a short screen recording below.'}</div>}
          {owner && (
            <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              {row && <button className="btn sm danger" onClick={del}>Remove</button>}
              <UploadButton label={row ? 'Replace video' : 'Upload video'} onFile={put} busy={busy} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Settings section (owner): which screens have a video, upload/replace from one place. */
export function HelpVideosAdmin() {
  const { me, toast } = useApp()
  const owner = me.role === 'owner'
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => supabase.from('help_videos').select('*').then(({ data }) => setRows(Object.fromEntries(((data ?? []) as Row[]).map((r) => [r.key, r]))))
  useEffect(() => { load() }, [])
  const done = Object.keys(rows).length
  async function put(key: string, f: File) {
    setBusy(key); setErr(null)
    try { await uploadVideo(key, f); toast('Video saved'); await load() } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head"><h3>Help videos</h3><span className="faint small">{done} of {HELP_SCREENS.length} screens have a video</span></div>
      <div className="card-pad">
        {err && <div className="alert">{err}</div>}
        <div className="faint small" style={{ marginBottom: 10 }}>Each screen has a Help button (bottom right) that plays its video. Videos: MP4 or MOV, up to 50 MB (about 1 minute).</div>
        <div className="table-wrap"><table className="t">
          <tbody>
            {HELP_SCREENS.map((s, i) => {
              const head = i === 0 || HELP_SCREENS[i - 1].group !== s.group ? s.group : null
              const r = rows[s.key]
              return [
                head && <tr key={'g' + s.group}><td colSpan={3} className="faint small" style={{ paddingTop: 12, fontWeight: 600 }}>{head}</td></tr>,
                <tr key={s.key}>
                  <td>{s.title}</td>
                  <td>{r ? <span className="chip" style={{ cursor: 'default' }}>✓ {new Date(r.updated_at).toLocaleDateString()}</span> : <span className="faint">No video</span>}</td>
                  <td style={{ textAlign: 'right' }}>{owner && <UploadButton label={r ? 'Replace' : 'Upload'} busy={busy === s.key} onFile={(f) => put(s.key, f)} />}</td>
                </tr>,
              ]
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}

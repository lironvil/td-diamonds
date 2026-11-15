import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { ago, personName } from '../lib/format'
import { go } from '../lib/router'
import { useApp } from '../components/ui'
import Snap from '../components/Snap'
import { DOC_KIND, signedUrl, type Intake } from '../lib/stock'

const STATUS: Record<string, string> = { new: 'Waiting', reading: 'Reading…', ready: 'Ready to review', failed: 'Needs attention', saved: 'Saved', discarded: 'Discarded' }

export default function Inbox() {
  const { team } = useApp()
  const [open, setOpen] = useState<Intake[] | null>(null)
  const [done, setDone] = useState<Intake[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const [a, b] = await Promise.all([
      supabase.from('intakes').select('*').in('status', ['new', 'reading', 'ready', 'failed']).order('created_at', { ascending: false }),
      supabase.from('intakes').select('*').in('status', ['saved', 'discarded']).order('closed_at', { ascending: false }).limit(15),
    ])
    if (a.error) return setErr(errText(a.error))
    setOpen(a.data as Intake[]); setDone((b.data ?? []) as Intake[])
  }
  useEffect(() => {
    load()
    const ch = supabase.channel('intakes-inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'intakes' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  useEffect(() => {
    for (const n of [...(open ?? []), ...done]) {
      const f = n.files[0]
      if (f && f.mime !== 'application/pdf' && !thumbs[n.id]) signedUrl(f.path).then((u) => u && setThumbs((t) => ({ ...t, [n.id]: u })))
    }
  }, [open, done])

  const row = (n: Intake) => {
    const x = n.extraction
    const title = x ? [DOC_KIND[x.document_type] ?? 'Document', x.supplier, x.doc_number && '#' + x.doc_number].filter(Boolean).join(' · ') : DOC_KIND[n.doc_kind] ?? 'Document'
    return (
      <li key={n.id} onClick={() => go('inbox/' + n.id)} style={{ cursor: 'pointer', gridTemplateColumns: '56px 1fr auto' }}>
        <span style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line)', overflow: 'hidden', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--faint)' }}>
          {thumbs[n.id] ? <img src={thumbs[n.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : n.files[0]?.mime === 'application/pdf' ? 'PDF' : ''}
        </span>
        <div>
          <div className="what">{title}</div>
          <div className="detail">
            {x ? `${x.stones.length} stone${x.stones.length === 1 ? '' : 's'}` : `${n.files.length} file${n.files.length === 1 ? '' : 's'}`}
            {' · '}{personName(n.created_by, team)}{n.source === 'memo_app' ? ' (Memo app)' : ''}
            {n.status === 'failed' && n.error ? <span style={{ color: 'var(--bad)' }}> · {n.error}</span> : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={'badge' + (n.status === 'ready' ? '' : n.status === 'failed' ? ' bad' : ' grey')}>{STATUS[n.status]}</span>
          <div className="time" style={{ marginTop: 4 }}>{ago(n.closed_at ?? n.created_at)}</div>
        </div>
      </li>
    )
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Inbox</h1><div className="sub">Photos of certificates, memos and invoices from everyone on the team, waiting to become stock.</div></div>
        <Snap />
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h2>To review</h2><span className="faint small">{open?.length ?? ''}</span></div>
        {open === null ? <div className="loading">Loading…</div> : open.length === 0 ? (
          <div className="empty"><div className="big">All clear</div>Snap a GIA certificate, a supplier memo or an invoice. The details are read for you.</div>
        ) : <ul className="feed">{open.map(row)}</ul>}
      </div>
      {done.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Recently handled</h2></div>
          <ul className="feed">{done.map(row)}</ul>
        </div>
      )}
    </>
  )
}

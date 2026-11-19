import { useEffect, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { useApp } from '../components/ui'
import { HelpVideosAdmin } from '../components/Help'

const FIELDS: [string, string, boolean?][] = [
  ['company_name', 'Company name'], ['company_address', 'Address (as printed)', true], ['company_phone', 'Phone'], ['company_email', 'Email'],
  ['memo_terms_text', 'Text printed at the bottom of memos (optional)', true],
]
const NUMS: [string, string][] = [['memo', 'Next memo #'], ['memo_in', 'Next memo-in #'], ['memo_return', 'Next memo return #'], ['memo_in_return', 'Next return-to-supplier #'], ['stock', 'Next stock #'], ['account', 'Next account #']]

export default function Settings() {
  const { me, toast } = useApp()
  const owner = me.role === 'owner'
  const [v, setV] = useState<Record<string, string>>({})
  const [n, setN] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('settings').select('key,value').then(({ data }) => setV(Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))))
    supabase.from('counters').select('kind,next_no').then(({ data }) => setN(Object.fromEntries((data ?? []).map((r) => [r.kind, String(r.next_no)]))))
  }, [])
  async function saveField(k: string) {
    const { error } = await supabase.rpc('save_setting', { p_key: k, p_value: v[k] ?? '' })
    if (error) setErr(errText(error)); else toast('Saved')
  }
  async function saveNum(k: string) {
    const { error } = await supabase.rpc('set_next_number', { p_kind: k, p_next: Number(n[k]) })
    if (error) setErr(errText(error)); else toast('Numbering updated')
  }
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><div className="sub">{owner ? 'Printed on memos and documents.' : 'Only the owner can change settings.'}</div></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="grid two">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Company (letterhead)</h3>
          <div className="grid" style={{ gap: 12 }}>
            {FIELDS.map(([k, label, multi]) => (
              <label className="f" key={k}>{label}
                {multi ? <textarea className="input" disabled={!owner} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => owner && saveField(k)} />
                  : <input className="input" disabled={!owner} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} onBlur={() => owner && saveField(k)} />}
              </label>
            ))}
            {owner && <div className="faint small">Each field saves when you leave it.</div>}
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Numbering</h3>
          <div className="grid" style={{ gap: 10 }}>
            {NUMS.map(([k, label]) => (
              <div className="row" key={k} style={{ alignItems: 'flex-end' }}>
                <label className="f" style={{ flex: 1 }}>{label}<input className="input num" disabled={!owner} inputMode="numeric" value={n[k] ?? ''} onChange={(e) => setN({ ...n, [k]: e.target.value })} /></label>
                {owner && <button className="btn sm" onClick={() => saveNum(k)}>Set</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <HelpVideosAdmin />
    </>
  )
}


import { useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { Logo } from '../components/ui'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ text: /invalid/i.test(error.message) ? 'Wrong email or password.' : errText(error) })
  }

  async function reset() {
    if (!email.trim()) { setMsg({ text: 'Enter your email first.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
    setBusy(false)
    setMsg(error ? { text: errText(error) } : { text: 'Check your email for a link to set a new password.', ok: true })
  }

  return (
    <div className="signin">
      <form className="box" onSubmit={submit}>
        <div className="logo">
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 56, height: 56, borderRadius: 14, background: '#221F1F', marginBottom: 12 }}><Logo size={36} /></div>
          <div className="brand-name">TD DIAMONDS</div>
          <div className="muted small" style={{ marginTop: 4 }}>Sign in with your TD Memo login</div>
        </div>
        {msg && <div className={'alert' + (msg.ok ? ' ok' : '')}>{msg.text}</div>}
        <div className="grid" style={{ gap: 12 }}>
          <label className="f">Email
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="f">Password
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: '10px' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn ghost small" onClick={reset} disabled={busy} style={{ justifyContent: 'center' }}>Forgot password?</button>
        </div>
      </form>
    </div>
  )
}

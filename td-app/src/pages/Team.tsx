import { useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { Icon, useApp } from '../components/ui'

async function callTeam(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('team', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* keep */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function Team() {
  const { me, team, refreshTeam, toast } = useApp()
  const owner = me.role === 'owner'
  const [add, setAdd] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pw, setPw] = useState<{ id: string; value: string } | null>(null)

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null)
    try { await callTeam(body); toast(done); refreshTeam(); return true }
    catch (e) { setErr(errText(e)); return false }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Team</h1><div className="sub">Everyone uses the same login for the Diamond software and the TD Memo app.</div></div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h2>People</h2><span className="faint small">{team.length}</span></div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Email</th><th>Access</th>{owner && <th />}</tr></thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.user_id} style={{ cursor: 'default' }}>
                    <td><b style={{ fontWeight: 600 }}>{m.name || '—'}</b></td>
                    <td>{m.email}</td>
                    <td><span className={'badge' + (m.role === 'owner' ? '' : ' grey')}>{m.role === 'owner' ? 'Owner' : 'Staff'}</span></td>
                    {owner && (
                      <td className="r">
                        {m.role !== 'owner' && (pw?.id === m.user_id ? (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <input className="input" style={{ width: 160 }} type="text" placeholder="New password" value={pw.value} onChange={(e) => setPw({ id: m.user_id, value: e.target.value })} />
                            <button className="btn sm primary" disabled={busy} onClick={async () => { if (await run({ action: 'password', user_id: m.user_id, password: pw.value }, 'Password changed')) setPw(null) }}>Set</button>
                            <button className="btn sm ghost" onClick={() => setPw(null)}>Cancel</button>
                          </span>
                        ) : (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn sm" onClick={() => setPw({ id: m.user_id, value: '' })}>Set password</button>
                            <button className="btn sm ghost danger" disabled={busy} onClick={() => { if (confirm(`Remove ${m.name || m.email}? They will no longer be able to sign in.`)) run({ action: 'remove', user_id: m.user_id }, 'Removed') }}>Remove</button>
                          </span>
                        ))}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          {owner ? (
            <form className="card card-pad" onSubmit={async (e) => {
              e.preventDefault()
              if (await run({ action: 'add', ...add }, `${add.name || add.email} added`)) setAdd({ name: '', email: '', password: '' })
            }}>
              <h3 style={{ marginBottom: 12 }}>Add a person</h3>
              <div className="grid" style={{ gap: 12 }}>
                <label className="f">Name<input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required /></label>
                <label className="f">Email<input className="input" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} required /></label>
                <label className="f">Password (8+ characters)<input className="input" type="text" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} required minLength={8} /></label>
                <button className="btn primary" disabled={busy}><Icon name="plus" /> Add as staff</button>
                <div className="faint small">Staff can do everything except reports and profit. Give them the email and password; they sign in at this same address and in the TD Memo app.</div>
              </div>
            </form>
          ) : (
            <div className="card card-pad muted">Only the owner can add or remove people.</div>
          )}
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Access</h3>
            <dl className="kv">
              <dt>Owner</dt><dd>Everything, including reports and profit on invoices.</dd>
              <dt>Staff</dt><dd>Everything else. Sees costs; profit figures are never shown.</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  )
}

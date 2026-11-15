import { useEffect, useMemo, useState } from 'react'
import { supabase, errText } from '../lib/supabase'
import { downloadCsv, money0 } from '../lib/format'
import { go } from '../lib/router'
import { Icon, Stars } from '../components/ui'
import { ACCOUNT_TYPES, typeLabel, type Account } from '../lib/types'

type SortKey = 'acct_no' | 'company' | 'city' | 'country' | 'rating' | 'credit_limit'

function readPrefs() {
  try { return JSON.parse(localStorage.getItem('td-accounts-view') || '{}') } catch { return {} }
}

export default function Accounts() {
  const prefs = readPrefs()
  const [rows, setRows] = useState<Account[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState<string>(prefs.type ?? 'all')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>(prefs.status ?? 'active')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(prefs.sort ?? { key: 'company', dir: 1 })

  useEffect(() => {
    supabase.from('accounts').select('*').order('company').then(({ data, error }) => (error ? setErr(errText(error)) : setRows(data as Account[])))
  }, [])
  useEffect(() => {
    try { localStorage.setItem('td-accounts-view', JSON.stringify({ type, status, sort })) } catch { /* ignore */ }
  }, [type, status, sort])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const r of rows ?? []) {
      if (status !== 'all' && r.active !== (status === 'active')) continue
      c.all++
      for (const t of r.types) c[t] = (c[t] ?? 0) + 1
    }
    return c
  }, [rows, status])

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const out = (rows ?? []).filter((r) => {
      if (status !== 'all' && r.active !== (status === 'active')) return false
      if (type !== 'all' && !r.types.includes(type)) return false
      if (!words.length) return true
      const hay = [r.acct_no, r.company, r.contact, r.email, r.phone, r.mobile, r.city, r.state, r.country,
        ...r.contacts.map((c) => `${c.name} ${c.phone} ${c.email}`)].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    const k = sort.key
    out.sort((a, b) => {
      const av = a[k] ?? '', bv = b[k] ?? ''
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sort.dir
    })
    return out
  }, [rows, q, type, status, sort])

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={cls} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )

  function exportCsv() {
    downloadCsv('td-accounts.csv', [
      ['Acct#', 'Company', 'Types', 'Active', 'Contact', 'Email', 'Phone', 'Mobile', 'Address', 'City', 'State', 'Zip', 'Country', 'Rating', 'Credit limit', 'Invoice terms', 'Memo terms'],
      ...list.map((r) => [r.acct_no, r.company, r.types.map(typeLabel).join('/'), r.active ? 'Yes' : 'No', r.contact, r.email, r.phone, r.mobile,
        [r.address1, r.address2].filter(Boolean).join(', '), r.city, r.state, r.zip, r.country, r.rating, r.credit_limit, r.invoice_terms, r.memo_terms]),
    ])
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Accounts</h1><div className="sub">Customers, suppliers, partners and everyone else TD deals with</div></div>
        <div className="row">
          <button className="btn" onClick={exportCsv} disabled={!list.length}><Icon name="download" /> Export</button>
          <a className="btn primary" href="#/accounts/new"><Icon name="plus" /> New account</a>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="card">
        <div className="card-pad" style={{ display: 'grid', gap: 12, borderBottom: '1px solid var(--line)' }}>
          <div className="row">
            <div className="search" style={{ flex: '1 1 260px' }}>
              <Icon name="search" />
              <input className="input" placeholder="Search name, acct #, contact, phone, city…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">Active + inactive</option>
            </select>
          </div>
          <div className="chips">
            <button className={'chip' + (type === 'all' ? ' on' : '')} onClick={() => setType('all')}>All<span className="count">{counts.all}</span></button>
            {ACCOUNT_TYPES.filter((t) => counts[t.key] || ['customer', 'supplier', 'partner'].includes(t.key)).map((t) => (
              <button key={t.key} className={'chip' + (type === t.key ? ' on' : '')} onClick={() => setType(t.key)}>
                {t.label}s<span className="count">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {rows === null ? <div className="loading">Loading…</div> : list.length === 0 ? (
          <div className="empty">
            <div className="big">{rows.length ? 'No matches' : 'No accounts yet'}</div>
            {rows.length ? 'Try a different search or filter.' : <>Add your first customer or supplier. <a href="#/accounts/new">New account</a></>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  {th('acct_no', 'Acct #')}
                  {th('company', 'Company')}
                  <th>Type</th>
                  <th className="hide-sm">Contact</th>
                  <th className="hide-sm">Phone</th>
                  {th('city', 'City / State', 'hide-sm')}
                  {th('country', 'Country', 'hide-sm')}
                  {th('credit_limit', 'Credit limit', 'r hide-sm')}
                  {th('rating', 'Rating', 'hide-sm')}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'inactive'} onClick={() => go('accounts/' + r.id)}>
                    <td className="num">{r.acct_no}</td>
                    <td><b style={{ fontWeight: 600 }}>{r.company}</b>{!r.active && <span className="badge bad" style={{ marginLeft: 8 }}>Inactive</span>}</td>
                    <td>{r.types.map((t) => <span key={t} className="badge">{typeLabel(t)}</span>)}</td>
                    <td className="hide-sm">{r.contact || r.contacts[0]?.name || <span className="faint">—</span>}</td>
                    <td className="hide-sm num nw">{r.phone || r.mobile || <span className="faint">—</span>}</td>
                    <td className="hide-sm">{[r.city, r.state].filter(Boolean).join(', ') || <span className="faint">—</span>}</td>
                    <td className="hide-sm">{r.country}</td>
                    <td className="r num hide-sm">{r.credit_limit != null ? money0(r.credit_limit) : <span className="faint">—</span>}</td>
                    <td className="hide-sm"><Stars n={r.rating} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={9} className="small">{list.length} of {rows.length} accounts</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

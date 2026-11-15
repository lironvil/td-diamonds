import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, type Me } from '../lib/supabase'

/* ---------- icons (simple strokes) ---------- */
const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  memo: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
  cart: 'M3 4h2l2 12h11l2-8H6M9 20a1 1 0 1 0 0 .1M17 20a1 1 0 1 0 0 .1',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v.01M18 14v.01',
  undo: 'M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4',
  diamond: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 18 3-18',
  menu: 'M4 6h16M4 12h16M4 18h16',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  back: 'M15 18l-6-6 6-6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5 3.6 3.6M20.4 20.4 19 19M5 19l-1.4 1.4M20.4 3.6 19 5M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  x: 'M6 6l12 12M18 6 6 18',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
}
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ''} />
    </svg>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 10 52 28 32 54 12 28Z" fill="none" stroke="#D1D199" strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 28h40M23 28l9-18 9 18-9 26-9-26" fill="none" stroke="#D1D199" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export const Stars = ({ n }: { n: number }) =>
  n > 0 ? <span className="stars" aria-label={`${n} stars`}>{'★'.repeat(n)}<span className="faint">{'★'.repeat(5 - n)}</span></span> : <span className="faint">—</span>

/* ---------- app-wide context: who is signed in, team list, toast ---------- */
type Ctx = {
  me: Me
  team: { email: string; name: string; role: string; user_id: string }[]
  refreshTeam: () => void
  toast: (msg: string) => void
}
const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => useContext(AppCtx)!

export function AppProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [team, setTeam] = useState<Ctx['team']>([])
  const [msg, setMsg] = useState<string | null>(null)
  const refreshTeam = useCallback(() => {
    supabase.from('members').select('user_id,email,name,role').order('name').then(({ data }) => setTeam(data ?? []))
  }, [])
  useEffect(refreshTeam, [refreshTeam])
  const toast = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <AppCtx.Provider value={{ me, team, refreshTeam, toast }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </AppCtx.Provider>
  )
}

/* ---------- theme ---------- */
export function useTheme() {
  const read = () => {
    try { return (localStorage.getItem('td-theme') as 'light' | 'dark' | 'auto') || 'auto' } catch { return 'auto' }
  }
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(read)
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('td-theme', theme) } catch { /* private mode */ }
  }, [theme])
  const next = () => setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'))
  return { theme, next }
}

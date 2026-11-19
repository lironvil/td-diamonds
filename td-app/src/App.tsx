import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, errText, type Me } from './lib/supabase'
import { useRoute } from './lib/router'
import { AppProvider, Icon, useTheme } from './components/ui'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import Accounts from './pages/Accounts'
import AccountView from './pages/AccountView'
import AccountForm from './pages/AccountForm'
import Team from './pages/Team'
import Soon from './pages/Soon'
import Stock from './pages/Stock'
import StockView from './pages/StockView'
import StockForm from './pages/StockForm'
import Inbox from './pages/Inbox'
import IntakeReview from './pages/IntakeReview'
import DocList from './pages/DocList'
import DocView from './pages/DocView'
import MemoNew from './pages/MemoNew'
import MemoInNew from './pages/MemoInNew'
import QuickReturn from './pages/QuickReturn'
import PrintDoc from './pages/PrintDoc'
import KindList from './pages/KindList'
import ItemForm from './pages/ItemForm'
import { MixList, MixNew } from './pages/Mixing'
import Settings from './pages/Settings'
import { LedgerList, PaymentList } from './pages/LedgerList'
import LedgerView from './pages/LedgerView'
import InvoiceNew from './pages/InvoiceNew'
import PurchaseNew from './pages/PurchaseNew'
import { PaymentNew, PaymentView } from './pages/PaymentPages'
import { HelpButton } from './components/Help'
import { helpKey } from './lib/help'

export type NavItem = { path: string; label: string; stage?: number; owner?: boolean }
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ path: '', label: 'Home' }, { path: 'accounts', label: 'Accounts' }] },
  {
    group: 'Inventory',
    items: [
      { path: 'inbox', label: 'Inbox (photos)' },
      { path: 'stock', label: 'White diamonds' },
      { path: 'parcels', label: 'Diamond parcels' },
      { path: 'parcel-mixing', label: 'Parcel mixing' },
      { path: 'jewelry', label: 'Jewelry' },
      { path: 'm/matching', label: 'Matching diamonds', stage: 6 },
      { path: 'm/gemstones', label: 'Gemstones', stage: 6 },
    ],
  },
  {
    group: 'Sales',
    items: [
      { path: 'memos', label: 'Memos' },
      { path: 'memo-quick-return', label: 'Memo quick return' },
      { path: 'invoices', label: 'Invoices' },
      { path: 'payments-in', label: 'Customer payments' },
    ],
  },
  {
    group: 'Purchasing',
    items: [
      { path: 'memo-in', label: 'Memo-in' },
      { path: 'purchases', label: 'Purchases & vendor bills' },
      { path: 'payments-out', label: 'Supplier payments' },
    ],
  },
  { group: 'Owner', items: [{ path: 'm/reports', label: 'Reports & profit', stage: 7, owner: true }] },
  { group: 'Settings', items: [{ path: 'team', label: 'Team' }, { path: 'settings', label: 'Settings' }] },
]

export default function App() {
  const appRoute = useRoute()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setMe(null); setMeError(null); return }
    supabase.rpc('whoami').then(({ data, error }) => {
      if (error) setMeError(errText(error))
      else setMe(data as Me)
    })
  }, [session?.user.id])

  if (session === undefined) return <div className="loading">Loading…</div>
  if (!session) return <SignIn />
  if (meError)
    return (
      <div className="signin"><div className="box">
        <div className="alert">{meError}</div>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div></div>
    )
  if (!me) return <div className="loading">Loading…</div>
  return (
    <AppProvider me={me}>
      {appRoute[0] === 'print' && appRoute[1] ? <PrintDoc id={appRoute[1]} /> : <Shell me={me} />}
    </AppProvider>
  )
}

function Shell({ me }: { me: Me }) {
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const { theme, next } = useTheme()
  const path = route.join('/')
  useEffect(() => setOpen(false), [path])
  const [inbox, setInbox] = useState(0)
  useEffect(() => {
    const count = () => supabase.from('intakes').select('id', { count: 'exact', head: true }).in('status', ['new', 'reading', 'ready', 'failed'])
      .then(({ count }) => setInbox(count ?? 0))
    count()
    const ch = supabase.channel('intakes-nav').on('postgres_changes', { event: '*', schema: 'public', table: 'intakes' }, count).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  let page
  if (route[0] === 'accounts' && route[1] === 'new') page = <AccountForm />
  else if (route[0] === 'accounts' && route[1] && route[2] === 'edit') page = <AccountForm key={path} id={route[1]} />
  else if (route[0] === 'accounts' && route[1]) page = <AccountView key={path} id={route[1]} />
  else if (route[0] === 'accounts') page = <Accounts />
  else if (route[0] === 'team') page = <Team />
  else if (route[0] === 'stock' && route[1] === 'new') page = <StockForm />
  else if (route[0] === 'stock' && route[1] && route[2] === 'edit') page = <StockForm key={path} id={route[1]} />
  else if (route[0] === 'stock' && route[1]) page = <StockView key={path} id={route[1]} />
  else if (route[0] === 'stock') page = <Stock />
  else if (route[0] === 'inbox' && route[1]) page = <IntakeReview key={path} id={route[1]} />
  else if (route[0] === 'inbox') page = <Inbox />
  else if (route[0] === 'memos' && route[1] === 'new') page = <MemoNew />
  else if (route[0] === 'memos' && route[1]) page = <DocView key={path} id={route[1]} />
  else if (route[0] === 'memos') page = <DocList key="m" kind="memo" />
  else if (route[0] === 'memo-in' && route[1] === 'new') page = <MemoInNew />
  else if (route[0] === 'memo-in' && route[1]) page = <DocView key={path} id={route[1]} />
  else if (route[0] === 'memo-in') page = <DocList key="mi" kind="memo_in" />
  else if (route[0] === 'docs' && route[1]) page = <DocView key={path} id={route[1]} />
  else if (route[0] === 'memo-quick-return') page = <QuickReturn />
  else if (route[0] === 'parcels' && route[1] === 'new') page = <ItemForm kind="parcel" />
  else if (route[0] === 'parcels') page = <KindList key="p" kind="parcel" />
  else if (route[0] === 'jewelry' && route[1] === 'new') page = <ItemForm kind="jewelry" />
  else if (route[0] === 'jewelry') page = <KindList key="j" kind="jewelry" />
  else if (route[0] === 'parcel-mixing' && route[1] === 'new') page = <MixNew />
  else if (route[0] === 'parcel-mixing') page = <MixList />
  else if (route[0] === 'settings') page = <Settings />
  else if (route[0] === 'invoices' && route[1] === 'new') page = <InvoiceNew />
  else if (route[0] === 'invoices' && route[1]) page = <LedgerView key={path} id={route[1]} />
  else if (route[0] === 'invoices') page = <LedgerList key="inv" kind="invoice" />
  else if (route[0] === 'purchases' && route[1] === 'new') page = <PurchaseNew />
  else if (route[0] === 'purchases' && route[1]) page = <LedgerView key={path} id={route[1]} />
  else if (route[0] === 'purchases') page = <LedgerList key="pur" kind="purchase" />
  else if (route[0] === 'payments-in' && route[1] === 'new') page = <PaymentNew key="in" kind="in" />
  else if (route[0] === 'payments-in' && route[1]) page = <PaymentView key={path} id={route[1]} />
  else if (route[0] === 'payments-in') page = <PaymentList key="pin" kind="in" />
  else if (route[0] === 'payments-out' && route[1] === 'new') page = <PaymentNew key="out" kind="out" />
  else if (route[0] === 'payments-out' && route[1]) page = <PaymentView key={path} id={route[1]} />
  else if (route[0] === 'payments-out') page = <PaymentList key="pout" kind="out" />
  else if (route[0] === 'm') {
    const item = NAV.flatMap((g) => g.items).find((i) => i.path === path)
    page = <Soon label={item?.label ?? 'This module'} stage={item?.stage} />
  } else page = <Home />

  const help = helpKey(route)
  const isOn = (p: string) => (p === '' ? path === '' : path === p || path.startsWith(p + '/'))

  return (
    <div className="shell">
      <aside className={'side' + (open ? ' open' : '')} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
        <a className="brand" href="#/">
          <img src="./logo-negative.png" alt="TD Diamonds" style={{ width: 132, display: 'block', margin: '4px auto 0' }} />
        </a>
        <nav className="nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.owner || me.role === 'owner')
            if (!items.length) return null
            return (
              <div key={g.group}>
                {g.group && <div className="nav-group">{g.group}</div>}
                {items.map((i) => (
                  <a key={i.path} href={'#/' + i.path} className={(isOn(i.path) ? 'on ' : '') + (i.stage ? 'soon' : '')}>
                    <span>{i.label}</span>
                    {i.stage && <span className="tag">Stage {i.stage}</span>}
                    {i.path === 'inbox' && inbox > 0 && <span className="tag" style={{ background: 'var(--gold)', color: '#221F1F', borderColor: 'var(--gold)' }}>{inbox}</span>}
                  </a>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="side-foot">
          <div style={{ color: 'var(--nav-text)' }}>{me.name || me.email}</div>
          <div>{me.role === 'owner' ? 'Owner' : 'Staff'}</div>
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <button onClick={next} title="Light / dark">Theme: {theme === 'auto' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</button>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <div>
        <div className="topbar">
          <button onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" size={22} /></button>
          <img src="./mark-negative.png" alt="TD Diamonds" style={{ height: 30 }} />
        </div>
        <main className="main">{page}</main>
        {help && <HelpButton key={help} screen={help} />}
      </div>
    </div>
  )
}


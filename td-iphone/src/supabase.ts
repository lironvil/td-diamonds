import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

export const SUPABASE_URL = 'https://oebqonzayfxfzvlvjgpv.supabase.co'
// Publishable key (same as the web app): access is enforced by row-level security and checked database functions.
const KEY = 'sb_publishable_SlLP9Nj2LmMrdMVZWkUyVQ_KJhKI2J4'

export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'td-diamond-auth' },
})

// Refresh the session only while the app is in the foreground.
AppState.addEventListener('change', (s) => {
  if (s === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

export type Me = { email: string; name: string; role: 'owner' | 'staff'; today: string }

/** Turns a database or network error into a short message for the user. */
export function errText(e: unknown): string {
  if (!e) return 'Something went wrong.'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message ?? ''
  if (/Failed to fetch|Network request failed/i.test(m)) return 'No connection. Check the internet and try again.'
  if (/JWT|session/i.test(m)) return 'Please sign in again.'
  return m || 'Something went wrong.'
}

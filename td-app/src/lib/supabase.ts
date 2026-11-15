import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://oebqonzayfxfzvlvjgpv.supabase.co'
// Publishable key: safe in the browser. Access is enforced by row-level security and checked database functions.
const KEY = 'sb_publishable_SlLP9Nj2LmMrdMVZWkUyVQ_KJhKI2J4'

export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'td-diamond-auth' },
})

export type Me = { email: string; name: string; role: 'owner' | 'staff'; today: string }

/** Turns a database error into a short message for the user. */
export function errText(e: unknown): string {
  if (!e) return 'Something went wrong.'
  const m = (e as { message?: string }).message ?? String(e)
  if (/JWT|session|not authenticated/i.test(m)) return 'Please sign in again.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Check the internet and try again.'
  return m
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Fail fast in development if env vars are missing ──────────────────────────
// In production the Vite build validator (vite.config.js) already enforces
// this at build time, so this guard is primarily for local dev safety.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const msg =
    '[DealMatch] Missing Supabase environment variables.\n' +
    'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  if (import.meta.env.DEV) {
    // In dev: throw immediately so the error is obvious
    throw new Error(msg)
  } else {
    // In prod: log - build validator should have caught this, but be safe
    console.error(msg)
  }
}

// ── Supabase client ────────────────────────────────────────────────────────────
// Storage notes:
//   • We use localStorage (not the default IndexedDB adapter) to eliminate the
//     "Lock broken by another request" AbortError that occurs when multiple tabs
//     race on the Web Locks API used by the IndexedDB storage adapter.
//   • `storageKey` is scoped to this app so third-party scripts on the same
//     origin cannot read or overwrite our auth token.
//   • `flowType: 'pkce'` is required for the OAuth callback to work correctly
//     via exchangeCodeForSession(). The AuthCallback component handles this.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storage:            window.localStorage,
    storageKey:         'dealmatch-auth-token',
    flowType:           'pkce',
  },
})

// ─── Auth helpers ─────────────────────────────────────────
export const signUp = async ({ email, password, fullName }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: {
        full_name:     fullName,
      }
    },
  })
  return { data, error }
}

export const signIn = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const resetPassword = async (email) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  return { data, error }
}

// ─── Profile helpers ──────────────────────────────────────
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  return { data, error }
}

// Postgres text and jsonb columns both flatly reject an embedded NUL byte
// (\u0000) - jsonb raises it explicitly ("unsupported Unicode escape
// sequence... \u0000 cannot be converted to text"), which is what a user
// reported hitting as "null character not permitted" when publishing a
// listing. The most common real-world source is pasted text (from Word/PDF/
// some Android keyboards) carrying stray control characters, not anything
// the form itself sends deliberately - so the fix is defensive stripping
// at the one place all property inserts pass through, rather than trying
// to find and re-validate every text input individually.
export const stripControlChars = (value) => {
  if (typeof value === 'string') {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  }
  if (Array.isArray(value)) return value.map(stripControlChars)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripControlChars(v)]))
  }
  return value
}

// ─── Property helpers ─────────────────────────────────────
export const createProperty = async (payload) => {
  const { data, error } = await supabase
    .from('properties')
    .insert(stripControlChars(payload))
    .select()
    .single()
  return { data, error }
}

export const getProperties = async ({ limit = 20, filters = {} } = {}) => {
  // ✅ FIX: this previously selected('*') with no join at all, so every
  // consumer of getProperties() (including PropertyCarousel and the
  // HomePage discovery rail) has been silently rendering with NO images --
  // `p.images` was always undefined, falling through to each component's
  // no-image placeholder. Joining property_images here is what those
  // components' existing `p.images?.find(...)` logic already assumed was
  // happening.
  let query = supabase
    .from('properties')
    .select('*, images:property_images(id, url, is_primary, caption)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.state)         query = query.eq('state', filters.state)
  if (filters.city)          query = query.ilike('city', `%${filters.city}%`)
  if (filters.property_type) query = query.eq('property_type', filters.property_type)
  if (filters.listing_type)  query = query.eq('listing_type', filters.listing_type)
  if (filters.min_price)     query = query.gte('price', filters.min_price)
  if (filters.max_price)     query = query.lte('price', filters.max_price)
  if (filters.category)      query = query.eq('category', filters.category)

  const { data, error } = await query
  return { data, error }
}

export const getProperty = async (id) => {
  // ✅ SECURITY: never select the seller's phone here - this runs for
  // every visitor including anonymous ones. Contact is resolved separately
  // and only for entitled viewers via the get_property_contact() RPC
  // (owner / staff / a funded-escrow counterparty), never joined directly.
  // See supabase/migrations/20260812000000_production_hardening.sql.
  // profiles RLS hides other users' rows from visitors, so the seller's
  // display name/avatar comes from the public_profiles projection instead
  // of an embed (which returned null for anonymous viewers).
  const { data, error } = await supabase
    .from('properties')
    .select('*, images:property_images(id, url, is_primary, caption)')
    .eq('id', id)
    .single()
  if (error || !data) return { data, error }

  let profiles = null
  if (data.seller_id) {
    const { data: seller } = await supabase
      .from('public_profiles')
      .select('full_name, avatar_url')
      .eq('id', data.seller_id)
      .maybeSingle()
    profiles = seller || null
  }
  return { data: { ...data, profiles }, error: null }
}

// ─── Swipe / Match helpers ────────────────────────────────
export const recordSwipe = async ({ userId, propertyId, action }) => {
  const { error } = await supabase.from('swipes').upsert({
    user_id:     userId,
    property_id: propertyId,
    action,
    created_at:  new Date().toISOString(),
  }, { onConflict: 'user_id,property_id' })
  return { error }
}

export const getMatches = async (userId) => {
  const { data, error } = await supabase
    .from('swipes')
    .select('*, properties(*, profiles(full_name, phone, avatar_url))')
    .eq('user_id', userId)
    .in('action', ['like', 'super'])
    .order('created_at', { ascending: false })
  return { data, error }
}

// ─── Onboarding ───────────────────────────────────────────
export const completeOnboarding = async (userId, profileData) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...profileData,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()
  return { data, error }
}

// ─── Avatar upload ────────────────────────────────────────
export const uploadAvatar = async (userId, file) => {
  const ext      = file.name.split('.').pop()
  const fileName = `${userId}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type })

  if (uploadError) return { url: null, error: uploadError }

  const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)
  return { url: data.publicUrl, error: null }
}

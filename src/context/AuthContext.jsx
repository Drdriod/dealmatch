import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase, getProfile, updateProfile } from '@/lib/supabase'
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'


const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Track whether the initial session check has resolved so we never set
  // loading=true again after that - prevents flicker on tab focus / token refresh.
  const initialised = useRef(false)

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await getProfile(userId)
      if (data) {
        // FIX: account_status was written by every suspend/deactivate
        // action in the admin panel but nothing anywhere ever actually
        // checked it - a suspended user's session kept working exactly
        // as before, since RLS policies gate on role (staff permissions)
        // or auth.uid()=owner (their own rows), neither of which
        // account_status touches. This is the one choke point every
        // signed-in session passes through, so it is the practical place
        // to enforce it app-wide until/unless this also gets mirrored
        // into RLS for defense-in-depth on the API/service-role paths.
        if (data.account_status === 'suspended' || data.account_status === 'deleted') {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
          toast.error(
            data.account_status === 'suspended'
              ? 'Your account has been suspended. Contact support if you believe this is a mistake.'
              : 'This account has been deactivated.'
          )
          return null
        }
        setProfile(data)
        return data
      }
      // PGRST116 = no rows returned - auto-create profile for OAuth/magic-link users
      if (error?.code === 'PGRST116') {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const { data: newProfile } = await supabase.from('profiles').insert({
            id:        authUser.id,
            email:     authUser.email,
            full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
          }).select().single()
          if (newProfile) {
            setProfile(newProfile)
            return newProfile
          }
        }
      }
    } catch (err) {
      console.error('[AuthContext] fetchProfile error:', err)
    }
    return null
  }

  useEffect(() => {
    // ── Step 1: Check for an existing session on mount ─────────────────────
    // This runs once. We do NOT await it in a way that blocks the
    // onAuthStateChange listener from also running - they share the same
    // auth state and the listener is the source of truth for ongoing changes.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // If onAuthStateChange already fired (fast path), skip to avoid overwrite
      if (initialised.current) return

      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      }
      // Mark initialised and release the loading gate
      initialised.current = true
      setLoading(false)
    }).catch(() => {
      initialised.current = true
      setLoading(false)
    })

    // ── Step 2: Subscribe to ongoing auth changes ──────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }

        // Release loading gate on the very first event
        // (handles the case where onAuthStateChange fires before getSession resolves)
        if (!initialised.current) {
          initialised.current = true
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  const updateUserProfile = async (updates) => {
    if (!user) return { error: new Error('Not authenticated') }
    const { data, error } = await updateProfile(user.id, updates)
    if (data) setProfile(data)
    return { data, error }
  }

  const isAuthenticated        = !!user
  const hasCompletedOnboarding = !!profile?.onboarding_completed

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAuthenticated,
      hasCompletedOnboarding,
      refreshProfile,
      updateUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

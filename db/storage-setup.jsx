import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getProfile } from '@/lib/supabase'
import { identifyUser, resetUser } from '@/lib/posthog'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    -- Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    -- Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
          identifyUser(session.user.id, { email: session.user.email })
        } else {
          setProfile(null)
          resetUser()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId) => {
    const { data } = await getProfile(userId)
    setProfile(data)
    setLoading(false)
  }

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id)
  }

  const value = {
    user,
    profile,
    loading,
    refreshProfile,
    isAuthenticated: !!user,
    hasCompletedOnboarding: !!profile?.onboarding_completed,
    role: profile?.role || null,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { isStaff } from '@/lib/adminAccess'
import { useAuth } from '@/context/AuthContext'
import MfaGate from '@/components/Admin/MfaGate'
import { PageSkeleton } from '@/routes/shell'

// ─── Route guards ─────────────────────────────────────────────────────────────
// NOTE: these use PageSkeleton (small spinner), not LoadingScreen (the
// full-screen animated dark splash) -- loading here fires on EVERY
// navigation to a protected/admin/public-only route while AuthContext
// re-checks the session, which can be near-instant on a warm session.
// LoadingScreen showing here made ordinary navigation (e.g. opening
// /dashboard) feel like a slow, theatrical cold-boot every time. It's
// still used for the initial Suspense fallback on route chunks that
// haven't loaded yet at all (first visit to a given page), and for the
// admin-only areas below, where a heavier themed loader is less
// disruptive on a low-traffic, staff-only surface.
export const ProtectedRoute = ({ children, requireOnboarding = true }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />
  return children
}

export const AdminRoute = ({ children }) => {
  const { user, profile, loading } = useAuth()
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!user || profile) return undefined
    const t = setTimeout(() => setGaveUp(true), 6000)
    return () => clearTimeout(t)
  }, [user, profile])
  if (loading) return <PageSkeleton />
  // Don't reveal that an admin area exists to an unauthenticated visitor -
  // bounce home instead of to a discoverable /admin-login. Staff use the
  // obscure entry path directly (see /staff-gate-7f3k below).
  if (!user) return <Navigate to="/" replace />
  // Access follows the role in the database. A profile that is still being fetched after a fresh
  // sign-in is waited for (up to a few seconds) so staff are not bounced home for a moment.
  if (!profile && !gaveUp) return <PageSkeleton />
  if (!isStaff(profile?.role)) return <Navigate to="/" replace />
  // Every path that reaches this point is a staff or admin account -
  // gate all of them behind a second factor, enrolling on first arrival
  // if none exists yet. Ordinary users never render this component at all.
  return <MfaGate>{children}</MfaGate>
}

export const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (isAuthenticated) return <Navigate to={hasCompletedOnboarding ? '/browse' : '/onboarding'} replace />
  return children
}


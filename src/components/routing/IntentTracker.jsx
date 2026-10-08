import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { intentForPath, rememberIntent } from '@/lib/intent'

/**
 * Renders nothing. While a visitor is signed out, opening a page like
 * /providers or /list-rental is a clear signal of what they want, so we
 * remember it. If they sign up afterwards, onboarding skips the
 * "what are you here to do?" question. The most recent signal wins.
 */
export default function IntentTracker() {
  const { pathname } = useLocation()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (loading || isAuthenticated) return
    const hit = intentForPath(pathname)
    if (hit) rememberIntent(hit.intent, { kinds: hit.kinds })
  }, [pathname, isAuthenticated, loading])

  return null
}

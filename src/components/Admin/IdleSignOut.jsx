import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { idleState } from '@/lib/idleTimeout'

// Signs a staff member out after 20 minutes without activity, with a one-minute warning.
// Mounted inside AdminRoute, so it only ever runs for staff areas. The check uses timestamps, not
// a countdown timer, so a sleeping laptop or a throttled background tab still signs out on time.
const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove']

export default function IdleSignOut() {
  const last = useRef(Date.now())
  const [warning, setWarning] = useState(null) // seconds left, or null

  useEffect(() => {
    const touch = () => { last.current = Date.now(); setWarning(null) }
    // Mouse movement counts as activity, but is sampled at most once a second
    const onActivity = (e) => { if (e.type !== 'mousemove' || last.current + 1000 < Date.now()) touch() }
    EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }))

    const check = async () => {
      const r = idleState(last.current, Date.now())
      if (r.state === 'expired') {
        try { sessionStorage.setItem('dm-idle-signout', '1') } catch { /* fine */ }
        try { await supabase.auth.signOut() } catch { /* the session is gone either way */ }
        window.location.assign('/staff-gate-7f3k')
      } else {
        setWarning(r.state === 'warning' ? r.secondsLeft : null)
      }
    }
    const timer = setInterval(check, 5000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      EVENTS.forEach(ev => window.removeEventListener(ev, onActivity))
    }
  }, [])

  if (warning == null) return null
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Session about to end"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold"
      style={{ backgroundColor: 'var(--dm-deep)', color: '#fff' }}>
      You will be signed out in {warning} seconds because of inactivity. Click anywhere to stay signed in.
    </div>
  )
}

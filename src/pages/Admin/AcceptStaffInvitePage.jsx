import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { Shield } from 'lucide-react'

// Landing page for the link sent by /api/admin/staff-invite. Supabase's
// invite email establishes a temporary session automatically (the client is
// configured with detectSessionInUrl: true), so by the time this component
// mounts the invitee is authenticated as themselves - they just don't have
// a password yet and don't have their staff role yet. Both are set here,
// in that order: password first (updateUser), then role (accept_staff_invite,
// which looks up the invite by the caller's own verified email server-side -
// nothing the client sends can change which role comes back).
export default function AcceptStaffInvitePage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { setChecking(false); return }
      setEmail(session.user.email)
      setChecking(false)
    })
  }, [])

  const submit = async () => {
    if (password.length < 12) { toast.error('Password must be at least 12 characters'); return }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    setSubmitting(true)

    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setSubmitting(false); toast.error(pwErr.message || 'Could not set password'); return }

    const { error: acceptErr } = await supabase.rpc('accept_staff_invite')
    setSubmitting(false)
    if (acceptErr) {
      toast.error(acceptErr.message || 'Could not activate this invite')
      return
    }

    toast.success('Account activated - set up two-factor authentication to continue')
    navigate('/admin', { replace: true })
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#120D0B' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D4A853' }} />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#120D0B' }}>
        <div className="w-full max-w-sm rounded-3xl p-6 text-center space-y-2" style={{ backgroundColor: '#1E1510', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-white font-bold">This invite link has expired</h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Ask the superadmin to send a new invite, then open the fresh link from your email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#120D0B' }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ backgroundColor: '#1E1510', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(212,168,83,0.12)' }}>
            <Shield size={18} style={{ color: '#D4A853' }} />
          </div>
          <div>
            <h3 className="text-white font-bold">Set your password</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{email}</p>
          </div>
        </div>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Choose a password only you know. The superadmin who invited you cannot see it.
        </p>

        <input
          value={password} onChange={e => setPassword(e.target.value)} type="password"
          placeholder="New password (min 12 characters)"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        />
        <input
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password"
          placeholder="Confirm password"
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
        />

        <button
          onClick={submit} disabled={submitting}
          className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: '#D4A853', color: '#1A1210' }}
        >
          {submitting ? 'Activating...' : 'Activate account'}
        </button>

        <p className="text-[11px] text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          You'll be asked to set up two-factor authentication next - that step is required before you can reach the dashboard.
        </p>
      </div>
    </div>
  )
}

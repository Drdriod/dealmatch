import React, { useEffect, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    : null
}

// Self-service account deletion. Used in the app (Profile page) and on the
// public /delete-account page. Required by Google Play and the App Store.
export default function DeleteAccountPanel() {
  const [open, setOpen] = useState(false)
  const [blockers, setBlockers] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const headers = await authHeaders()
      if (!headers) return
      try {
        const r = await fetch('/api/platform?resource=delete-account', { headers })
        const j = await r.json()
        if (alive) setBlockers(r.ok ? (j.blockers || []) : [])
      } catch { if (alive) setBlockers([]) }
    })()
    return () => { alive = false }
  }, [open])

  const handleDelete = async () => {
    const headers = await authHeaders()
    if (!headers) return toast.error('Please sign in again')
    setBusy(true)
    try {
      const r = await fetch('/api/platform?resource=delete-account', {
        method: 'POST', headers, body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* session is banned anyway */ }
        toast.success('Your account has been deleted')
        window.location.href = '/'
        return
      }
      if (j.blockers) setBlockers(j.blockers)
      toast.error(j.error || 'Could not delete your account')
    } catch {
      toast.error('Network error. Please try again.')
    } finally { setBusy(false) }
  }

  const blocked = blockers && blockers.length > 0

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold border transition-all"
        style={{ borderColor: 'rgba(200,40,40,0.35)', color: '#B42318', backgroundColor: 'rgba(200,40,40,0.04)' }}>
        <Trash2 size={15} /> Delete my account
      </button>
    )
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'rgba(200,40,40,0.35)', backgroundColor: '#FFF6F5' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: '#B42318' }}>
        <AlertTriangle size={16} /><span className="font-bold text-sm">Delete your account</span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#5C4F49' }}>
        This permanently removes your name, email, phone, photo, bio, ID documents and bank details
        and signs you out everywhere. You will not be able to log in again. Records of completed payments
        are kept without your personal details, as required for accounting and dispute handling.
      </p>
      {blockers === null && <p className="text-xs" style={{ color: '#647068' }}>Checking your account…</p>}
      {blocked && (
        <div className="rounded-xl p-3 mb-3 text-xs" style={{ backgroundColor: '#FFE9E6', color: '#7A271A' }}>
          <p className="font-bold mb-1">You can't delete your account yet:</p>
          <ul className="list-disc pl-4 space-y-0.5">{blockers.map(b => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {blockers && !blocked && (
        <>
          <label className="text-xs font-semibold block mb-1" style={{ color: '#17211B' }}>
            Type DELETE to confirm
          </label>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border text-sm mb-3" style={{ borderColor: '#E5D9D2' }}
            autoCapitalize="characters" autoComplete="off" />
          <button onClick={handleDelete} disabled={busy || confirmText !== 'DELETE'}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: '#B42318' }}>
            {busy ? 'Deleting…' : 'Permanently delete my account'}
          </button>
        </>
      )}
      <button onClick={() => { setOpen(false); setConfirmText('') }}
        className="w-full mt-2 py-2 text-xs font-semibold" style={{ color: '#647068' }}>Cancel</button>
    </div>
  )
}

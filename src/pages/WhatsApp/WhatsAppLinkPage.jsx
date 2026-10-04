/**
 * WhatsAppLinkPage - /wa/link?t=<token>
 * ═════════════════════════════════════
 * Landing page for the "Verify on DealMatch" button sent in WhatsApp.
 *
 * What happens here:
 *   1. The single-use token from the link is kept briefly in this browser
 *      (so it survives sign-in / sign-up / onboarding) and removed from the URL.
 *   2. Signed-out visitors are sent to sign in or create an account.
 *   3. Once signed in, the token is claimed server-side: the WhatsApp number
 *      behind it is bound to THIS account. The server checks the token is
 *      unused, unexpired, and meant for an unrestricted account.
 *   4. If identity is not yet approved, the person continues to
 *      /verify-identity. Fully verified people are told they are done.
 *
 * The token proves control of the WhatsApp chat at the moment the link was
 * requested. It is never an identity check by itself; identity verification
 * on the account is what unlocks contacting providers.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldCheck, CheckCircle2, AlertTriangle, MessageCircle, LogIn, UserPlus, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export const WA_LINK_STORAGE_KEY = 'dm_wa_link_token'
const TOKEN_TTL_MS = 25 * 60 * 1000
const WA_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '2347057392060'

const readStored = () => {
  try {
    const v = JSON.parse(localStorage.getItem(WA_LINK_STORAGE_KEY) || 'null')
    if (v?.t && v.exp > Date.now()) return v.t
    localStorage.removeItem(WA_LINK_STORAGE_KEY)
  } catch { /* storage unavailable */ }
  return null
}
const storeToken = t => {
  try { localStorage.setItem(WA_LINK_STORAGE_KEY, JSON.stringify({ t, exp: Date.now() + TOKEN_TTL_MS })) } catch { /* ignore */ }
}
const clearToken = () => { try { localStorage.removeItem(WA_LINK_STORAGE_KEY) } catch { /* ignore */ } }

const ERRORS = {
  invalid_or_expired:      'This link has expired or was already used. Links work once and for 20 minutes.',
  contact_unavailable:     'This WhatsApp chat is not available for linking right now.',
  no_profile:              'We could not find your account profile. Please sign out, sign in again, and retry.',
  number_linked_elsewhere: 'This WhatsApp number is already linked to a different DealMatch account.',
  profile_already_linked:  'Your DealMatch account is already linked to a different WhatsApp number. Contact support to change it.',
  account_restricted:      'Your account needs attention before it can be linked. Please contact DealMatch support.',
  default:                 'Something went wrong while linking. Please try again.',
}

export default function WhatsAppLinkPage() {
  const { isAuthenticated, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const [token] = useState(() => params.get('t') || readStored())
  const [phase, setPhase] = useState('checking')   // checking | needs_auth | linking | done | error
  const [result, setResult] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const started = useRef(false)

  // Keep the token for sign-in, but never leave it sitting in the address bar.
  useEffect(() => {
    if (params.get('t')) {
      storeToken(params.get('t'))
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    if (!token) { setPhase('error'); setErrorCode('invalid_or_expired'); return }
    if (loading) return
    if (!isAuthenticated) { setPhase('needs_auth'); return }
    if (started.current) return
    started.current = true

    ;(async () => {
      setPhase('linking')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setPhase('needs_auth'); started.current = false; return }
        const resp = await fetch('/api/send-whatsapp?action=claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token }),
        })
        const data = await resp.json().catch(() => ({}))
        if (resp.ok && data.ok) {
          clearToken()
          setResult(data)
          setPhase('done')
        } else {
          if (resp.status !== 429) clearToken()
          setErrorCode(data.error || 'default')
          setPhase('error')
        }
      } catch {
        setErrorCode('default')
        setPhase('error')
      }
    })()
  }, [token, loading, isAuthenticated])

  const waUrl = `https://wa.me/${WA_NUMBER}`

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8 text-deep" aria-hidden="true">
          <span className="w-11 h-11 rounded-full bg-sage/20 flex items-center justify-center"><MessageCircle size={20} /></span>
          <span className="h-px w-10 bg-gold" />
          <span className="w-11 h-11 rounded-full bg-deep flex items-center justify-center text-gold"><ShieldCheck size={20} /></span>
        </div>

        <div className="bg-white rounded-3xl border border-blush/70 shadow-sm p-7 sm:p-8 text-center">
          {(phase === 'checking' || phase === 'linking') && (
            <>
              <Loader2 className="mx-auto mb-4 animate-spin text-gold" size={28} />
              <h1 className="font-display text-2xl text-deep mb-2">Linking your WhatsApp</h1>
              <p className="font-body text-sm text-warm">One moment while we connect this chat to your account.</p>
            </>
          )}

          {phase === 'needs_auth' && (
            <>
              <h1 className="font-display text-2xl text-deep mb-2">Your chat is waiting</h1>
              <p className="font-body text-sm text-warm mb-6">
                Sign in or create your DealMatch account to link this WhatsApp chat. After that you verify your identity once, and you will never be asked again.
              </p>
              <div className="space-y-3">
                <Link to="/auth" className="flex items-center justify-center gap-2 w-full rounded-full bg-deep text-cream font-body font-medium py-3.5 hover:opacity-90 transition">
                  <LogIn size={16} /> I have an account
                </Link>
                <Link to="/auth?tab=signup" className="flex items-center justify-center gap-2 w-full rounded-full border border-deep/20 text-deep font-body font-medium py-3.5 hover:bg-cream transition">
                  <UserPlus size={16} /> Create an account
                </Link>
              </div>
              <p className="font-body text-xs text-warm mt-5">This link works once and expires 20 minutes after it was sent.</p>
            </>
          )}

          {phase === 'done' && result && (
            <>
              <CheckCircle2 className="mx-auto mb-4 text-sage" size={36} />
              <h1 className="font-display text-2xl text-deep mb-2">
                {result.tier === 'verified' ? 'You are verified' : 'WhatsApp linked'}
              </h1>
              <p className="font-body text-sm text-warm mb-6">
                {result.tier === 'verified'
                  ? `The chat ${result.waMasked} is now linked to your verified account. You can contact providers straight from WhatsApp.`
                  : `The chat ${result.waMasked} is now linked to your account. One last step: verify your identity so you can contact providers.`}
              </p>
              <div className="space-y-3">
                {result.tier !== 'verified' && (
                  <Link to="/verify-identity" className="flex items-center justify-center gap-2 w-full rounded-full bg-deep text-cream font-body font-medium py-3.5 hover:opacity-90 transition">
                    Verify my identity <ArrowRight size={16} />
                  </Link>
                )}
                <a href={waUrl} className="flex items-center justify-center gap-2 w-full rounded-full border border-deep/20 text-deep font-body font-medium py-3.5 hover:bg-cream transition">
                  <MessageCircle size={16} /> Back to WhatsApp
                </a>
              </div>
            </>
          )}

          {phase === 'error' && (
            <>
              <AlertTriangle className="mx-auto mb-4 text-terracotta" size={32} />
              <h1 className="font-display text-2xl text-deep mb-2">We could not link this chat</h1>
              <p className="font-body text-sm text-warm mb-6">{ERRORS[errorCode] || ERRORS.default}</p>
              <a href={waUrl} className="flex items-center justify-center gap-2 w-full rounded-full bg-deep text-cream font-body font-medium py-3.5 hover:opacity-90 transition">
                <MessageCircle size={16} /> Back to WhatsApp
              </a>
              <p className="font-body text-xs text-warm mt-4">Send VERIFY in the chat to get a fresh link.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

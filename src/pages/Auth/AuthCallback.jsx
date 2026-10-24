import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { fetchOnboardingState, upsertProfile } from '@/data/profileRepository'
import { applyReferralCode } from '@/data/referralRepository'
import { Check, Home } from 'lucide-react'
import toast from 'react-hot-toast'


// Links a brand-new account to the referral code kept from the signup page. The server decides
// (new account, no referrer yet, valid code); a refusal is silent and never blocks sign-in.
async function linkReferral() {
  const code = (sessionStorage.getItem('dm_ref') || '').trim()
  if (!code) return
  try { await applyReferralCode(code) } catch { /* ignore */ }
  sessionStorage.removeItem('dm_ref')
}

export default function AuthCallback() {
  const navigate  = useNavigate()
  const ranOnce   = useRef(false)   // prevent React StrictMode double-invoke

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    const handleCallback = async () => {
      try {
        // ── PKCE flow: the URL contains a `code` query param that must be
        // exchanged for a session.  With flowType:'pkce', getSession() returns
        // null at this point because the code hasn't been exchanged yet.
        // We must use exchangeCodeForSession() to complete the flow.
        const urlParams = new URLSearchParams(window.location.search)
        const code      = urlParams.get('code')

        let session = null

        if (code) {
          // OAuth / magic-link PKCE exchange
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('[AuthCallback] PKCE exchange failed:', exchangeError.message)
            navigate('/auth?error=auth_callback_failed', { replace: true })
            return
          }
          session = data?.session
        } else {
          // Fallback: check for an existing session (e.g. email OTP links)
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) {
            console.error('[AuthCallback] getSession failed:', sessionError.message)
            navigate('/auth?error=auth_callback_failed', { replace: true })
            return
          }
          session = data?.session
        }

        if (!session) {
          // No code and no session - redirect back to auth
          navigate('/auth?error=no_session', { replace: true })
          return
        }

        const user = session.user

        // ── Check / create profile ────────────────────────────────────────
        const { data: profile, error: profileError } = await fetchOnboardingState(user.id)   // null row, no throw, on 0 rows

        if (profileError) {
          console.error('[AuthCallback] Profile fetch error:', profileError.message)
          // Non-fatal: send to onboarding so the profile gets created there
          navigate('/onboarding', { replace: true })
          return
        }

        if (profile) await linkReferral()

        if (!profile) {
          // Brand-new OAuth / magic-link user - bootstrap a profile
          const { error: upsertError } = await upsertProfile({
            id:          user.id,
            email:       user.email,
            full_name:   user.user_metadata?.full_name || user.user_metadata?.name || '',
            avatar_url:  user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
            onboarding_completed: false,
            updated_at:  new Date().toISOString(),
          })

          if (upsertError) {
            console.error('[AuthCallback] Profile upsert error:', upsertError.message)
            navigate('/auth?error=profile_creation_failed', { replace: true })
            return
          }
          await linkReferral()
          toast.success('Account created! Welcome to DealMatch.')
          navigate('/onboarding', { replace: true })
          return
        }

        if (!profile.onboarding_completed) {
          navigate('/onboarding', { replace: true })
          return
        }

        toast.success(`Welcome back${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}!`)
        navigate('/browse', { replace: true })

      } catch (err) {
        console.error('[AuthCallback] Unexpected error:', err)
        navigate('/auth?error=unexpected', { replace: true })
      }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:'#FFFAF5'}}>
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div className="flex justify-center"><Home size={48} className="text-terracotta animate-bounce" /></div>
        <p className="font-display text-xl font-black" style={{color:'#17211B'}}>
          Setting up your account...
        </p>
        <p className="text-sm" style={{color:'#647068'}}>
          Just a moment while we get everything ready for you.
        </p>
        <div className="flex gap-1.5 mt-2">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full animate-pulse"
              style={{backgroundColor:'#C85F2D', animationDelay:`${i*0.15}s`}} />
          ))}
        </div>
      </div>
    </div>
  )
}

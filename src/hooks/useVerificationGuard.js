/**
 * useVerificationGuard
 * ════════════════════
 * Controls access to transaction-gated actions.
 *
 * WHAT REQUIRES VERIFICATION:
 *   sell, buy, list_rental, escrow, tenancy, mortgage_apply
 *
 * WHAT DOES NOT REQUIRE VERIFICATION (free to all):
 *   shortlet, hotel, browse, professionals, student hostels
 *
 * SKIP POLICY:
 *   If profile.verification_skipped = true AND action is gated,
 *   user is redirected to /verify-identity with returnTo state
 *   so after verifying they land back where they were.
 *
 * STUDENT CONFLICT RESOLUTION:
 *   Student verification (is_student_verified) is a SEPARATE system.
 *   A student who also wants to buy/sell uses BOTH flows independently.
 *   This guard only checks identity_verification_status / is_photo_verified.
 */
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

// Actions that require full identity verification
const GATED_ACTIONS = new Set([
  'sell', 'buy', 'list_rental', 'list_hostel', 'list_service',
  'escrow', 'tenancy', 'mortgage_apply', 'deal_agreement',
])

// Human-readable labels for toast messages
const ACTION_LABELS = {
  sell:            'list a property for sale',
  buy:             'express interest in buying',
  list_rental:     'list a rental property',
  list_hostel:     'list a student hostel',
  list_service:    'offer your services',
  escrow:          'make a protection payment',
  tenancy:         'sign a tenancy agreement',
  mortgage_apply:  'apply for a mortgage',
  deal_agreement:  'sign a deal agreement',
}

// Actions that are completely free - no verification, no login required
const FREE_ACTIONS = new Set([
  'hotel', 'shortlet', 'browse', 'professionals', 'student_hostels',
])

export function useVerificationGuard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * requireVerification(action)
   * ─────────────────────────────
   * Call before any gated action. Returns true if allowed, false if blocked.
   * On block: shows toast + redirects to /verify-identity with returnTo state.
   */
  const requireVerification = async (action) => {
    // Free actions - always allowed
    if (FREE_ACTIONS.has(action)) return true

    // Must be logged in for any gated action
    if (!user) {
      navigate('/auth', { state: { returnTo: location.pathname } })
      return false
    }

    // Not a gated action - allow
    if (!GATED_ACTIONS.has(action)) return true

    // Fetch fresh profile from DB (never trust cached for transactions)
    const { data: fresh } = await supabase
      .from('profiles')
      .select('identity_verification_status, is_photo_verified, is_live_verified, verification_skipped, role')
      .eq('id', user.id)
      .single()

    const status   = fresh?.identity_verification_status
    const verified = fresh?.is_photo_verified && fresh?.is_live_verified
    const label    = ACTION_LABELS[action] || 'complete this action'

    // Fully verified - allow
    if (verified || status === 'approved') return true

    // Submitted but pending - let them know, block action
    if (status === 'submitted') {
      toast('Your identity is under review (24hrs). You\'ll be able to ' + label + ' once approved.', {
        icon: '⏳', duration: 5000,
      })
      return false
    }

    // Not verified - redirect to verify-identity page with return path
    toast.error('🔒 Verify your identity to ' + label, { duration: 4000 })
    navigate('/verify-identity', {
      state: { returnTo: location.pathname },
      replace: false,
    })
    return false
  }

  /**
   * isVerified()
   * ─────────────
   * Quick sync check using cached profile - for UI rendering decisions
   * (e.g. showing lock icons, greying out buttons). Don't use for security.
   */
  const isVerified = () => {
    return !!(profile?.is_photo_verified && profile?.is_live_verified)
      || profile?.identity_verification_status === 'approved'
  }

  /**
   * isPending()
   * ───────────
   * Returns true if verification is submitted and awaiting review.
   */
  const isPending = () => profile?.identity_verification_status === 'submitted'

  /**
   * hasSkipped()
   * ────────────
   * Returns true if user clicked "skip for now".
   */
  const hasSkipped = () => !!profile?.verification_skipped

  return { requireVerification, isVerified, isPending, hasSkipped }
}

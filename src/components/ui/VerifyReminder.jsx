import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

/**
 * Soft, non-blocking nudge to verify identity. Verification is optional
 * after onboarding; this only reminds people it will be needed before a
 * booking, payment or agreement. Renders nothing once verified.
 *
 * <VerifyReminder returnTo="/landlord" />
 */
export default function VerifyReminder({ returnTo, className = '' }) {
  const { profile } = useAuth()
  const status = profile?.identity_verification_status
  const verified = status === 'approved' || (profile?.is_photo_verified && profile?.is_live_verified)
  if (!profile || verified) return null

  if (status === 'submitted') {
    return (
      <div className={`flex items-start gap-3 rounded-2xl p-4 text-left ${className}`}
        style={{ backgroundColor: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.35)' }}>
        <Clock size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#B8892B' }} />
        <p className="text-xs leading-relaxed" style={{ color: '#17211B' }}>
          <span className="font-bold">Identity under review.</span> This usually takes up to 24 hours.
        </p>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 rounded-2xl p-4 text-left ${className}`}
      style={{ backgroundColor: 'rgba(35,76,58,0.07)', border: '1px solid rgba(35,76,58,0.2)' }}>
      <ShieldCheck size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#234C3A' }} />
      <div className="flex-1">
        <p className="text-xs leading-relaxed" style={{ color: '#17211B' }}>
          <span className="font-bold">Verify your identity (about 2 minutes).</span> It is optional for now, and required before any booking, payment or agreement.
        </p>
        <Link to="/verify-identity" state={returnTo ? { returnTo } : undefined}
          className="inline-block mt-2 text-xs font-bold underline" style={{ color: '#C85F2D' }}>
          Verify now
        </Link>
      </div>
    </div>
  )
}

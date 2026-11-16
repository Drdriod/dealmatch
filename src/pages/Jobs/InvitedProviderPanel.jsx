import React from 'react'
import { Lock, User } from 'lucide-react'

// Locked-preview panel - mirrors the "phone hidden until you pay"
// pattern from the reference design. Only ever shows a real
// invited provider (from a /providers "Request Bid" tap); with
// no invite, it shows the honest generic state instead of a
// fabricated name.
export default function InvitedProviderPanel({ invitedProvider }) {
  return (
    <div className="hidden md:block rounded-3xl overflow-hidden mt-1"
      style={{ backgroundColor: '#1C1410' }}>
      <div className="h-44 relative flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(200,95,45,0.35), rgba(28,20,16,0.9))' }}>
        {invitedProvider?.avatar_url
          ? <img src={invitedProvider.avatar_url} alt="" className="w-full h-full object-cover absolute inset-0" />
          : <User size={40} style={{ color: 'rgba(255,255,255,0.6)' }} />}
      </div>
      <div className="p-5">
        <p className="font-display font-bold text-white text-base mb-1">
          {invitedProvider
            ? `${invitedProvider.full_name?.split(' ')[0] || 'Provider'}${invitedProvider.city ? ` · ${invitedProvider.city}` : ''}`
            : 'DealMatch finds the nearest verified person'}
        </p>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <Lock size={11} className="inline mr-1 -mt-0.5" />
          Phone hidden until protection is confirmed
        </p>
        <div className="w-full py-3 rounded-full text-xs font-bold text-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          Unlocks after you post
        </div>
      </div>
    </div>
  )
}

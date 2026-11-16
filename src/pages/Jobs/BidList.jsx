import React from 'react'
import { Check, ShieldCheck, User } from 'lucide-react'

// The offers on an open "let providers bid" job, with Accept and Counter on each.
export default function BidList({ bids, onAccept, onCounter }) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-black text-base" style={{ color: 'var(--dm-deep)' }}>Bids coming in</h3>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: 'var(--dm-terracotta)' }}>
          {bids.length} {bids.length === 1 ? 'bid' : 'bids'}
        </span>
      </div>

      {bids.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'rgba(23,33,27,0.7)' }}>Waiting for the first bid...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {bids.map(b => (
            <div key={b.id} className="rounded-2xl p-3 border flex items-center gap-3"
              style={{ backgroundColor: 'white', borderColor: b.status === 'ACCEPTED' ? 'var(--dm-sage)' : 'var(--dm-line)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                {b.providerProfile?.avatar_url
                  ? <img src={b.providerProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <User size={16} style={{ color: 'var(--dm-terracotta)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--dm-deep)' }}>{b.providerProfile?.full_name || 'Provider'}</p>
                {b.attributes?.eta_minutes && (
                  <p className="text-[11px]" style={{ color: 'var(--dm-warm)' }}>Can start today · {b.attributes.eta_minutes}m ETA</p>
                )}
              </div>
              <p className="font-black text-sm flex-shrink-0" style={{ color: 'var(--dm-deep)' }}>
                ₦{(b.amount_cents / 100).toLocaleString()}
              </p>
              {b.status === 'ACCEPTED' ? (
                <span className="flex items-center gap-1 text-[11px] font-bold flex-shrink-0" style={{ color: 'var(--dm-moss)' }}>
                  <Check size={12} /> Accepted
                </span>
              ) : b.status === 'DECLINED' ? (
                <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(23,33,27,0.7)' }}>Declined</span>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => onAccept(b)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: 'var(--dm-sage)' }}>
                    Accept
                  </button>
                  <button onClick={() => onCounter(b)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border"
                    style={{ borderColor: 'var(--dm-line)', color: 'var(--dm-bark)' }}>
                    Counter
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl p-3 flex items-center gap-2"
        style={{ backgroundColor: 'rgba(122,158,126,0.08)', border: '1px solid rgba(122,158,126,0.2)' }}>
        <ShieldCheck size={16} style={{ color: 'var(--dm-moss)' }} />
        <p className="text-[11px]" style={{ color: 'var(--dm-moss)' }}>
          Payment is protected. Providers are paid only after you confirm the job is done.
        </p>
      </div>
    </>
  )
}

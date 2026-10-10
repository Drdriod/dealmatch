import React, { useState } from 'react'
import { Shield, ShieldCheck, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { initializePaystackPayment, generateReference, formatNaira } from '@/lib/paystack'
import toast from 'react-hot-toast'

/**
 * <PropertyReserveModal property={property} onClose={...} onFunded={...} />
 *
 * The property-scoped "Reserve" flow the handoff spec calls for (section
 * 6.1): pay into escrow, contact unlocks only once the payment is
 * confirmed. This is the piece that was missing end-to-end - the generic
 * /escrow page took payment via Paystack but never created an
 * escrow_transactions row first, so the webhook had nothing to confirm and
 * contact could never legitimately unlock (see
 * supabase/migrations/20260812000000_production_hardening.sql for the
 * start_property_escrow_payment RPC this now calls).
 *
 * Flow: amount + move-in date -> generate a reference -> write the pending
 * escrow row server-side via the RPC (this is what makes the webhook's
 * payment_ref lookup succeed) -> open Paystack with that same reference ->
 * on success, poll briefly for the webhook to flip status to 'funded',
 * then call onFunded() so the caller can refresh the contact-unlock state.
 */
export default function PropertyReserveModal({ property, onClose, onFunded }) {
  const { user, profile } = useAuth()
  const { requireVerification } = useVerificationGuard()
  const [amount, setAmount]     = useState(property?.price ? String(property.price) : '')
  const [moveInDate, setMoveInDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  const gross = Number(amount) || 0
  const feePerParty = gross ? Math.round(gross * 0.0375) : 0
  const youPay = gross // tenant pays the listed amount; DealMatch's cut comes from both sides at settlement, matching EscrowPage's existing 3.75%+3.75% model

  const pollForFunded = async (escrowId, attempts = 0) => {
    if (attempts > 10) { setConfirming(false); toast('Payment received - confirming with our team, this can take a few minutes.'); setDone(true); return }
    const { data } = await supabase.from('escrow_transactions').select('status').eq('id', escrowId).single()
    if (data?.status === 'confirmed' || data?.status === 'funded') {
      setConfirming(false)
      setDone(true)
      toast.success('Protection funded - contact unlocked!')
      onFunded?.()
      return
    }
    setTimeout(() => pollForFunded(escrowId, attempts + 1), 2000)
  }

  const handleReserve = async () => {
    if (!user) { toast.error('Please sign in to continue'); return }
    if (!gross || gross <= 0) { toast.error('Enter a valid amount'); return }
    // Money is about to move: identity must be verified first.
    if (!(await requireVerification('escrow'))) return
    const email = user.email || `${user.id}@guest.dealmatch.com.ng`

    setSubmitting(true)
    const reference = generateReference()

    // Write the escrow row FIRST, server-side, authoritatively - this is
    // what the Paystack webhook resolves by payment_ref. Without this
    // step the payment would succeed but never be reflected as escrow.
    const { data: escrowRow, error: rpcError } = await supabase.rpc('start_property_escrow_payment', {
      p_property_id:      property.id,
      p_reference:         reference,
      p_transaction_type:  property.listing_type === 'sale' ? 'sale' : 'rental',
      p_gross_amount:      gross,
      p_tenant_name:       profile?.full_name || user.user_metadata?.full_name || 'DealMatch user',
      p_tenant_phone:      profile?.phone || '',
      p_move_in_date:      moveInDate || null,
    })

    if (rpcError || !escrowRow) {
      setSubmitting(false)
      toast.error(rpcError?.message || 'Could not start protection payment. Try again.')
      return
    }

    await initializePaystackPayment({
      email,
      amount: gross,
      reference,
      metadata: {
        type: 'escrow_payment',
        escrow_id: escrowRow.id,
        property_id: property.id,
        property_title: property.title,
      },
      onSuccess: () => {
        setSubmitting(false)
        setConfirming(true)
        pollForFunded(escrowRow.id)
      },
      onClose: () => {
        setSubmitting(false)
        toast('Payment cancelled - your reservation was not completed.')
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(23,33,27,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden flex flex-col" style={{ backgroundColor: '#FFFAF5', maxHeight: '92vh' }}>
        <div className="p-5 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: '#DEDDD6' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(122,158,126,0.15)' }}>
              <Shield size={18} style={{ color: '#7A9E7E' }} />
            </div>
            <div>
              <h3 className="font-display text-lg font-black" style={{ color: '#17211B' }}>Reserve this property</h3>
              <p className="text-xs" style={{ color: '#647068' }}>Held safely under DealMatch Protection</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(23,33,27,0.08)' }}>
            <X size={14} style={{ color: '#5C4A3A' }} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4"><ShieldCheck size={48} className="text-terracotta" /></div>
            <h4 className="font-display font-black text-xl mb-2" style={{ color: '#17211B' }}>Protection funded!</h4>
            <p className="text-sm leading-relaxed mb-6" style={{ color: '#647068' }}>
              Your payment is held safely. The owner's contact details are now unlocked below.
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3">Done</button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            <div className="rounded-2xl p-3 border" style={{ backgroundColor: '#FFF', borderColor: '#DEDDD6' }}>
              <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{property?.title}</p>
              <p className="text-xs" style={{ color: '#647068' }}>{property?.city}, {property?.state}</p>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(23,33,27,0.5)' }}>Amount (₦)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
            </div>

            {property?.listing_type !== 'sale' && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'rgba(23,33,27,0.5)' }}>Preferred move-in date</label>
                <input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6', color: '#17211B' }} />
              </div>
            )}

            <div className="rounded-2xl p-3 text-xs leading-relaxed" style={{ backgroundColor: 'rgba(122,158,126,0.1)', color: '#3E5A42' }}>
              Owner contact unlocks automatically once your payment is confirmed. DealMatch holds funds until move-in is confirmed by both sides.
              {feePerParty > 0 && <> A 3.75% facilitation fee (₦{feePerParty.toLocaleString()}) applies to each side.</>}
            </div>

            <button onClick={handleReserve} disabled={submitting || confirming}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#C85F2D' }}>
              {submitting || confirming
                ? <><Loader2 size={16} className="animate-spin" /> {confirming ? 'Confirming payment…' : 'Starting…'}</>
                : `Pay ${formatNaira(youPay)} for protection`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

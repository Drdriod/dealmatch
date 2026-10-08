import React, { useState, useEffect } from 'react'
import { Lock, Phone, Coins, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { buyUnlockCredits, UNLOCK_CREDIT_PACKS } from '@/lib/paystack'
import toast from 'react-hot-toast'

/**
 * Optional-payment contact unlock (item 2 of the fix request). Sits
 * alongside the existing full-escrow unlock path, not instead of it: a
 * person who just wants to talk to a landlord/provider before committing
 * to anything can spend a small prepaid credit instead of funding a full
 * transaction. Works for both "places" (properties) and "people"
 * (providers) - targetType is 'property' | 'provider'.
 *
 * Enforcement lives entirely server-side (item 3/6): a credit is only
 * ever granted after Paystack confirms payment (see the webhook's
 * 'contact_unlock_credits' case), and spend_unlock_credit()/
 * get_property_contact()/get_provider_contact() are all SECURITY DEFINER
 * functions a client cannot bypass - this component just calls them.
 */
export default function UnlockContactButton({ targetType, targetId, onUnlocked }) {
  const { user } = useAuth()
  const { requireVerification } = useVerificationGuard()
  const [balance, setBalance] = useState(null)
  const [contact, setContact] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPacks, setShowPacks] = useState(false)

  useEffect(() => { if (user) { loadBalance(); checkExisting() } }, [user, targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBalance() {
    const { data } = await supabase.rpc('get_unlock_credit_balance')
    setBalance(typeof data === 'number' ? data : 0)
  }

  async function checkExisting() {
    const fn = targetType === 'property' ? 'get_property_contact' : 'get_provider_contact'
    const arg = targetType === 'property' ? { p_property_id: targetId } : { p_provider_id: targetId }
    const { data } = await supabase.rpc(fn, arg)
    const row = Array.isArray(data) ? data[0] : data
    if (row?.phone) { setContact(row); onUnlocked?.(row) }
  }

  async function handleUnlock() {
    if (!user) { toast.error('Sign in to unlock contact details'); return }
    // Spending or buying credits is a transaction: verify first.
    if (!(await requireVerification('unlock_contact'))) return
    if (!balance) { setShowPacks(true); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('spend_unlock_credit', { p_target_type: targetType, p_target_id: String(targetId) })
      if (error) throw error
      await checkExisting()
      await loadBalance()
      toast.success('Contact unlocked')
    } catch (err) {
      toast.error(err.message || 'Could not unlock right now')
    } finally {
      setBusy(false)
    }
  }

  async function handleBuy(pack) {
    setBusy(true)
    await buyUnlockCredits({
      pack,
      userId: user.id,
      email: user.email,
      onSuccess: async () => {
        toast.success(`${pack.credits} unlock credit${pack.credits > 1 ? 's' : ''} added`)
        setShowPacks(false)
        await loadBalance()
        setBusy(false)
      },
      onClose: () => setBusy(false),
    })
  }

  if (contact?.phone) {
    return (
      <a href={`tel:${contact.phone}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
        style={{ backgroundColor: 'rgba(122,158,126,0.15)', color: '#4F7A54' }}>
        <Phone size={14} /> {contact.phone}
      </a>
    )
  }

  return (
    <>
      <button onClick={handleUnlock} disabled={busy}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
        style={{ backgroundColor: '#17211B', color: '#FFF' }}>
        <Lock size={14} />
        {balance > 0 ? `Unlock contact (${balance} credit${balance !== 1 ? 's' : ''} left)` : 'Unlock contact'}
      </button>

      {showPacks && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl p-5 w-full max-w-sm" style={{ backgroundColor: '#FFF' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-display font-black text-lg" style={{ color: '#17211B' }}>Unlock contact details</p>
              <button onClick={() => setShowPacks(false)}><X size={18} style={{ color: '#647068' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: '#647068' }}>
              Buy credits to see phone numbers without going through full escrow. One credit unlocks one contact, and it's yours for good.
            </p>
            <div className="space-y-2">
              {UNLOCK_CREDIT_PACKS.map(pack => (
                <button key={pack.credits} onClick={() => handleBuy(pack)} disabled={busy}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border disabled:opacity-50"
                  style={{ borderColor: pack.badge ? '#C85F2D' : '#DEDDD6', backgroundColor: pack.badge ? 'rgba(200,95,45,0.06)' : '#FFF' }}>
                  <div className="flex items-center gap-2">
                    <Coins size={16} style={{ color: '#C85F2D' }} />
                    <div className="text-left">
                      <p className="text-sm font-bold" style={{ color: '#17211B' }}>{pack.label}</p>
                      {pack.badge && <p className="text-[10px] font-bold" style={{ color: '#C85F2D' }}>{pack.badge}</p>}
                    </div>
                  </div>
                  <p className="text-sm font-black" style={{ color: '#17211B' }}>{'\u20a6'}{pack.price.toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

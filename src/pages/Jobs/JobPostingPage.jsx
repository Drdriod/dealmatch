import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Gavel, Lock, MapPin, ShieldCheck, User, Wallet, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { emitEvent } from '@/lib/events'
import { fundTransactionEscrow, formatNaira, generateReference } from '@/lib/paystack'
import GuestAuthModal from '@/components/ui/GuestAuthModal'
import toast from 'react-hot-toast'

const MODEL_BY_TOGGLE = {
  book: 'NEAREST_AVAILABLE',       // "I need someone now" -- ADR-009, build now, first
  bid:  'MULTI_ATTRIBUTE_REVERSE', // "Let providers bid"   -- ADR-009, build now, second
}

const STATUS_LABEL = {
  OPEN:      'Open',
  PENDING:   'Awaiting protection payment',
  FUNDED:    'Protection funded',
  COMPLETED: 'Completed',
  DISPUTED:  'Disputed',
  CANCELLED: 'Cancelled',
}

export default function JobPostingPage() {
  const navigate = useNavigate()
  const { user }   = useAuth()
  const { id: routeId } = useParams()   // present when visiting /jobs/:id (an existing transaction)
  const [params]   = useSearchParams()

  const [toggle, setToggle] = useState(params.get('mode') === 'bid' ? 'bid' : 'book')
  const invitedProviderId = params.get('provider') || null
  const [invitedProvider, setInvitedProvider] = useState(null)

  const [description, setDescription] = useState('')
  // Launch city is Uyo - pre-fill rather than defaulting to Lagos, which is
  // what the field's old placeholder implied to a first-time visitor.
  const [location, setLocation]       = useState('Uyo, Akwa Ibom')
  const [budget, setBudget]           = useState('')
  const [posting, setPosting]         = useState(false)

  const [transaction, setTransaction] = useState(null)
  const [bids, setBids]               = useState([])
  const [loadingExisting, setLoadingExisting] = useState(!!routeId)
  const [fundingEscrow, setFundingEscrow]     = useState(false)
  const [completing, setCompleting]           = useState(false)
  const [cancelling, setCancelling]           = useState(false)
  const [showGuestAuth, setShowGuestAuth]     = useState(false) // guest checkout: phone-OTP instead of full /auth

  // Load an existing transaction when visiting /jobs/:id -- this is the
  // route every notification link (escrow.funded, bid.accepted, etc.)
  // already pointed to, but nothing loaded it before this.
  useEffect(() => {
    if (!routeId) return
    let cancelled = false
    supabase.from('transactions').select('*').eq('id', routeId).single().then(({ data }) => {
      if (cancelled) return
      setTransaction(data || null)
      setLoadingExisting(false)
    })
    return () => { cancelled = true }
  }, [routeId])

  // Preview panel data - only ever real data. If nobody was invited from
  // a /providers card, the panel shows the generic "we search for you"
  // state instead of guessing a name.
  useEffect(() => {
    if (!invitedProviderId) return
    let cancelled = false
    supabase.from('profiles').select('id, full_name, avatar_url, city, state')
      .eq('id', invitedProviderId).single().then(({ data }) => {
        if (!cancelled) setInvitedProvider(data || null)
      })
    return () => { cancelled = true }
  }, [invitedProviderId])

  // Realtime on the transaction row itself -- so if the Paystack webhook
  // flips status OPEN/PENDING -> FUNDED while this page is open, the
  // requester sees it live instead of needing to refresh.
  useEffect(() => {
    if (!transaction?.id) return
    let channel = null
    try {
      channel = supabase
        .channel('transaction-' + transaction.id)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'transactions',
          filter: 'id=eq.' + transaction.id,
        }, (payload) => setTransaction(payload.new))
        .subscribe()
    } catch { /* realtime is a nice-to-have here, non-fatal if it fails */ }
    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [transaction?.id])

  // Realtime bids
  useEffect(() => {
    if (!transaction?.id) return
    let channel = null

    const load = async () => {
      const { data } = await supabase
        .from('bids')
        .select('id, amount_cents, attributes, status, created_at, provider_id')
        .eq('transaction_id', transaction.id)
        .order('created_at', { ascending: false })
      const rows = data || []
      const providerIds = [...new Set(rows.map(b => b.provider_id))]
      let byId = {}
      if (providerIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', providerIds)
        byId = Object.fromEntries((profs || []).map(p => [p.id, p]))
      }
      setBids(rows.map(b => ({ ...b, providerProfile: byId[b.provider_id] })))
    }
    load()

    try {
      channel = supabase
        .channel('bids-' + transaction.id)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'bids',
          filter: 'transaction_id=eq.' + transaction.id,
        }, load)
        .subscribe()
    } catch { /* non-fatal */ }

    return () => { if (channel) { try { supabase.removeChannel(channel) } catch {} } }
  }, [transaction?.id])

  const submit = async () => {
    if (!description.trim()) { toast.error('Describe what you need'); return }
    if (!location.trim()) { toast.error('Add a location'); return }
    if (!user) { setShowGuestAuth(true); return }

    setPosting(true)
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        model: MODEL_BY_TOGGLE[toggle],
        status: 'OPEN',
        requester_id: user.id,
        provider_id: toggle === 'book' ? invitedProviderId : null,
        amount_cents: budget ? Math.round(parseFloat(budget) * 100) : null,
        attributes: {
          description: description.trim(),
          location: location.trim(),
          invited_provider_id: invitedProviderId,
        },
      })
      .select()
      .single()

    setPosting(false)
    if (error) { toast.error('Could not post job. Try again.'); return }
    setTransaction(data)
    navigate(`/jobs/${data.id}`, { replace: true })
    toast.success(toggle === 'book' ? 'Request sent!' : 'Job posted - bids coming in')
  }

  // Resume the post automatically once guest phone verification succeeds --
  // `user` from useAuth() updates via the Supabase auth-state listener
  // right after verifyOtp() resolves, so this re-run has a valid session.
  const handleGuestAuthSuccess = () => {
    setShowGuestAuth(false)
    setTimeout(() => submit(), 150)
  }

  const acceptBid = async (bid) => {
    // Gate: a provider with nowhere for money to land shouldn't have a bid
    // accepted in the first place, this fails fast before touching the
    // transaction rather than letting payment get stuck later.
    const { data: payoutReady } = await supabase.rpc('has_verified_payout_account', { p_profile_id: bid.provider_id })
    if (!payoutReady) {
      toast.error('This provider hasn\'t finished setting up payouts yet, ask them to complete it before accepting.')
      return
    }

    const { data: updatedTx, error } = await supabase.rpc('accept_bid', {
      p_transaction_id: transaction.id,
      p_bid_id: bid.id,
    })
    if (error) { toast.error(error.message || 'Could not accept bid'); return }

    setTransaction(updatedTx)
    toast.success('Bid accepted - pay for protection to unlock contact details')

    emitEvent('bid.accepted', {
      providerId: bid.provider_id,
      amountCents: bid.amount_cents,
      link: `/jobs/${transaction.id}`,
    })
  }

  const counterBid = async (bid) => {
    const raw = window.prompt('Your counter offer (₦):')
    if (!raw) return
    const counterCents = Math.round(parseFloat(raw) * 100)
    if (!counterCents || Number.isNaN(counterCents)) { toast.error('Enter a valid amount'); return }

    const { error } = await supabase.rpc('counter_bid', {
      p_bid_id: bid.id,
      p_counter_cents: counterCents,
    })
    if (error) { toast.error(error.message || 'Could not send counter'); return }
    toast.success('Counter sent - awaiting provider response')
  }

  // Binds a payment reference to this transaction server-side (via RPC,
  // authorization-checked) BEFORE opening Paystack -- the webhook resolves
  // which row to mark FUNDED strictly by that reference (20260731000020),
  // the same pattern already used for escrow_transactions.payment_ref.
  // Does NOT flip status to FUNDED itself -- that happens in the webhook
  // after real payment verification. The realtime subscription above
  // picks up the change once it does.
  const fundEscrow = async () => {
    setFundingEscrow(true)
    const reference = generateReference()

    const { error: refErr } = await supabase.rpc('start_escrow_payment', {
      p_transaction_id: transaction.id,
      p_reference: reference,
    })
    if (refErr) {
      toast.error(refErr.message || 'Could not start payment')
      setFundingEscrow(false)
      return
    }

    await fundTransactionEscrow({
      email: user.email,
      transactionId: transaction.id,
      amountCents: transaction.amount_cents,
      requesterId: user.id,
      reference,
      onSuccess: () => {
        toast.success('Payment received - confirming protection, this updates automatically')
      },
      onClose: () => setFundingEscrow(false),
    })
    setFundingEscrow(false)
  }

  // Lets the requester back out of a job before any money has moved.
  // Server-side (cancel_transaction RPC) refuses this once the transaction
  // is FUNDED - at that point it has to go through the dispute/refund flow
  // instead, so this can never be used to walk away from a funded escrow.
  const cancelJob = async () => {
    if (!window.confirm('Cancel this request? This cannot be undone.')) return
    setCancelling(true)
    const { data: updatedTx, error } = await supabase.rpc('cancel_transaction', {
      p_transaction_id: transaction.id,
      p_reason: 'Cancelled by requester',
    })
    setCancelling(false)
    if (error) { toast.error(error.message || 'Could not cancel this request'); return }

    setTransaction(updatedTx)
    toast.success('Request cancelled')
  }

  const markComplete = async () => {
    setCompleting(true)
    const { data: updatedTx, error } = await supabase.rpc(
      isRequester ? 'confirm_transaction_buyer' : 'confirm_transaction_provider',
      { p_transaction_id: transaction.id }
    )
    setCompleting(false)
    if (error) { toast.error(error.message || 'Could not confirm'); return }

    setTransaction(updatedTx)
    toast.success(updatedTx.status === 'COMPLETED' ? 'Job marked complete - both sides confirmed' : 'Confirmed. Waiting on the other side.')
    if (updatedTx.status === 'COMPLETED') {
      emitEvent('job.completed', {
        requesterId: updatedTx.requester_id,
        providerId: updatedTx.provider_id,
        link: `/jobs/${updatedTx.id}`,
      })
    }
  }

  if (loadingExisting) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <p className="text-sm" style={{ color: '#647068' }}>Loading job...</p>
    </div>
  )

  const isRequester = transaction && user && transaction.requester_id === user.id

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #DEDDD6' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#DEDDD6', backgroundColor: '#FFFFFF' }}>
          <ArrowLeft size={16} style={{ color: '#17211B' }} />
        </button>
        <span className="font-display font-black text-base" style={{ color: '#17211B' }}>Post a Request</span>
        {transaction && (
          <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: '#C85F2D' }}>
            {STATUS_LABEL[transaction.status] || transaction.status}
          </span>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">

        {!transaction && (
          <div className="md:grid md:grid-cols-[1fr,340px] md:gap-8 md:items-start">
          <div>
            <div className="flex rounded-2xl p-1 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <button onClick={() => setToggle('book')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'book' ? '#C85F2D' : 'transparent',
                  color: toggle === 'book' ? '#FFFFFF' : '#647068',
                }}>
                <Zap size={14} /> I need someone now
              </button>
              <button onClick={() => setToggle('bid')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'bid' ? '#C85F2D' : 'transparent',
                  color: toggle === 'bid' ? '#FFFFFF' : '#647068',
                }}>
                <Gavel size={14} /> Let providers bid
              </button>
            </div>

            <p className="text-xs mb-4 px-1" style={{ color: '#647068' }}>
              {toggle === 'book'
                ? 'We notify the nearest available provider right away at your fixed budget. They can accept or decline - no back-and-forth.'
                : 'Your job stays open and providers send in price offers. You compare and pick whichever works best for you.'}
            </p>

            <div className="rounded-2xl p-4 mb-4 border space-y-3" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: '#17211B' }}>What do you need? *</p>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="I need a plumber around Ewet"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid #DEDDD6', color: '#17211B' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: '#17211B' }}>Location *</p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid #DEDDD6' }}>
                    <MapPin size={13} style={{ color: '#C85F2D' }} />
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="Uyo, Akwa Ibom"
                      className="w-full text-sm outline-none bg-transparent" style={{ color: '#17211B' }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: '#17211B' }}>
                    {toggle === 'book' ? 'Your fixed budget' : 'Starting budget (optional)'}
                  </p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid #DEDDD6' }}>
                    <Wallet size={13} style={{ color: '#C85F2D' }} />
                    <input value={budget} onChange={e => setBudget(e.target.value)}
                      type="number" placeholder={toggle === 'book' ? 'What you\u2019ll pay' : 'Flexible'}
                      className="w-full text-sm outline-none bg-transparent" style={{ color: '#17211B' }} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: '#B5A99C' }}>
                    {toggle === 'book'
                      ? 'The provider sees this exact amount and can only accept or decline it.'
                      : 'Providers see this as a guide - their actual bids may come in above or below it.'}
                  </p>
                </div>
              </div>
            </div>

            <button onClick={submit} disabled={posting}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: '#C85F2D' }}>
              {posting ? 'Posting...' : toggle === 'book' ? 'Send Request' : 'Post Job'}
            </button>
          </div>

          {/* Locked-preview panel - mirrors the "phone hidden until you pay"
              pattern from the reference design. Only ever shows a real
              invited provider (from a /providers "Request Bid" tap); with
              no invite, it shows the honest generic state instead of a
              fabricated name. */}
          <div className="hidden md:block rounded-3xl overflow-hidden mt-1"
            style={{ backgroundColor: '#1C1410' }}>
            <div className="h-44 relative flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(200,95,45,0.35), rgba(28,20,16,0.9))' }}>
              {invitedProvider?.avatar_url
                ? <img src={invitedProvider.avatar_url} alt="" className="w-full h-full object-cover absolute inset-0" />
                : <User size={40} style={{ color: 'rgba(255,255,255,0.4)' }} />}
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
          </div>
        )}

        {transaction && (
          <>
            <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
              <p className="text-sm font-semibold" style={{ color: '#17211B' }}>{transaction.attributes?.description}</p>
              <p className="text-xs mt-1" style={{ color: '#647068' }}>{transaction.attributes?.location}</p>
            </div>

            {/* OPEN + reverse-bid: bids list */}
            {transaction.status === 'OPEN' && transaction.model === 'MULTI_ATTRIBUTE_REVERSE' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-black text-base" style={{ color: '#17211B' }}>Bids coming in</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: '#C85F2D' }}>
                    {bids.length} {bids.length === 1 ? 'bid' : 'bids'}
                  </span>
                </div>

                {bids.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>Waiting for the first bid...</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {bids.map(b => (
                      <div key={b.id} className="rounded-2xl p-3 border flex items-center gap-3"
                        style={{ backgroundColor: '#FFFFFF', borderColor: b.status === 'ACCEPTED' ? '#7A9E7E' : '#DEDDD6' }}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                          {b.providerProfile?.avatar_url
                            ? <img src={b.providerProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <User size={16} style={{ color: '#C85F2D' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: '#17211B' }}>{b.providerProfile?.full_name || 'Provider'}</p>
                          {b.attributes?.eta_minutes && (
                            <p className="text-[11px]" style={{ color: '#647068' }}>Can start today · {b.attributes.eta_minutes}m ETA</p>
                          )}
                        </div>
                        <p className="font-black text-sm flex-shrink-0" style={{ color: '#17211B' }}>
                          ₦{(b.amount_cents / 100).toLocaleString()}
                        </p>
                        {b.status === 'ACCEPTED' ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold flex-shrink-0" style={{ color: '#5C8060' }}>
                            <Check size={12} /> Accepted
                          </span>
                        ) : b.status === 'DECLINED' ? (
                          <span className="text-[11px] flex-shrink-0" style={{ color: '#B5A99C' }}>Declined</span>
                        ) : (
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => acceptBid(b)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white"
                              style={{ backgroundColor: '#7A9E7E' }}>
                              Accept
                            </button>
                            <button onClick={() => counterBid(b)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border"
                              style={{ borderColor: '#DEDDD6', color: '#5C4A3A' }}>
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
                  <ShieldCheck size={16} style={{ color: '#5C8060' }} />
                  <p className="text-[11px]" style={{ color: '#5C8060' }}>
                    Payment is protected. Providers are paid only after you confirm the job is done.
                  </p>
                </div>
              </>
            )}

            {/* OPEN + direct request, waiting on the invited provider */}
            {transaction.status === 'OPEN' && transaction.model === 'NEAREST_AVAILABLE' && (
              <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>
                Waiting for the provider to accept your request...
              </p>
            )}

            {/* PENDING: bid/request accepted, awaiting escrow */}
            {transaction.status === 'PENDING' && isRequester && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
                <p className="text-sm font-semibold mb-1" style={{ color: '#17211B' }}>Accepted - pay for protection to proceed</p>
                <p className="text-xs mb-3" style={{ color: '#647068' }}>
                  {formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)} will be held until you confirm the job is done.
                </p>
                <button onClick={fundEscrow} disabled={fundingEscrow}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#C85F2D' }}>
                  <Lock size={14} /> {fundingEscrow ? 'Opening payment...' : `Pay for Protection - ${formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)}`}
                </button>
              </div>
            )}
            {transaction.status === 'PENDING' && !isRequester && (
              <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>
                Accepted - waiting on the requester to pay for protection.
              </p>
            )}

            {/* OPEN or PENDING: requester can still back out, nothing has been funded yet */}
            {isRequester && (transaction.status === 'OPEN' || transaction.status === 'PENDING') && (
              <button onClick={cancelJob} disabled={cancelling}
                className="w-full py-3 rounded-2xl text-sm font-bold border disabled:opacity-50 mt-3"
                style={{ borderColor: '#DEDDD6', color: '#C94A3A', backgroundColor: '#FFFFFF' }}>
                {cancelling ? 'Cancelling...' : 'Cancel Request'}
              </button>
            )}

            {/* FUNDED: work in progress, both sides confirm independently,
                the transaction only reaches COMPLETED once both have. */}
            {transaction.status === 'FUNDED' && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#DEDDD6' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={14} style={{ color: '#5C8060' }} />
                  <p className="text-sm font-semibold" style={{ color: '#17211B' }}>Protection funded</p>
                </div>

                <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: '#647068' }}>
                  <span>{transaction.buyer_confirmed_at ? '✓' : '○'} Requester confirmed</span>
                  <span>·</span>
                  <span>{transaction.provider_confirmed_at ? '✓' : '○'} Provider confirmed</span>
                </div>

                {(isRequester && transaction.buyer_confirmed_at) || (!isRequester && transaction.provider_confirmed_at) ? (
                  <p className="text-xs" style={{ color: '#647068' }}>You've confirmed. Waiting on the other side before this releases.</p>
                ) : (
                  <button onClick={markComplete} disabled={completing}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: '#7A9E7E' }}>
                    {completing ? 'Confirming...' : 'Confirm Job Done'}
                  </button>
                )}
              </div>
            )}

            {transaction.status === 'COMPLETED' && (
              <p className="text-xs text-center py-8" style={{ color: '#7A9E7E' }}>
                Job complete. Payout processed per the protection terms.
              </p>
            )}
            {transaction.status === 'CANCELLED' && (
              <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>This request was cancelled.</p>
            )}
            {transaction.status === 'DISPUTED' && (
              <p className="text-xs text-center py-8" style={{ color: '#C94A3A' }}>
                A dispute is open on this job. Our team will review within 24 hours.
              </p>
            )}
          </>
        )}
      </div>

      {showGuestAuth && (
        <GuestAuthModal
          title="Sign in to post"
          subtitle="Verify your phone number to post this and receive responses - no password needed."
          onClose={() => setShowGuestAuth(false)}
          onSuccess={handleGuestAuthSuccess}
        />
      )}
    </div>
  )
}

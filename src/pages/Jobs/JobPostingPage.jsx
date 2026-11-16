import React, { useState, useEffect } from 'react'
import { useFormDraft } from '@/hooks/useFormDraft'
import DraftNotice from '@/components/ui/DraftNotice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Gavel, Lock, MapPin, Wallet, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fetchTransaction, insertTransaction, fetchInvitedProvider,
  fetchBidsWithProviders, hasVerifiedPayoutAccount, acceptBidForJob, sendCounterOffer, startEscrowPayment,
  cancelTransaction, confirmTransaction,
} from '@/data/jobPostingRepository'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { emitEvent } from '@/lib/events'
import { fundTransactionEscrow, formatNaira, generateReference } from '@/lib/flutterwave'
import GuestAuthModal from '@/components/ui/GuestAuthModal'
import toast from 'react-hot-toast'
import { friendlyDbError } from '@/lib/dbErrors'
import LeaveReview from './LeaveReview'
import BidList from './BidList'
import InvitedProviderPanel from './InvitedProviderPanel'

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
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { user }   = useAuth()
  const { requireVerification } = useVerificationGuard()
  const { id: routeId } = useParams()   // present when visiting /jobs/:id (an existing transaction)
  const [params]   = useSearchParams()

  const [toggle, setToggle] = useState(params.get('mode') === 'bid' ? 'bid' : 'book')
  const invitedProviderId = params.get('provider') || null
  const [invitedProvider, setInvitedProvider] = useState(null)

  const [description, setDescription] = useState('')
  const [location, setLocation]       = useState('')
  const [budget, setBudget]           = useState('')
  const [posting, setPosting]         = useState(false)

  const [transaction, setTransaction] = useState(null)
  const [bids, setBids]               = useState([])
  const [loadingExisting, setLoadingExisting] = useState(!!routeId)
  const [fundingEscrow, setFundingEscrow]     = useState(false)
  const [completing, setCompleting]           = useState(false)
  const [cancelling, setCancelling]           = useState(false)
  const [showGuestAuth, setShowGuestAuth]     = useState(false) // guest checkout: phone-OTP instead of full /auth

  // Keeps the request on this device so a dropped connection or reload never starts it over.
  // Only for a new request: an existing job (/jobs/:id) is loaded from the server.
  const draft = useFormDraft('post-job', { toggle, description, location, budget },
    (d) => {
      if (d.toggle) setToggle(d.toggle)
      setDescription(d.description || '')
      setLocation(d.location || '')
      setBudget(d.budget || '')
    },
    { userId: user?.id, enabled: !routeId })

  // Load an existing transaction when visiting /jobs/:id -- this is the
  // route every notification link (escrow.funded, bid.accepted, etc.)
  // already pointed to, but nothing loaded it before this.
  useEffect(() => {
    if (!routeId) return
    let cancelled = false
    fetchTransaction(routeId).then(({ data }) => {
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
    fetchInvitedProvider(invitedProviderId).then(({ data }) => {
      if (!cancelled) setInvitedProvider(data || null)
    })
    return () => { cancelled = true }
  }, [invitedProviderId])

  // Realtime on the transaction row itself -- so if the Flutterwave webhook
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
      setBids(await fetchBidsWithProviders(transaction.id))
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
    if (!description.trim()) { toast.error('Tell us what you need'); return }
    if (!location.trim()) { toast.error('Add a location to continue'); return }
    if (!user) { setShowGuestAuth(true); return }

    setPosting(true)
    const { data, error } = await insertTransaction({
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

    setPosting(false)
    if (error) { toast.error(friendlyDbError(error, 'We couldn\'t post that. Please try again.')); return }
    draft.clear()
    setTransaction(data)
    navigate(`/jobs/${data.id}`, { replace: true })
    toast.success(toggle === 'book' ? 'Request sent.' : 'Job posted. Bids will appear here.')
  }

  // Resume the post automatically once guest phone verification succeeds --
  // `user` from useAuth() updates via the Supabase auth-state listener
  // right after verifyOtp() resolves, so this re-run has a valid session.
  const handleGuestAuthSuccess = () => {
    setShowGuestAuth(false)
    setTimeout(() => submit(), 150)
  }

  const acceptBid = async (bid) => {
    // Accepting a bid is a deal agreement: identity must be verified first.
    if (!(await requireVerification('deal_agreement'))) return
    // Gate: a provider with nowhere for money to land shouldn't have a bid
    // accepted in the first place, this fails fast before touching the
    // transaction rather than letting payment get stuck later.
    const { data: payoutReady } = await hasVerifiedPayoutAccount(bid.provider_id)
    if (!payoutReady) {
      toast.error('This provider hasn\'t finished setting up payouts yet, ask them to complete it before accepting.')
      return
    }

    const { data: updatedTx, error } = await acceptBidForJob(transaction.id, bid.id)
    if (error) { toast.error(friendlyDbError(error, 'We couldn\'t accept that bid. Please try again.')); return }

    setTransaction(updatedTx)
    toast.success('Bid accepted. Pay through DealMatch Protection to unlock contact details.')

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

    const { error } = await sendCounterOffer(bid.id, counterCents)
    if (error) { toast.error(friendlyDbError(error, 'We couldn\'t send your counter-offer. Please try again.')); return }
    toast.success('Counter-offer sent. Waiting for the provider to respond.')
  }

  // Binds a payment reference to this transaction server-side (via RPC,
  // authorization-checked) BEFORE opening Flutterwave -- the webhook resolves
  // which row to mark FUNDED strictly by that reference (20260731000020),
  // the same pattern already used for escrow_transactions.payment_ref.
  // Does NOT flip status to FUNDED itself -- that happens in the webhook
  // after real payment verification. The realtime subscription above
  // picks up the change once it does.
  const fundEscrow = async () => {
    if (!(await requireVerification('escrow'))) return
    setFundingEscrow(true)
    const reference = generateReference()

    const { error: refErr } = await startEscrowPayment(transaction.id, reference)
    if (refErr) {
      toast.error(friendlyDbError(refErr, 'We couldn\'t start the payment. Please try again.'))
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
    if (!(await confirm({ title: 'Cancel this request?', message: 'This cannot be undone.', confirmLabel: 'Cancel request', cancelLabel: 'Keep it', danger: true }))) return
    setCancelling(true)
    const { data: updatedTx, error } = await cancelTransaction(transaction.id, 'Cancelled by requester')
    setCancelling(false)
    if (error) { toast.error(friendlyDbError(error, 'Could not cancel this request')); return }

    setTransaction(updatedTx)
    toast.success('Request cancelled')
  }

  const markComplete = async () => {
    setCompleting(true)
    const { data: updatedTx, error } = await confirmTransaction(transaction.id, isRequester)
    setCompleting(false)
    if (error) { toast.error(friendlyDbError(error, 'Could not confirm')); return }

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
      <p className="text-sm" style={{ color: 'var(--dm-warm)' }}>Loading job...</p>
    </div>
  )

  const isRequester = transaction && user && transaction.requester_id === user.id

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--dm-line)' }}>
        <button onClick={() => navigate(-1)} aria-label="Go back"
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: 'var(--dm-line)', backgroundColor: 'white' }}>
          <ArrowLeft size={16} style={{ color: 'var(--dm-deep)' }} />
        </button>
        <span className="font-display font-black text-base" style={{ color: 'var(--dm-deep)' }}>Post a Request</span>
        {transaction && (
          <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(200,95,45,0.1)', color: 'var(--dm-terracotta)' }}>
            {STATUS_LABEL[transaction.status] || transaction.status}
          </span>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-4">

        {!transaction && <DraftNotice draft={draft} onStartOver={() => { setDescription(''); setLocation(''); setBudget('') }} />}

        {!transaction && (
          <div className="md:grid md:grid-cols-[1fr,340px] md:gap-8 md:items-start">
          <div>
            <div className="flex rounded-2xl p-1 mb-5 border" style={{ backgroundColor: 'white', borderColor: 'var(--dm-line)' }}>
              <button onClick={() => setToggle('book')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'book' ? 'var(--dm-terracotta)' : 'transparent',
                  color: toggle === 'book' ? 'white' : 'var(--dm-warm)',
                }}>
                <Zap size={14} /> I need someone now
              </button>
              <button onClick={() => setToggle('bid')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'bid' ? 'var(--dm-terracotta)' : 'transparent',
                  color: toggle === 'bid' ? 'white' : 'var(--dm-warm)',
                }}>
                <Gavel size={14} /> Let providers bid
              </button>
            </div>

            <p className="text-xs mb-4 px-1" style={{ color: 'var(--dm-warm)' }}>
              {toggle === 'book'
                ? 'We notify the nearest available provider right away at your fixed budget. They can accept or decline - no back-and-forth.'
                : 'Your job stays open and providers send in price offers. You compare and pick whichever works best for you.'}
            </p>

            <div className="rounded-2xl p-4 mb-4 border space-y-3" style={{ backgroundColor: 'white', borderColor: 'var(--dm-line)' }}>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--dm-deep)' }}>What do you need? *</p>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="I need a plumber to fix a leaking pipe"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid var(--dm-line)', color: 'var(--dm-deep)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--dm-deep)' }}>Location *</p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid var(--dm-line)' }}>
                    <MapPin size={13} style={{ color: 'var(--dm-terracotta)' }} />
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. Lekki, Lagos"
                      className="w-full text-sm outline-none bg-transparent" style={{ color: 'var(--dm-deep)' }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--dm-deep)' }}>
                    {toggle === 'book' ? 'Your fixed budget' : 'Starting budget (optional)'}
                  </p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(23,33,27,0.03)', border: '1.5px solid var(--dm-line)' }}>
                    <Wallet size={13} style={{ color: 'var(--dm-terracotta)' }} />
                    <input value={budget} onChange={e => setBudget(e.target.value)}
                      type="number" placeholder={toggle === 'book' ? 'What you\u2019ll pay' : 'Flexible'}
                      className="w-full text-sm outline-none bg-transparent" style={{ color: 'var(--dm-deep)' }} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'rgba(23,33,27,0.7)' }}>
                    {toggle === 'book'
                      ? 'The provider sees this exact amount and can only accept or decline it.'
                      : 'Providers see this as a guide - their actual bids may come in above or below it.'}
                  </p>
                </div>
              </div>
            </div>

            <button onClick={submit} disabled={posting}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--dm-terracotta)' }}>
              {posting ? 'Posting...' : toggle === 'book' ? 'Send Request' : 'Post Job'}
            </button>
          </div>

          <InvitedProviderPanel invitedProvider={invitedProvider} />
          </div>
        )}

        {transaction && (
          <>
            <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: 'white', borderColor: 'var(--dm-line)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--dm-deep)' }}>{transaction.attributes?.description}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dm-warm)' }}>{transaction.attributes?.location}</p>
            </div>

            {/* OPEN + reverse-bid: bids list */}
            {transaction.status === 'OPEN' && transaction.model === 'MULTI_ATTRIBUTE_REVERSE' && (
              <>
                <BidList bids={bids} onAccept={acceptBid} onCounter={counterBid} />
              </>
            )}

            {/* OPEN + direct request, waiting on the invited provider */}
            {transaction.status === 'OPEN' && transaction.model === 'NEAREST_AVAILABLE' && (
              <p className="text-xs text-center py-8" style={{ color: 'rgba(23,33,27,0.7)' }}>
                Waiting for the provider to accept your request...
              </p>
            )}

            {/* PENDING: bid/request accepted, awaiting escrow */}
            {transaction.status === 'PENDING' && isRequester && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'white', borderColor: 'var(--dm-line)' }}>
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--dm-deep)' }}>Accepted - pay for protection to proceed</p>
                <p className="text-xs mb-3" style={{ color: 'var(--dm-warm)' }}>
                  {formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)} will be held until you confirm the job is done.
                </p>
                <button onClick={fundEscrow} disabled={fundingEscrow}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--dm-terracotta)' }}>
                  <Lock size={14} /> {fundingEscrow ? 'Opening payment...' : `Pay for Protection - ${formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)}`}
                </button>
              </div>
            )}
            {transaction.status === 'PENDING' && !isRequester && (
              <p className="text-xs text-center py-8" style={{ color: 'rgba(23,33,27,0.7)' }}>
                Accepted - waiting on the requester to pay for protection.
              </p>
            )}

            {/* OPEN or PENDING: requester can still back out, nothing has been funded yet */}
            {isRequester && (transaction.status === 'OPEN' || transaction.status === 'PENDING') && (
              <button onClick={cancelJob} disabled={cancelling}
                className="w-full py-3 rounded-2xl text-sm font-bold border disabled:opacity-50 mt-3"
                style={{ borderColor: 'var(--dm-line)', color: '#C94A3A', backgroundColor: 'white' }}>
                {cancelling ? 'Cancelling...' : 'Cancel Request'}
              </button>
            )}

            {/* FUNDED: work in progress, both sides confirm independently,
                the transaction only reaches COMPLETED once both have. */}
            {transaction.status === 'FUNDED' && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: 'white', borderColor: 'var(--dm-line)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={14} style={{ color: '#5C8060' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--dm-deep)' }}>Protection funded</p>
                </div>

                <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: 'var(--dm-warm)' }}>
                  <span>{transaction.buyer_confirmed_at ? '✓' : '○'} Requester confirmed</span>
                  <span>·</span>
                  <span>{transaction.provider_confirmed_at ? '✓' : '○'} Provider confirmed</span>
                </div>

                {(isRequester && transaction.buyer_confirmed_at) || (!isRequester && transaction.provider_confirmed_at) ? (
                  <p className="text-xs" style={{ color: 'var(--dm-warm)' }}>You've confirmed. Waiting on the other side before this releases.</p>
                ) : (
                  <button onClick={markComplete} disabled={completing}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--dm-sage)' }}>
                    {completing ? 'Confirming...' : 'Confirm Job Done'}
                  </button>
                )}
              </div>
            )}

            {transaction.status === 'COMPLETED' && (
              <>
                <p className="text-xs text-center py-8" style={{ color: 'var(--dm-sage)' }}>
                  Job complete. Payout processed per the protection terms.
                </p>
                {isRequester && transaction.provider_id && (
                  <LeaveReview transactionId={transaction.id} providerId={transaction.provider_id} reviewerId={user.id} />
                )}
              </>
            )}
            {transaction.status === 'CANCELLED' && (
              <p className="text-xs text-center py-8" style={{ color: 'rgba(23,33,27,0.7)' }}>This request was cancelled.</p>
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

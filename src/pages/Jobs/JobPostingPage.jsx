import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Gavel, Lock, MapPin, ShieldCheck, User, Wallet, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { emitEvent } from '@/lib/events'
import { fundTransactionEscrow, formatNaira } from '@/lib/paystack'
import toast from 'react-hot-toast'

const MODEL_BY_TOGGLE = {
  book: 'NEAREST_AVAILABLE',       // "I need someone now" -- ADR-009, build now, first
  bid:  'MULTI_ATTRIBUTE_REVERSE', // "Let providers bid"   -- ADR-009, build now, second
}

const STATUS_LABEL = {
  OPEN:      'Open',
  PENDING:   'Awaiting escrow',
  FUNDED:    'Escrow funded',
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

  const [description, setDescription] = useState('')
  const [location, setLocation]       = useState('')
  const [budget, setBudget]           = useState('')
  const [posting, setPosting]         = useState(false)

  const [transaction, setTransaction] = useState(null)
  const [bids, setBids]               = useState([])
  const [loadingExisting, setLoadingExisting] = useState(!!routeId)
  const [fundingEscrow, setFundingEscrow]     = useState(false)
  const [completing, setCompleting]           = useState(false)

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
    if (!user) { navigate('/auth'); return }
    if (!description.trim()) { toast.error('Describe what you need'); return }
    if (!location.trim()) { toast.error('Add a location'); return }

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
    toast.success(toggle === 'book' ? 'Request sent!' : 'Job posted — bids coming in')
  }

  const acceptBid = async (bid) => {
    const { data: updatedTx, error } = await supabase.rpc('accept_bid', {
      p_transaction_id: transaction.id,
      p_bid_id: bid.id,
    })
    if (error) { toast.error(error.message || 'Could not accept bid'); return }

    setTransaction(updatedTx)
    toast.success('Bid accepted — fund escrow to unlock contact details')

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
    toast.success('Counter sent — awaiting provider response')
  }

  // Opens the Paystack popup. Does NOT flip status to FUNDED itself --
  // that happens in the payment webhook once it's wired for
  // metadata.type === 'transaction_escrow' (not done yet, see paystack.js).
  // The realtime subscription above will pick up the change once it is.
  const fundEscrow = async () => {
    setFundingEscrow(true)
    await fundTransactionEscrow({
      email: user.email,
      transactionId: transaction.id,
      amountCents: transaction.amount_cents,
      requesterId: user.id,
      onSuccess: () => {
        toast.success('Payment received — confirming escrow, this updates automatically')
      },
      onClose: () => setFundingEscrow(false),
    })
    setFundingEscrow(false)
  }

  const markComplete = async () => {
    setCompleting(true)
    const { data: updatedTx, error } = await supabase.rpc('complete_transaction', {
      p_transaction_id: transaction.id,
    })
    setCompleting(false)
    if (error) { toast.error(error.message || 'Could not mark complete'); return }

    setTransaction(updatedTx)
    toast.success('Job marked complete')
    emitEvent('job.completed', {
      requesterId: updatedTx.requester_id,
      providerId: updatedTx.provider_id,
      link: `/jobs/${updatedTx.id}`,
    })
  }

  if (loadingExisting) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFAF5' }}>
      <p className="text-sm" style={{ color: '#8A7E78' }}>Loading job...</p>
    </div>
  )

  const isRequester = transaction && user && transaction.requester_id === user.id

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: 'rgba(255,250,245,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E8DDD2' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center border"
          style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFFFF' }}>
          <ArrowLeft size={16} style={{ color: '#1A1210' }} />
        </button>
        <span className="font-display font-black text-base" style={{ color: '#1A1210' }}>Post a Job</span>
        {transaction && (
          <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(201,106,58,0.1)', color: '#C96A3A' }}>
            {STATUS_LABEL[transaction.status] || transaction.status}
          </span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {!transaction && (
          <>
            <div className="flex rounded-2xl p-1 mb-5 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <button onClick={() => setToggle('book')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'book' ? '#C96A3A' : 'transparent',
                  color: toggle === 'book' ? '#FFFFFF' : '#8A7E78',
                }}>
                <Zap size={14} /> I need someone now
              </button>
              <button onClick={() => setToggle('bid')}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: toggle === 'bid' ? '#C96A3A' : 'transparent',
                  color: toggle === 'bid' ? '#FFFFFF' : '#8A7E78',
                }}>
                <Gavel size={14} /> Let providers bid
              </button>
            </div>

            <div className="rounded-2xl p-4 mb-4 border space-y-3" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: '#1A1210' }}>What do you need? *</p>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Fix a leaking kitchen tap"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1.5px solid #E8DDD2', color: '#1A1210' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: '#1A1210' }}>Location *</p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1.5px solid #E8DDD2' }}>
                    <MapPin size={13} style={{ color: '#C96A3A' }} />
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="Ikeja, Lagos"
                      className="w-full text-sm outline-none bg-transparent" style={{ color: '#1A1210' }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: '#1A1210' }}>Budget (optional)</p>
                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1.5px solid #E8DDD2' }}>
                    <Wallet size={13} style={{ color: '#C96A3A' }} />
                    <input value={budget} onChange={e => setBudget(e.target.value)}
                      type="number" placeholder="Flexible"
                      className="w-full text-sm outline-none bg-transparent" style={{ color: '#1A1210' }} />
                  </div>
                </div>
              </div>
            </div>

            <button onClick={submit} disabled={posting}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: '#C96A3A' }}>
              {posting ? 'Posting...' : toggle === 'book' ? 'Send Request' : 'Post Job'}
            </button>
          </>
        )}

        {transaction && (
          <>
            <div className="rounded-2xl p-4 mb-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
              <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>{transaction.attributes?.description}</p>
              <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>{transaction.attributes?.location}</p>
            </div>

            {/* OPEN + reverse-bid: bids list */}
            {transaction.status === 'OPEN' && transaction.model === 'MULTI_ATTRIBUTE_REVERSE' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-black text-base" style={{ color: '#1A1210' }}>Bids coming in</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(201,106,58,0.1)', color: '#C96A3A' }}>
                    {bids.length} {bids.length === 1 ? 'bid' : 'bids'}
                  </span>
                </div>

                {bids.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>Waiting for the first bid...</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {bids.map(b => (
                      <div key={b.id} className="rounded-2xl p-3 border flex items-center gap-3"
                        style={{ backgroundColor: '#FFFFFF', borderColor: b.status === 'ACCEPTED' ? '#7A9E7E' : '#E8DDD2' }}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{ backgroundColor: 'rgba(201,106,58,0.1)' }}>
                          {b.providerProfile?.avatar_url
                            ? <img src={b.providerProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <User size={16} style={{ color: '#C96A3A' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: '#1A1210' }}>{b.providerProfile?.full_name || 'Provider'}</p>
                          {b.attributes?.eta_minutes && (
                            <p className="text-[11px]" style={{ color: '#8A7E78' }}>Can start today · {b.attributes.eta_minutes}m ETA</p>
                          )}
                        </div>
                        <p className="font-black text-sm flex-shrink-0" style={{ color: '#1A1210' }}>
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
                              style={{ borderColor: '#E8DDD2', color: '#5C4A3A' }}>
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
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
                <p className="text-sm font-semibold mb-1" style={{ color: '#1A1210' }}>Accepted — fund escrow to proceed</p>
                <p className="text-xs mb-3" style={{ color: '#8A7E78' }}>
                  {formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)} will be held until you confirm the job is done.
                </p>
                <button onClick={fundEscrow} disabled={fundingEscrow}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#C96A3A' }}>
                  <Lock size={14} /> {fundingEscrow ? 'Opening payment...' : `Fund Escrow — ${formatNaira(transaction.amount_cents ? transaction.amount_cents / 100 : 0)}`}
                </button>
              </div>
            )}
            {transaction.status === 'PENDING' && !isRequester && (
              <p className="text-xs text-center py-8" style={{ color: '#B5A99C' }}>
                Accepted — waiting on the requester to fund escrow.
              </p>
            )}

            {/* FUNDED: work in progress, requester can confirm completion */}
            {transaction.status === 'FUNDED' && (
              <div className="rounded-2xl p-4 border" style={{ backgroundColor: '#FFFFFF', borderColor: '#E8DDD2' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={14} style={{ color: '#5C8060' }} />
                  <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>Escrow funded</p>
                </div>
                {isRequester ? (
                  <button onClick={markComplete} disabled={completing}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: '#7A9E7E' }}>
                    {completing ? 'Confirming...' : 'Confirm Job Done'}
                  </button>
                ) : (
                  <p className="text-xs" style={{ color: '#8A7E78' }}>Waiting on the requester to confirm the job is done.</p>
                )}
              </div>
            )}

            {transaction.status === 'COMPLETED' && (
              <p className="text-xs text-center py-8" style={{ color: '#7A9E7E' }}>
                Job complete. Payout processed per the escrow terms.
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
    </div>
  )
}

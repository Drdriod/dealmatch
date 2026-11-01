/**
 * WalletPage - /wallet
 *
 * The unified "my money" view the handoff spec's nav implied but never
 * had a page: escrow funds in flight (as buyer/tenant and as
 * seller/provider), completed job/bid payments, referral earnings, and
 * loyalty points balance, in one place. Deliberately does NOT duplicate
 * ReferralPage's full referral-tree UI -- it summarizes and links out to
 * it, same way it links to individual escrow/job threads instead of
 * re-implementing their detail views.
 *
 * Every number here comes from a table the signed-in user is already
 * entitled to read under existing RLS (escrow_transactions: tenant_id/
 * buyer_id/seller_id = auth.uid(); transactions: requester_id/
 * provider_id = auth.uid(); referral_transactions: referrer_id =
 * auth.uid(); loyalty_points: user_id = auth.uid()) -- no new policy or
 * RPC needed, this page only reads.
 *
 * 2026-09-10: added the Provider Earnings section (held / available /
 * withdrawn), backed by commission_wallet_ledger from
 * 20260909000004_dual_confirmation_and_wallet.sql. "Jobs earned" above
 * stays as-is deliberately -- it's the gross lifetime figure off
 * transactions.amount_cents and answers a different question ("how much
 * work have I done") than Provider Earnings does ("how much of that is
 * actually mine and where does it sit right now", net of commission).
 * Collapsing them into one number would lose one of those two answers.
 * commission_wallet_ledger rows are also merged into the activity feed below so the
 * feed stays a genuine single timeline instead of missing a source.
 *
 * Named commission_wallet_ledger, not wallet_ledger: a table called
 * wallet_ledger already existed for escrow payouts (escrow_id/recipient_id/
 * amount/currency/status/reference/paid_at, nothing like the columns used
 * here). Don't rename this back, it collides silently (CREATE TABLE IF NOT
 * EXISTS no-ops against the existing one) instead of raising an error at
 * creation time.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Wallet as WalletIcon, ShieldCheck, Clock, CheckCircle2, Gift, Star,
  ChevronRight, ArrowUpRight, ArrowDownLeft, Banknote, RotateCcw, Loader2, Landmark,
} from 'lucide-react'
import { loadWalletData, requestWithdrawal } from '@/data/walletRepository'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const fmt = (n = 0) => '₦' + Number(n || 0).toLocaleString()

const ESCROW_STATUS_META = {
  pending:          { label: 'Awaiting Payment', color: '#D4A853' },
  awaiting_payment: { label: 'Awaiting Payment', color: '#D4A853' },
  funded:           { label: 'Payment Confirmed', color: '#7A9E7E' },
  confirmed:        { label: 'Payment Confirmed', color: '#7A9E7E' },
  completed:        { label: 'Completed',        color: '#5B8DEF' },
  disputed:         { label: 'Disputed',         color: '#C94A3A' },
  cancelled:        { label: 'Cancelled',        color: '#647068' },
  refunded:         { label: 'Refunded',         color: '#647068' },
}
const TX_STATUS_META = {
  OPEN:      { label: 'Open',            color: '#D4A853' },
  PENDING:   { label: 'Awaiting Payment', color: '#D4A853' },
  FUNDED:    { label: 'Payment Confirmed',          color: '#7A9E7E' },
  COMPLETED: { label: 'Completed',       color: '#5B8DEF' },
  DISPUTED:  { label: 'Disputed',        color: '#C94A3A' },
  CANCELLED: { label: 'Cancelled',       color: '#647068' },
}
// commission_wallet_ledger.entry_type -> feed/section styling. 'released' and
// 'withdrawn' don't fire in production yet (release_held_payment() is
// still a stub, see the migration), shown here so the feed and the
// balance cards are already correct the moment they start arriving.
const WALLET_ENTRY_META = {
  held:      { label: 'Held',      icon: Clock,        color: '#D4A853' },
  released:  { label: 'Released',  icon: CheckCircle2, color: '#7A9E7E' },
  withdrawn: { label: 'Withdrawn', icon: Banknote,      color: '#5B8DEF' },
  reversed:  { label: 'Reversed',  icon: RotateCcw,     color: '#C94A3A' },
}

export default function WalletPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [escrows, setEscrows] = useState([])
  const [jobTxns, setJobTxns] = useState([])
  const [referralTotal, setReferralTotal] = useState(0)
  const [points, setPoints] = useState({ balance: 0 })
  const [ledger, setLedger] = useState([])
  const [pendingWithdrawal, setPendingWithdrawal] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [payoutAccount, setPayoutAccount] = useState(null)

  useEffect(() => { if (user?.id) load() }, [user?.id])

  const load = async () => {
    setLoading(true)
    const [escrowRes, txRes, refRes, ptsRes, ledgerRes, withdrawalRes, payoutRes] = await loadWalletData(user.id)
    setEscrows(escrowRes.data || [])
    setJobTxns(txRes.data || [])
    setReferralTotal((refRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0))
    setPoints(ptsRes.data || { balance: 0 })
    setLedger(ledgerRes.data || [])
    setPendingWithdrawal((withdrawalRes.data || [])[0] || null)
    setPayoutAccount(payoutRes.data || null)
    setLoading(false)
  }

  const summary = useMemo(() => {
    const heldInEscrow = escrows
      .filter(e => ['funded', 'confirmed'].includes(e.status))
      .reduce((s, e) => s + Number(e.gross_amount || 0), 0)
    const iAmReceiving = escrows
      .filter(e => e.seller_id === user?.id && ['funded', 'confirmed'].includes(e.status))
      .reduce((s, e) => s + Number(e.gross_amount || 0), 0)
    const jobsEarned = jobTxns
      .filter(t => t.provider_id === user?.id && t.status === 'COMPLETED')
      .reduce((s, t) => s + Number(t.amount_cents || 0) / 100, 0)
    return { heldInEscrow, iAmReceiving, jobsEarned }
  }, [escrows, jobTxns, user])

  // Net wallet position, from commission_wallet_ledger, in naira (fmt already adds ₦).
  // Held: confirmed by both sides, not yet released to your subaccount.
  // Available: released and not yet paid out or clawed back.
  const walletTotals = useMemo(() => {
    const cents = { held: 0, released: 0, withdrawn: 0, reversed: 0 }
    for (const e of ledger) cents[e.entry_type] = (cents[e.entry_type] || 0) + e.amount_cents
    const heldBalance      = Math.max(cents.held - cents.released - cents.reversed, 0) / 100
    const availableBalance = Math.max(cents.released - cents.withdrawn, 0) / 100
    const withdrawn        = cents.withdrawn / 100
    return { heldBalance, availableBalance, withdrawn, hasActivity: ledger.length > 0 }
  }, [ledger])

  const handleRequestWithdrawal = async () => {
    if (walletTotals.availableBalance <= 0 || pendingWithdrawal || requesting) return
    if (!window.confirm(`Request withdrawal of ${fmt(walletTotals.availableBalance)} to your saved bank account?`)) return

    setRequesting(true)
    const { data, error } = await requestWithdrawal(Math.round(walletTotals.availableBalance * 100))
    setRequesting(false)

    if (error) {
      toast.error(error.message?.includes('no verified payout account')
        ? "Add a verified payout account before requesting a withdrawal."
        : 'We couldn\'t submit your request. Please try again in a moment.')
      return
    }
    toast.success("Withdrawal requested. We'll notify you once it's paid.")
    setPendingWithdrawal(data)
  }

  const combinedFeed = useMemo(() => {
    const a = escrows.map(e => ({
      kind: 'escrow', id: e.id, at: e.confirmed_at,
      title: e.transaction_type === 'sale' ? 'Property sale protection' : e.transaction_type === 'hotel' ? 'Shortlet booking protection' : 'Rental protection',
      amount: e.gross_amount, direction: e.seller_id === user?.id ? 'in' : 'out',
      status: ESCROW_STATUS_META[e.status] || { label: e.status, color: '#647068' },
      link: '/escrow',
    }))
    const b = jobTxns.map(t => ({
      kind: 'job', id: t.id, at: t.created_at,
      title: t.model === 'MULTI_ATTRIBUTE_REVERSE' ? 'Job bid' : 'Service request',
      amount: t.amount_cents ? t.amount_cents / 100 : null, direction: t.provider_id === user?.id ? 'in' : 'out',
      status: TX_STATUS_META[t.status] || { label: t.status, color: '#647068' },
      link: `/jobs/${t.id}`,
    }))
    const c = ledger.map(e => {
      const meta = WALLET_ENTRY_META[e.entry_type] || WALLET_ENTRY_META.held
      return {
        kind: 'wallet', id: e.id, at: e.occurred_at,
        title: e.transactions?.description
          ? e.transactions.description.slice(0, 40) + (e.transactions.description.length > 40 ? '…' : '')
          : 'Job payment',
        amount: e.amount_cents / 100,
        direction: e.entry_type === 'withdrawn' || e.entry_type === 'reversed' ? 'out' : 'in',
        status: { label: meta.label, color: meta.color },
        link: e.transaction_id ? `/jobs/${e.transaction_id}` : '/wallet',
      }
    })
    return [...a, ...b, ...c].filter(x => x.at).sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 60)
  }, [escrows, jobTxns, ledger, user])

  // Grouped by calendar month for the history view, most recent month first.
  const feedByMonth = useMemo(() => {
    const groups = new Map()
    for (const item of combinedFeed) {
      const key = new Date(item.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(item)
    }
    return [...groups.entries()]
  }, [combinedFeed])

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F7F4ED' }}>
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF' }}>
          <ArrowLeft size={16} style={{ color: '#17211B' }} />
        </button>
        <h1 className="font-display text-lg font-black" style={{ color: '#17211B' }}>Wallet</h1>
      </div>

      {/* Balance cards */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#17211B' }}>
          <div className="flex items-center gap-2 mb-2"><ShieldCheck size={14} style={{ color: '#D4A853' }} /><p className="text-[11px] font-semibold" style={{ color: '#B5A99C' }}>Held under Protection</p></div>
          <p className="font-display text-xl font-black text-white">{loading ? ' - ' : fmt(summary.heldInEscrow)}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
          <div className="flex items-center gap-2 mb-2"><ArrowDownLeft size={14} style={{ color: '#7A9E7E' }} /><p className="text-[11px] font-semibold" style={{ color: '#647068' }}>You're receiving</p></div>
          <p className="font-display text-xl font-black" style={{ color: '#17211B' }}>{loading ? ' - ' : fmt(summary.iAmReceiving)}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
          <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={14} style={{ color: '#5B8DEF' }} /><p className="text-[11px] font-semibold" style={{ color: '#647068' }}>Jobs earned</p></div>
          <p className="font-display text-xl font-black" style={{ color: '#17211B' }}>{loading ? ' - ' : fmt(summary.jobsEarned)}</p>
        </div>
        <button onClick={() => navigate('/referral')} className="rounded-2xl p-4 text-left" style={{ backgroundColor: '#F0D4BE' }}>
          <div className="flex items-center gap-2 mb-2"><Gift size={14} style={{ color: '#C85F2D' }} /><p className="text-[11px] font-semibold" style={{ color: '#8B5E3C' }}>Referral earnings</p></div>
          <p className="font-display text-xl font-black" style={{ color: '#17211B' }}>{loading ? ' - ' : fmt(referralTotal)}</p>
        </button>
      </div>

      <button onClick={() => navigate('/referral')}
        className="mx-4 mb-5 w-[calc(100%-2rem)] rounded-2xl p-3.5 flex items-center justify-between"
        style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
        <div className="flex items-center gap-2">
          <Star size={15} style={{ color: '#D4A853' }} className="fill-current" />
          <span className="text-sm font-semibold" style={{ color: '#17211B' }}>{points?.balance || 0} loyalty points</span>
        </div>
        <ChevronRight size={15} style={{ color: '#647068' }} />
      </button>

      {/* Always visible, not gated on ledger activity -- a provider needs
          this before they can ever get a bid accepted, so it has to be
          findable before they have any earnings yet. */}
      <button onClick={() => navigate('/payout-setup')}
        className="mx-4 mb-5 w-[calc(100%-2rem)] rounded-2xl p-3.5 flex items-center justify-between"
        style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
        <div className="flex items-center gap-2">
          <Landmark size={15} style={{ color: '#C85F2D' }} />
          <span className="text-sm font-semibold" style={{ color: '#17211B' }}>
            {payoutAccount ? payoutAccount.bank_name : 'Payout account'}
          </span>
          {payoutAccount && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
              backgroundColor: (payoutAccount.status === 'verified' ? '#7A9E7E' : payoutAccount.status === 'rejected' ? '#C94A3A' : '#D4A853') + '22',
              color: payoutAccount.status === 'verified' ? '#7A9E7E' : payoutAccount.status === 'rejected' ? '#C94A3A' : '#D4A853',
            }}>
              {payoutAccount.status === 'verified' ? 'Verified' : payoutAccount.status === 'rejected' ? 'Needs changes' : 'Under review'}
            </span>
          )}
        </div>
        <ChevronRight size={15} style={{ color: '#647068' }} />
      </button>

      {/* Provider earnings: held / available / withdrawn from commission_wallet_ledger.
          Shown once there's ledger activity, so a pure buyer/tenant profile
          with no provider history isn't shown an empty payouts section. */}
      {!loading && walletTotals.hasActivity && (
        <div className="px-4 mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#647068' }}>Provider earnings</h2>

          <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: '#17211B' }}>
            <div className="flex items-center gap-2 mb-1">
              <WalletIcon size={14} style={{ color: '#D4A853' }} />
              <p className="text-[11px] font-semibold" style={{ color: '#B5A99C' }}>Available to withdraw</p>
            </div>
            <p className="font-display text-2xl font-black text-white">{fmt(walletTotals.availableBalance)}</p>

            {walletTotals.availableBalance === 0 && walletTotals.heldBalance > 0 && !pendingWithdrawal && (
              <p className="text-xs mt-2" style={{ color: '#647068' }}>
                Payouts aren't switched on yet. Your confirmed earnings sit in "Held" below until they are.
              </p>
            )}

            {pendingWithdrawal ? (
              <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#D8C9B8' }}>
                {fmt(pendingWithdrawal.amount_cents / 100)} requested {new Date(pendingWithdrawal.requested_at).toLocaleDateString()} · pending review
              </div>
            ) : (
              <button
                onClick={handleRequestWithdrawal}
                disabled={walletTotals.availableBalance <= 0 || requesting}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: '#FFF', color: '#17211B' }}
              >
                {requesting ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
                {requesting ? 'Submitting…' : 'Request withdrawal'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
              <div className="flex items-center gap-2 mb-2"><Clock size={13} style={{ color: '#D4A853' }} /><p className="text-[11px] font-semibold" style={{ color: '#647068' }}>Held</p></div>
              <p className="font-display text-lg font-black" style={{ color: '#17211B' }}>{fmt(walletTotals.heldBalance)}</p>
              <p className="text-[10px] mt-1" style={{ color: '#B5A99C' }}>Confirmed, release pending</p>
            </div>
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
              <div className="flex items-center gap-2 mb-2"><Banknote size={13} style={{ color: '#5B8DEF' }} /><p className="text-[11px] font-semibold" style={{ color: '#647068' }}>Withdrawn</p></div>
              <p className="font-display text-lg font-black" style={{ color: '#17211B' }}>{fmt(walletTotals.withdrawn)}</p>
              <p className="text-[10px] mt-1" style={{ color: '#B5A99C' }}>Paid to your bank, lifetime</p>
            </div>
          </div>
        </div>
      )}

      {/* Activity feed, grouped by month */}
      <div className="px-4">
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#647068' }}>Transaction history</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ backgroundColor: '#F0E5D8' }} />)}</div>
        ) : feedByMonth.length === 0 ? (
          <div className="text-center py-12">
            <WalletIcon size={32} className="mx-auto mb-3" style={{ color: '#D8C9B8' }} />
            <p className="text-sm font-semibold" style={{ color: '#17211B' }}>You don't have any transactions yet.</p>
            <p className="text-xs mt-1" style={{ color: '#647068' }}>Find a match to see your payments and activity here.</p>
          </div>
        ) : (
          feedByMonth.map(([month, items]) => (
            <div key={month} className="mb-5">
              <p className="text-[11px] font-bold mb-2 px-1" style={{ color: '#B5A99C' }}>{month}</p>
              <div className="space-y-2">
                {items.map(item => (
                  <button key={item.kind + item.id} onClick={() => navigate(item.link)}
                    className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: item.direction === 'in' ? 'rgba(122,158,126,0.15)' : 'rgba(200,95,45,0.1)' }}>
                      {item.direction === 'in' ? <ArrowDownLeft size={14} style={{ color: '#7A9E7E' }} /> : <ArrowUpRight size={14} style={{ color: '#C85F2D' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#17211B' }}>{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: item.status.color + '22', color: item.status.color }}>{item.status.label}</span>
                        <span className="text-[10px]" style={{ color: '#B5A99C' }}>{new Date(item.at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {item.amount != null && (
                      <p className="text-sm font-bold flex-shrink-0" style={{ color: item.direction === 'in' ? '#7A9E7E' : '#17211B' }}>
                        {item.direction === 'in' ? '+' : ''}{fmt(item.amount)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

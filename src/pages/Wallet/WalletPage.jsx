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
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeftIcon, ArrowLeftIcon, ArrowPathIcon, ArrowUpRightIcon, BanknotesIcon, BuildingLibraryIcon,
  CheckCircleIcon, ChevronRightIcon, ClockIcon, GiftIcon, ShieldCheckIcon, WalletIcon,
} from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/24/solid'
import { loadWalletData, requestWithdrawal } from '@/data/walletRepository'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const fmt = (n = 0) => '₦' + Number(n || 0).toLocaleString()

// Status chip looks, by tone.
const TONES = {
  warn:  'bg-gold/20 text-bark',
  good:  'bg-sage/20 text-forest',
  info:  'bg-sky/15 text-deep',
  bad:   'bg-danger/15 text-danger',
  quiet: 'bg-warm/15 text-warm',
}

const ESCROW_STATUS_META = {
  pending:          { label: 'Awaiting Payment',  tone: 'warn' },
  awaiting_payment: { label: 'Awaiting Payment',  tone: 'warn' },
  funded:           { label: 'Payment Confirmed', tone: 'good' },
  confirmed:        { label: 'Payment Confirmed', tone: 'good' },
  completed:        { label: 'Completed',         tone: 'info' },
  disputed:         { label: 'Disputed',          tone: 'bad' },
  cancelled:        { label: 'Cancelled',         tone: 'quiet' },
  refunded:         { label: 'Refunded',          tone: 'quiet' },
}
const TX_STATUS_META = {
  OPEN:      { label: 'Open',              tone: 'warn' },
  PENDING:   { label: 'Awaiting Payment',  tone: 'warn' },
  FUNDED:    { label: 'Payment Confirmed', tone: 'good' },
  COMPLETED: { label: 'Completed',         tone: 'info' },
  DISPUTED:  { label: 'Disputed',          tone: 'bad' },
  CANCELLED: { label: 'Cancelled',         tone: 'quiet' },
}
// commission_wallet_ledger.entry_type -> feed/section styling. 'released' and
// 'withdrawn' don't fire in production yet (release_held_payment() is
// still a stub, see the migration), shown here so the feed and the
// balance cards are already correct the moment they start arriving.
const WALLET_ENTRY_META = {
  held:      { label: 'Held',      tone: 'warn' },
  released:  { label: 'Released',  tone: 'good' },
  withdrawn: { label: 'Withdrawn', tone: 'info' },
  reversed:  { label: 'Reversed',  tone: 'bad' },
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'

// One small figure tile.
function Tile({ icon: Icon, iconClass, label, value, loading, onClick, warm = false, wide = false }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`rounded-[24px_24px_24px_8px] p-4 text-left ${wide ? 'col-span-2' : ''} ${warm ? 'border border-blush bg-blush/60' : glass} ${onClick ? `transition-transform hover:-translate-y-0.5 ${focusRing}` : ''}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 ${iconClass}`} aria-hidden="true" />
        <p className="text-[11px] font-bold text-warm">{label}</p>
      </div>
      <p className="font-display text-xl text-deep">{loading ? '–' : value}</p>
    </Tag>
  )
}

// A full-width link row (loyalty points, payout account).
function LinkRow({ icon: Icon, iconClass, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`mb-3 flex w-full items-center justify-between gap-3 rounded-[22px_22px_22px_8px] p-3.5 text-left transition-transform hover:-translate-y-0.5 ${glass} ${focusRing}`}>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <Icon className={`h-5 w-5 flex-shrink-0 ${iconClass}`} aria-hidden="true" />
        {children}
      </span>
      <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-warm" aria-hidden="true" />
    </button>
  )
}

export default function WalletPage() {
  const confirm = useConfirm()
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
    if (!(await confirm({ title: `Request withdrawal of ${fmt(walletTotals.availableBalance)}?`, message: 'It will be sent to your saved bank account.', confirmLabel: 'Request withdrawal' }))) return

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
      status: ESCROW_STATUS_META[e.status] || { label: e.status, tone: 'quiet' },
      link: '/escrow',
    }))
    const b = jobTxns.map(t => ({
      kind: 'job', id: t.id, at: t.created_at,
      title: t.model === 'MULTI_ATTRIBUTE_REVERSE' ? 'Job bid' : 'Service request',
      amount: t.amount_cents ? t.amount_cents / 100 : null, direction: t.provider_id === user?.id ? 'in' : 'out',
      status: TX_STATUS_META[t.status] || { label: t.status, tone: 'quiet' },
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
        status: { label: meta.label, tone: meta.tone },
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

  const payoutTone = payoutAccount?.status === 'verified' ? 'good' : payoutAccount?.status === 'rejected' ? 'bad' : 'warn'
  const payoutLabel = payoutAccount?.status === 'verified' ? 'Verified' : payoutAccount?.status === 'rejected' ? 'Needs changes' : 'Under review'
  const showEarnings = !loading && walletTotals.hasActivity

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream pb-28 text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 top-[28rem] h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-5 flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} aria-label="Go back"
            className={`flex h-10 w-10 items-center justify-center rounded-full ${glass} ${focusRing}`}>
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="font-display text-3xl">Wallet</h1>
        </div>

        {/* Main balance: what you can withdraw once you have earnings, otherwise what is held for you */}
        <section className="relative mb-4 overflow-hidden rounded-[36px_36px_36px_12px] bg-deep p-6 text-white shadow-soft" aria-label="Main balance">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-[60%_40%_55%_45%] bg-terracotta/40 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-[45%_55%_40%_60%] bg-forest/60 blur-2xl" />
          <div className="relative">
            <p className="mb-1 flex items-center gap-2 text-xs font-bold text-white/70">
              {showEarnings
                ? <><WalletIcon className="h-4 w-4 text-gold" aria-hidden="true" /> Available to withdraw</>
                : <><ShieldCheckIcon className="h-4 w-4 text-gold" aria-hidden="true" /> Held under Protection</>}
            </p>
            <p className="font-display text-4xl">
              {loading ? '–' : fmt(showEarnings ? walletTotals.availableBalance : summary.heldInEscrow)}
            </p>

            {showEarnings && walletTotals.availableBalance === 0 && walletTotals.heldBalance > 0 && !pendingWithdrawal ? (
              <p className="mt-2 text-xs text-white/70">
                Payouts aren&apos;t switched on yet. Your confirmed earnings sit in &quot;Held&quot; below until they are.
              </p>
            ) : null}

            {showEarnings ? (
              pendingWithdrawal ? (
                <div role="status" className="mt-4 rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs text-white/80">
                  {fmt(pendingWithdrawal.amount_cents / 100)} requested {new Date(pendingWithdrawal.requested_at).toLocaleDateString()} · pending review
                </div>
              ) : (
                <button type="button" onClick={handleRequestWithdrawal}
                  disabled={walletTotals.availableBalance <= 0 || requesting}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-deep transition-colors hover:bg-cream disabled:opacity-40">
                  {requesting ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BanknotesIcon className="h-4 w-4" aria-hidden="true" />}
                  {requesting ? 'Submitting…' : 'Request withdrawal'}
                </button>
              )
            ) : null}
          </div>
        </section>

        {/* Figures */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {showEarnings ? (
            <Tile icon={ShieldCheckIcon} iconClass="text-gold" label="Held under Protection" value={fmt(summary.heldInEscrow)} loading={loading} />
          ) : null}
          <Tile icon={ArrowDownLeftIcon} iconClass="text-sage" label="You're receiving" value={fmt(summary.iAmReceiving)} loading={loading} />
          <Tile icon={CheckCircleIcon} iconClass="text-sky" label="Jobs earned" value={fmt(summary.jobsEarned)} loading={loading} />
          <Tile icon={GiftIcon} iconClass="text-terracotta" label="Referral earnings" value={fmt(referralTotal)} loading={loading} warm wide={!showEarnings} onClick={() => navigate('/referral')} />
        </div>

        <LinkRow icon={StarIcon} iconClass="text-gold" onClick={() => navigate('/referral')}>
          <span className="text-sm font-bold">{points?.balance || 0} loyalty points</span>
        </LinkRow>

        {/* Always visible, not gated on ledger activity -- a provider needs
            this before they can ever get a bid accepted, so it has to be
            findable before they have any earnings yet. */}
        <LinkRow icon={BuildingLibraryIcon} iconClass="text-terracotta" onClick={() => navigate('/payout-setup')}>
          <span className="text-sm font-bold">{payoutAccount ? payoutAccount.bank_name : 'Payout account'}</span>
          {payoutAccount ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONES[payoutTone]}`}>{payoutLabel}</span>
          ) : <span className="text-xs text-warm">Add one to get paid</span>}
        </LinkRow>

        {/* Provider earnings: held / withdrawn from commission_wallet_ledger.
            Shown once there's ledger activity, so a pure buyer/tenant profile
            with no provider history isn't shown an empty payouts section. */}
        {showEarnings ? (
          <section className="mb-6" aria-label="Provider earnings">
            <h2 className="mb-3 mt-5 text-xs font-bold uppercase tracking-wider text-warm">Provider earnings</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
                <div className="mb-2 flex items-center gap-2"><ClockIcon className="h-4 w-4 text-gold" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">Held</p></div>
                <p className="font-display text-xl">{fmt(walletTotals.heldBalance)}</p>
                <p className="mt-1 text-[11px] text-warm">Confirmed, release pending</p>
              </div>
              <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
                <div className="mb-2 flex items-center gap-2"><BanknotesIcon className="h-4 w-4 text-sky" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">Withdrawn</p></div>
                <p className="font-display text-xl">{fmt(walletTotals.withdrawn)}</p>
                <p className="mt-1 text-[11px] text-warm">Paid to your bank, lifetime</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Activity feed, grouped by month */}
        <section aria-label="Transaction history" className="mt-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-warm">Transaction history</h2>
          {loading ? (
            <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-[22px_22px_22px_8px] bg-sand" />)}</div>
          ) : feedByMonth.length === 0 ? (
            <div className={`rounded-[28px_28px_28px_10px] px-6 py-10 text-center ${glass}`}>
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[20px_20px_20px_6px] bg-orange-pale text-terracotta">
                <WalletIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold">You don&apos;t have any transactions yet.</p>
              <p className="mt-1 text-xs text-warm">Find a match to see your payments and activity here.</p>
            </div>
          ) : (
            feedByMonth.map(([month, items]) => (
              <div key={month} className="mb-5">
                <p className="mb-2 px-1 text-[11px] font-bold text-warm">{month}</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <button key={item.kind + item.id} type="button" onClick={() => navigate(item.link)}
                      className={`flex w-full items-center gap-3 rounded-[22px_22px_22px_8px] p-3.5 text-left transition-transform hover:-translate-y-0.5 ${glass} ${focusRing}`}>
                      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${item.direction === 'in' ? 'bg-sage/20 text-forest' : 'bg-orange-pale text-terracotta'}`}>
                        {item.direction === 'in' ? <ArrowDownLeftIcon className="h-5 w-5" aria-hidden="true" /> : <ArrowUpRightIcon className="h-5 w-5" aria-hidden="true" />}
                        <span className="sr-only">{item.direction === 'in' ? 'Money in' : 'Money out'}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{item.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONES[item.status.tone] || TONES.quiet}`}>{item.status.label}</span>
                          <span className="text-[10px] text-warm">{new Date(item.at).toLocaleDateString()}</span>
                        </span>
                      </span>
                      {item.amount != null ? (
                        <span className={`flex-shrink-0 text-sm font-bold ${item.direction === 'in' ? 'text-forest' : 'text-deep'}`}>
                          {item.direction === 'in' ? '+' : ''}{fmt(item.amount)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

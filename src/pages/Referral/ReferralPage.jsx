/**
 * ReferralPage - /referral
 *
 * Shows a person what they have earned from the people they invited, what is still on hold, what
 * tax was held back, and exactly how the programme pays. Every rate on this page is read from the
 * live referral settings (Admin > Referral Settings), never written into the page.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon, BanknotesIcon, CheckCircleIcon, ClipboardDocumentIcon, ClockIcon, GiftIcon,
  ShareIcon, SparklesIcon, UserGroupIcon,
} from '@heroicons/react/24/outline'
import { saveInviteCode, loadReferralOverview } from '@/data/referralRepository'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const naira = (n = 0) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'

const TYPE_LABELS = {
  property_sale: 'Property sale',
  rental: 'Rental',
  hotel: 'Hotel or short-let',
  escrow: 'Protected payment',
  subscription: 'Professional subscription',
}

const TONES = {
  warn: 'bg-gold/20 text-bark',
  good: 'bg-sage/20 text-forest',
  quiet: 'bg-warm/15 text-warm',
}

// What to tell the person about one reward row.
function describe(r) {
  if (r.payout_type === 'points') return { label: `${r.points_awarded || 1} unlock credit${r.points_awarded > 1 ? 's' : ''}`, tone: 'good', note: 'Added to your unlock credits' }
  if (r.status === 'cancelled') return { label: 'Cancelled', tone: 'quiet', note: 'The payment was refunded or reversed' }
  if (r.status === 'confirmed' || r.status === 'paid_out') return { label: 'In your wallet', tone: 'good', note: r.released_at ? `Released ${new Date(r.released_at).toLocaleDateString('en-NG')}` : '' }
  if (r.needs_review) return { label: 'Under review', tone: 'warn', note: 'Over the monthly limit, a team member is checking it' }
  const when = r.eligible_at ? new Date(r.eligible_at).toLocaleDateString('en-NG') : ''
  return { label: 'On hold', tone: 'warn', note: when ? `Releases from ${when} if you are verified and have a payout account` : 'Waiting for the dispute period to end' }
}

export default function ReferralPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [rows, setRows] = useState([])
  const [invited, setInvited] = useState(0)
  const [cfg, setCfg] = useState({})
  const [founding, setFounding] = useState(null)
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState(profile?.invite_code || '')

  const inviteUrl = 'https://www.dealmatch.com.ng/auth?ref=' + inviteCode

  useEffect(() => { if (user?.id) load() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true)
    try {
      let code = profile?.invite_code
      if (!code) {
        const newCode = 'DM' + Math.random().toString(36).slice(2, 8).toUpperCase()
        const { data } = await saveInviteCode(user.id, newCode)
        code = data?.invite_code || newCode
      }
      setInviteCode(code)
      const [rewardsRes, countRes, cfgRes, foundingRes, creditRes] = await loadReferralOverview(user.id)
      setRows(rewardsRes.data || [])
      setInvited(countRes.count || 0)
      setCfg(Object.fromEntries((cfgRes.data || []).map(s => [s.key, Number(s.value)])))
      setFounding(foundingRes.data || null)
      setCredits(Number(creditRes.data) || 0)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const totals = useMemo(() => {
    const cash = rows.filter(r => r.payout_type === 'cash')
    const sum = (list, f) => list.reduce((s, r) => s + Number(f(r) || 0), 0)
    return {
      inWallet: sum(cash.filter(r => r.status === 'confirmed' || r.status === 'paid_out'), r => r.net_amount ?? r.referral_earning),
      onHold: sum(cash.filter(r => r.status === 'pending'), r => r.referral_earning),
      tax: sum(cash.filter(r => r.status === 'confirmed' || r.status === 'paid_out'), r => r.wht_amount),
    }
  }, [rows])

  // Active referrals: people you invited who paid for something in the last 90 days.
  const active = useMemo(() => {
    const since = Date.now() - 90 * 86400000
    return new Set(rows.filter(r => r.referral_level === 1 && r.status !== 'cancelled' && new Date(r.created_at).getTime() > since).map(r => r.referee_id)).size
  }, [rows])

  const tier = useMemo(() => {
    const foundingOn = founding?.until && new Date(founding.until) > new Date()
    let name = 'Starter'; let pct = cfg.l1_pct || 0; let next = cfg.builder_min_active; let nextName = 'Builder'
    if (active >= cfg.champion_min_active) { name = 'Champion'; pct = cfg.champion_l1_pct; next = null }
    else if (active >= cfg.builder_min_active) { name = 'Builder'; pct = cfg.builder_l1_pct; next = cfg.champion_min_active; nextName = 'Champion' }
    if (foundingOn && cfg.founding_l1_pct > pct) { name = name + ' · Founding Ambassador'; pct = cfg.founding_l1_pct }
    return { name, pct, toNext: next ? Math.max(next - active, 0) : null, nextName }
  }, [active, cfg, founding])

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); toast.success('Invite link copied.') }
    catch { toast.error('Could not copy. Select the link and copy it by hand.') }
  }
  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Join DealMatch', text: 'Find verified places and people you can trust. Use my link:', url: inviteUrl }) } catch { copyLink() }
    } else { copyLink() }
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <button type="button" onClick={() => navigate(-1)} className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-warm ${focusRing}`}>
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back
        </button>

        <div className={`mb-4 rounded-[40px_40px_40px_12px] p-5 ${glass}`}>
          <div className="mb-1 flex items-center gap-2"><GiftIcon className="h-5 w-5 text-terracotta" aria-hidden="true" /><h1 className="font-display text-2xl text-deep">Invite and earn</h1></div>
          <p className="mb-4 text-sm text-warm">When someone you invite pays DealMatch a fee, you earn a share of what DealMatch earns. Never from their deal price.</p>
          <div className="mb-3 break-all rounded-2xl bg-cream px-3 py-3 text-sm font-semibold text-deep" data-testid="invite-link">{inviteUrl}</div>
          <div className="flex gap-2">
            <button type="button" onClick={copyLink} className={`flex flex-1 items-center justify-center gap-2 rounded-full bg-deep px-4 py-3 text-sm font-bold text-white ${focusRing}`}>
              <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" /> Copy link
            </button>
            <button type="button" onClick={shareLink} className={`flex flex-1 items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-3 text-sm font-bold text-white ${focusRing}`}>
              <ShareIcon className="h-4 w-4" aria-hidden="true" /> Share
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
            <div className="mb-1 flex items-center gap-2"><BanknotesIcon className="h-4 w-4 text-forest" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">In your wallet</p></div>
            <p className="font-display text-xl text-deep">{loading ? '–' : naira(totals.inWallet)}</p>
            {totals.tax > 0 && <p className="mt-1 text-[11px] text-warm">After {naira(totals.tax)} withholding tax</p>}
          </div>
          <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
            <div className="mb-1 flex items-center gap-2"><ClockIcon className="h-4 w-4 text-gold" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">On hold</p></div>
            <p className="font-display text-xl text-deep">{loading ? '–' : naira(totals.onHold)}</p>
            <p className="mt-1 text-[11px] text-warm">Before tax</p>
          </div>
          <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
            <div className="mb-1 flex items-center gap-2"><UserGroupIcon className="h-4 w-4 text-terracotta" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">People invited</p></div>
            <p className="font-display text-xl text-deep">{loading ? '–' : invited}</p>
            <p className="mt-1 text-[11px] text-warm">{active} active in the last 90 days</p>
          </div>
          <div className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
            <div className="mb-1 flex items-center gap-2"><SparklesIcon className="h-4 w-4 text-gold" aria-hidden="true" /><p className="text-[11px] font-bold text-warm">Unlock credits</p></div>
            <p className="font-display text-xl text-deep">{loading ? '–' : credits}</p>
            <p className="mt-1 text-[11px] text-warm">Use them to unlock contacts</p>
          </div>
        </div>

        {cfg.l1_pct != null && (
          <div className={`mb-4 rounded-[32px_32px_32px_10px] p-5 ${glass}`}>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-warm">Your level</p>
            <p className="font-display text-lg text-deep">{tier.name}: you earn {tier.pct}% on people you invite</p>
            {tier.toNext != null && <p className="mt-1 text-sm text-warm">{tier.toNext} more active referral{tier.toNext === 1 ? '' : 's'} to reach {tier.nextName}.</p>}
          </div>
        )}

        {cfg.l1_pct != null && (
          <div className={`mb-4 rounded-[32px_32px_32px_10px] p-5 ${glass}`}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-warm">How you earn</p>
            <ul className="space-y-2.5 text-sm text-deep">
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>You earn {cfg.l1_pct}% of DealMatch&apos;s fee when someone you invited pays, {cfg.l2_pct}% when someone they invited pays, and {cfg.l3_pct}% one level further.</span></li>
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>You and the person you invite each get {cfg.activation_credits} unlock credits when their identity is verified.</span></li>
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>Rewards stay on hold for {cfg.hold_days} days in case of a refund or dispute, then go to your wallet. You need to be identity-verified and have a verified payout account.</span></li>
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>Smaller deals (DealMatch fee under {naira(cfg.small_deal_naira)}) earn you {cfg.small_deal_credits} unlock credit instead of cash. Cash rewards below {naira(cfg.min_payout_naira)} are not paid.</span></li>
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>Rewards run for {cfg.attribution_months} months after the person joins, and for {cfg.subscription_months} months on a professional subscription.</span></li>
              <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-sage" aria-hidden="true" /><span>No reward when you are one of the people in the deal. If a payment is refunded, its reward is cancelled.</span></li>
            </ul>
          </div>
        )}

        <div className={`rounded-[32px_32px_32px_10px] p-5 ${glass}`}>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-warm">Your rewards</p>
          {!loading && rows.length === 0 && <p className="text-sm text-warm">Nothing yet. Share your link, and rewards appear here when the people you invite pay.</p>}
          <div className="divide-y divide-warm/10">
            {rows.map(r => {
              const d = describe(r)
              const isCash = r.payout_type === 'cash'
              return (
                <div key={r.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-deep">{TYPE_LABELS[r.transaction_type] || 'Payment'} · Level {r.referral_level}</p>
                    <p className="text-[11px] text-warm">{d.note}</p>
                    {isCash && Number(r.wht_amount) > 0 && <p className="text-[11px] text-warm">{naira(r.referral_earning)} less {naira(r.wht_amount)} withholding tax</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {isCash && <p className="text-sm font-bold text-deep">{naira(r.net_amount ?? r.referral_earning)}</p>}
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${TONES[d.tone]}`}>{d.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button type="button" onClick={() => navigate('/wallet')} className={`mt-4 w-full rounded-full border border-deep/15 px-4 py-3 text-sm font-bold text-deep ${focusRing}`}>
          Go to my wallet
        </button>
      </div>
    </div>
  )
}

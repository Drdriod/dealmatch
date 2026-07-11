/**
 * ReferralPage - /referral
 * 3-level cash chain + loyalty points system
 * Level 1: 8% | Level 2: 4% | Level 3: 2% | Level 4+: Points
 * 100 points = ₦10,000 cash
 */
import { useState, useEffect } from 'react'
import { Check, ChevronRight, Copy, Gift, Home, Hotel, Share2, Star, TrendingUp, Users, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { pointsToCash, MIN_REDEEM_POINTS, redeemPoints, POINTS_CASH_VALUE, POINTS_TO_CASH_RATE } from '@/lib/referral'
import toast from 'react-hot-toast'

const fmt = (n = 0) => 'N' + Number(n || 0).toLocaleString()

const LEVEL_CONFIG = [
  { level: 1, rate: '8%',  type: 'cash',   color: '#C96A3A', label: 'Direct Referral' },
  { level: 2, rate: '4%',  type: 'cash',   color: '#D4A853', label: 'Level 2' },
  { level: 3, rate: '2%',  type: 'cash',   color: '#7A9E7E', label: 'Level 3' },
  { level: 4, rate: '60pts', type: 'points', color: '#5B8DEF', label: 'Level 4+' },
]

const STATUS_META = {
  pending:          { label: 'Pending',   color: '#D4A853' },
  confirmed:        { label: 'Confirmed', color: '#7A9E7E' },
  paid_out:         { label: 'Paid Out',  color: '#5B8DEF' },
  cancelled:        { label: 'Cancelled', color: '#888' },
}

const TYPE_LABELS = {
  property_sale:    'Property Sale',
  rental:           'Rental',
  hotel:            'Hotel/Short-let',
  escrow:           'Escrow',
  subscription:     'Pro Subscription',
  points_redemption:'Points Redeemed',
}

export default function ReferralPage() {
  const { user, profile } = useAuth()
  const [tab, setTab]           = useState('earn')
  const [earnings, setEarnings] = useState([])
  const [points, setPoints]     = useState({ balance: 0, lifetime: 0, redeemed: 0 })
  const [stats, setStats]       = useState({ total: 0, pending: 0, paid_out: 0, referees: 0 })
  const [loading, setLoading]   = useState(true)
  const [copied, setCopied]     = useState(false)
  const [redeemAmt, setRedeemAmt] = useState(100)
  const [redeeming, setRedeeming] = useState(false)
  const [inviteCode, setInviteCode] = useState(profile?.invite_code || '')

  const baseUrl   = 'https://www.dealmatch.com.ng'
  const inviteUrl = baseUrl + '/auth?ref=' + inviteCode

  useEffect(() => { if (user?.id) loadData() }, [user?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      // Ensure invite code exists
      let code = profile?.invite_code
      if (!code) {
        const newCode = 'DM' + Math.random().toString(36).slice(2, 8).toUpperCase()
        const { data } = await supabase.from('profiles')
          .update({ invite_code: newCode }).eq('id', user.id)
          .select('invite_code').single()
        code = data?.invite_code || newCode
      }
      setInviteCode(code)

      const [txnsRes, countRes, ptsRes] = await Promise.all([
        supabase.from('referral_transactions').select('*')
          .eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .eq('invited_by', user.id),
        supabase.from('loyalty_points').select('*').eq('user_id', user.id).single(),
      ])

      const list = txnsRes.data || []
      setEarnings(list)
      setStats({
        total:    list.filter(t => t.status !== 'cancelled' && t.payout_type !== 'points')
                      .reduce((s, t) => s + (t.referral_earning || 0), 0),
        pending:  list.filter(t => t.status === 'pending' && t.payout_type === 'cash')
                      .reduce((s, t) => s + (t.referral_earning || 0), 0),
        paid_out: list.filter(t => t.status === 'paid_out')
                      .reduce((s, t) => s + (t.referral_earning || 0), 0),
        referees: countRes.count || 0,
      })

      if (ptsRes.data) {
        setPoints({
          balance:  ptsRes.data.points_balance || 0,
          lifetime: ptsRes.data.points_lifetime || 0,
          redeemed: ptsRes.data.points_redeemed || 0,
        })
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopied(false), 2500)
  }

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join DealMatch',
          text: 'Find verified properties in Nigeria. Use my link:',
          url: inviteUrl,
        })
      } catch { copyLink() }
    } else { copyLink() }
  }

  const handleRedeem = async () => {
    if (redeemAmt < MIN_REDEEM_POINTS) {
      toast.error('Minimum redemption is 100 points')
      return
    }
    if (redeemAmt > points.balance) {
      toast.error('Insufficient points balance')
      return
    }
    setRedeeming(true)
    const result = await redeemPoints(user.id, redeemAmt)
    setRedeeming(false)
    if (result.success) {
      toast.success('Redemption request submitted! ' + fmt(result.cashValue) + ' will be paid within 3-5 days.')
      loadData()
    } else {
      toast.error(result.error || 'Redemption failed')
    }
  }

  const ago = (ts) => {
    if (!ts) return ''
    const s = (Date.now() - new Date(ts)) / 1000
    if (s < 3600) return Math.floor(s / 60) + 'm ago'
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div style={{ backgroundColor: '#FFFAF5', minHeight: '100vh', paddingTop: 72, paddingBottom: 40 }}>
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display font-black text-2xl mb-1" style={{ color: '#1A1210' }}>
            Earn with DealMatch
          </h1>
          <p className="text-sm" style={{ color: '#8A7E78' }}>
            Share your link. Earn cash and points when your network closes deals.
          </p>
        </div>

        {/* Invite card */}
        <div className="rounded-2xl p-5 mb-5" style={{ backgroundColor: '#1A1210' }}>
          <div className="flex items-center gap-2 mb-2">
            <Gift size={14} style={{ color: '#D4A853' }} />
            <p className="text-xs font-bold" style={{ color: '#D4A853' }}>YOUR INVITE LINK</p>
          </div>
          <p className="text-xs mb-4 font-mono break-all" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {inviteCode ? inviteUrl : 'Generating...'}
          </p>
          <div className="flex gap-2">
            <button onClick={copyLink}
              className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: copied ? '#7A9E7E' : '#C96A3A', color: '#fff' }}>
              {copied ? <><Check size={14} />Copied!</> : <><Copy size={14} />Copy Link</>}
            </button>
            <button onClick={shareLink}
              className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: 'Cash Earned',    value: fmt(stats.total),    icon: TrendingUp, color: '#7A9E7E' },
            { label: 'Pending Cash',   value: fmt(stats.pending),  icon: Zap,        color: '#D4A853' },
            { label: 'Points Balance', value: points.balance + ' pts', icon: Star,   color: '#C96A3A' },
            { label: 'People Invited', value: stats.referees,      icon: Users,      color: '#5B8DEF' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4"
              style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <s.icon size={13} style={{ color: s.color }} />
                <span className="text-xs font-semibold" style={{ color: 'rgba(26,18,16,0.4)' }}>{s.label}</span>
              </div>
              <p className="font-black text-xl" style={{ color: '#1A1210' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {[
            { id: 'earn',   label: 'How to Earn' },
            { id: 'points', label: 'My Points' },
            { id: 'history',label: 'History' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
              style={{
                backgroundColor: tab === t.id ? '#1A1210' : '#FFFFFF',
                color: tab === t.id ? '#FFFFFF' : '#5C4A3A',
                borderColor: tab === t.id ? '#1A1210' : '#E8DDD2',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* HOW TO EARN TAB */}
        {tab === 'earn' && (
          <div className="space-y-3">
            {/* Chain explanation */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(201,106,58,0.05)', border: '1px solid rgba(201,106,58,0.15)' }}>
              <p className="text-xs font-bold mb-3" style={{ color: '#C96A3A' }}>
                HOW THE EARNING CHAIN WORKS
              </p>
              <div className="space-y-3">
                {LEVEL_CONFIG.map(cfg => (
                  <div key={cfg.level} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                      style={{ backgroundColor: cfg.color + '20', color: cfg.color }}>
                      L{cfg.level}{cfg.level === 4 ? '+' : ''}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold" style={{ color: '#1A1210' }}>{cfg.label}</p>
                      <p className="text-xs" style={{ color: '#8A7E78' }}>
                        {cfg.type === 'cash'
                          ? cfg.rate + ' of DealMatch commission - paid as cash'
                          : 'Loyalty points - convert to cash anytime'}
                      </p>
                    </div>
                    <span className="text-sm font-black" style={{ color: cfg.color }}>{cfg.rate}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Example */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
              <p className="text-xs font-bold mb-3" style={{ color: '#1A1210' }}>
                EXAMPLE: One N60M Property Sale
              </p>
              <p className="text-xs mb-3" style={{ color: '#8A7E78' }}>
                DealMatch earns N900,000 commission. Here is what your chain earns:
              </p>
              {[
                { who: 'You (Level 1)',         earns: 'N72,000 cash' },
                { who: 'Person who referred you (L2)', earns: 'N36,000 cash' },
                { who: 'Their referrer (L3)',   earns: 'N18,000 cash' },
                { who: 'L4 referrer',           earns: '60 points = N6,000' },
                { who: 'L5 referrer',           earns: '40 points = N4,000' },
                { who: 'L6+ referrers',         earns: '25pts down to 2pts' },
              ].map((r, i) => (
                <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid rgba(26,18,16,0.05)' }}>
                  <span className="text-xs" style={{ color: '#5C4A3A' }}>{r.who}</span>
                  <span className="text-xs font-bold" style={{ color: '#C96A3A' }}>{r.earns}</span>
                </div>
              ))}
            </div>

            {/* Tiered payout explanation - why small deals pay differently */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(212,168,83,0.07)', border: '1px solid rgba(212,168,83,0.25)' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#A8853F' }}>
                CASH OR POINTS? IT DEPENDS ON THE DEAL SIZE
              </p>
              <p className="text-xs leading-relaxed mb-3" style={{ color: '#5C4A3A' }}>
                Your payout type is based on how much DealMatch itself earns from the deal,
                not the price of the property or booking. Bigger deals mean a bigger DealMatch
                commission, which means cash for you. Smaller deals still reward you, just in points.
              </p>
              <div className="space-y-2">
                {[
                  { range: 'DealMatch earns N50,000+',        result: 'Full cash chain: 8% / 4% / 2%' },
                  { range: 'DealMatch earns N5,000 – N49,999', result: 'Flat N500 cash for L1, L2, L3' },
                  { range: 'DealMatch earns under N5,000',     result: 'Points only - no cash, but it adds up' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl"
                    style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}>
                    <span className="text-xs" style={{ color: '#5C4A3A' }}>{row.range}</span>
                    <span className="text-xs font-bold text-right" style={{ color: '#A8853F', maxWidth: '50%' }}>{row.result}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: '#8A7E78' }}>
                Example: a hotel booking usually earns DealMatch a small commission, so it pays
                points. A property sale or large rental earns DealMatch much more, so it pays full cash.
              </p>
            </div>

            {/* Points explanation */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(91,141,239,0.05)', border: '1px solid rgba(91,141,239,0.2)' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#5B8DEF' }}>
                HOW POINTS CONVERT TO CASH
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#5C4A3A' }}>
                Every deal closed in your deep network (Level 4+) earns you points automatically.
                Points accumulate in your wallet. When you reach 100 points, you can redeem
                them for N10,000 cash paid to your bank account.
              </p>
              <div className="mt-3 flex items-center gap-2 p-2 rounded-xl"
                style={{ backgroundColor: 'rgba(91,141,239,0.08)' }}>
                <Star size={12} style={{ color: '#5B8DEF' }} />
                <p className="text-xs font-bold" style={{ color: '#5B8DEF' }}>
                  100 points = N10,000 cash. No expiry. Accumulates forever.
                </p>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
              <p className="text-xs font-bold mb-1" style={{ color: '#1A1210' }}>
                IMPORTANT
              </p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>
                You earn nothing just from sign-ups. All earnings are triggered only when a referred
                user completes a real, paying transaction on DealMatch. No deal, no payment.
              </p>
            </div>
          </div>
        )}


        {/* POINTS TAB */}
        {tab === 'points' && (
          <div className="space-y-4">
            {/* Balance card */}
            <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#1A1210' }}>
              <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                POINTS BALANCE
              </p>
              <p className="font-display font-black text-5xl mb-1" style={{ color: '#D4A853' }}>
                {points.balance}
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                points available
              </p>
              <div className="mt-4 flex justify-center gap-6">
                <div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Lifetime</p>
                  <p className="font-bold text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {points.lifetime} pts
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Redeemed</p>
                  <p className="font-bold text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {points.redeemed} pts
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Cash Value</p>
                  <p className="font-bold text-sm" style={{ color: '#7A9E7E' }}>
                    {fmt(pointsToCash(points.balance))}
                  </p>
                </div>
              </div>
            </div>

            {/* Redeem */}
            {points.balance >= MIN_REDEEM_POINTS ? (
              <div className="rounded-2xl p-4" style={{ border: '1px solid #E8DDD2', backgroundColor: '#FFFAF5' }}>
                <p className="text-sm font-bold mb-3" style={{ color: '#1A1210' }}>
                  Redeem Points for Cash
                </p>
                <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>
                  Choose how many points to redeem. Must be in multiples of 100.
                  Each 100 points = N10,000 cash to your bank account.
                </p>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setRedeemAmt(Math.max(100, redeemAmt - 100))}
                    className="w-10 h-10 rounded-xl font-bold text-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(26,18,16,0.06)', color: '#1A1210' }}>
                    -
                  </button>
                  <div className="flex-1 text-center">
                    <p className="font-black text-2xl" style={{ color: '#C96A3A' }}>
                      {redeemAmt} pts
                    </p>
                    <p className="text-xs" style={{ color: '#8A7E78' }}>
                      = {fmt(pointsToCash(redeemAmt))} cash
                    </p>
                  </div>
                  <button
                    onClick={() => setRedeemAmt(Math.min(points.balance, redeemAmt + 100))}
                    className="w-10 h-10 rounded-xl font-bold text-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(201,106,58,0.1)', color: '#C96A3A' }}>
                    +
                  </button>
                </div>
                <button
                  onClick={handleRedeem}
                  disabled={redeeming || redeemAmt > points.balance}
                  className="w-full py-3.5 rounded-xl text-sm font-bold"
                  style={{
                    backgroundColor: redeeming ? 'rgba(26,18,16,0.08)' : '#C96A3A',
                    color: redeeming ? '#8A7E78' : '#fff',
                  }}>
                  {redeeming ? 'Processing...' : 'Redeem ' + redeemAmt + ' pts for ' + fmt(pointsToCash(redeemAmt))}
                </button>
                <p className="text-xs text-center mt-2" style={{ color: '#8A7E78' }}>
                  Paid to your bank account within 3-5 business days
                </p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 text-center" style={{ border: '1px dashed #E8DDD2' }}>
                <Star size={24} style={{ color: '#D4A853', margin: '0 auto 8px' }} />
                <p className="text-sm font-bold mb-1" style={{ color: '#1A1210' }}>
                  {MIN_REDEEM_POINTS - points.balance} more points to redeem
                </p>
                <p className="text-xs" style={{ color: '#8A7E78' }}>
                  Minimum redemption is 100 points (N10,000).
                  Keep building your network to earn more.
                </p>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {loading ? (
              <div className="py-10 text-center">
                <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin mx-auto"
                  style={{ borderTopColor: '#C96A3A' }} />
              </div>
            ) : earnings.length === 0 ? (
              <div className="rounded-2xl p-8 text-center"
                style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px dashed #E8DDD2' }}>
                <div className="flex justify-center mb-2"><Home size={32} className="text-terracotta" /></div>
                <p className="text-sm font-bold mb-1" style={{ color: '#1A1210' }}>No earnings yet</p>
                <p className="text-xs" style={{ color: '#8A7E78' }}>
                  Share your link. Earnings appear here when referred users close deals.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {earnings.map(t => {
                  const meta = STATUS_META[t.status] || { label: t.status, color: '#888' }
                  const isPoints = t.payout_type === 'points'
                  return (
                    <div key={t.id} className="rounded-2xl p-4 flex items-center justify-between"
                      style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>
                          {TYPE_LABELS[t.transaction_type] || t.transaction_type}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: meta.color + '15', color: meta.color }}>
                            {meta.label}
                          </span>
                          {t.referral_level && (
                            <span className="text-xs" style={{ color: '#8A7E78' }}>
                              Level {t.referral_level}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: '#8A7E78' }}>
                            {ago(t.created_at)}
                          </span>
                        </div>
                      </div>
                      <p className="font-black text-lg" style={{ color: isPoints ? '#5B8DEF' : '#1A1210' }}>
                        {isPoints
                          ? '+' + t.points_awarded + ' pts'
                          : fmt(t.referral_earning)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Payout note */}
            <div className="mt-5 rounded-2xl p-4"
              style={{ backgroundColor: 'rgba(91,141,239,0.05)', border: '1px solid rgba(91,141,239,0.15)' }}>
              <p className="text-xs font-bold mb-1" style={{ color: '#5B8DEF' }}>Payouts</p>
              <p className="text-xs" style={{ color: '#8A7E78' }}>
                Minimum cash payout: N5,000. Points minimum: 100 pts (N10,000).
                Paid to your registered bank account within 3-5 business days.
                Wondering why a transaction paid points instead of cash? Smaller deals earn
                DealMatch a smaller commission, so they pay points instead of cash. See
                "How to Earn" for the full breakdown.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

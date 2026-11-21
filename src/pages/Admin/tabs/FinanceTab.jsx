/**
 * Admin > Finance. What the business earned, what it owes and what needs attention.
 * Every figure comes from one database function (admin_finance_summary) and has its calculation
 * written under it. Costs that are not recorded show "Not recorded", never zero, so the screen
 * cannot show a profit that is not real.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { fetchFinanceSummary } from '@/data/financeRepository'
import { Spinner } from '../shared'

const naira = (kobo) => '₦' + (Number(kobo || 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })
const muted = { color: 'rgba(255,255,255,0.45)' }
const card = { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }

const PERIODS = [
  { id: '7', label: '7 days', from: () => daysAgo(7) },
  { id: '30', label: '30 days', from: () => daysAgo(30) },
  { id: '90', label: '90 days', from: () => daysAgo(90) },
  { id: 'month', label: 'This month', from: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) } },
]
function daysAgo(n) { return new Date(Date.now() - n * 86400000) }

function Figure({ label, value, note, tone }) {
  return (
    <div className="rounded-2xl p-4" style={card}>
      <p className="text-xs" style={muted}>{label}</p>
      <p className="text-2xl font-black mt-1" style={{ color: tone || 'white' }}>{value}</p>
      {note && <p className="text-[11px] mt-2 leading-snug" style={muted}>{note}</p>}
    </div>
  )
}

export function FinanceTab() {
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const p = PERIODS.find(x => x.id === period)
    const { data: d, error: e } = await fetchFinanceSummary(p.from(), new Date(Date.now() + 60000))
    if (e) setError(e.message); else setData(d)
    setLoading(false)
  }, [period])
  useEffect(() => { load() }, [load])

  if (loading && !data) return <Spinner />
  if (error) return <p className="text-xs" style={{ color: 'var(--dm-terracotta)' }}>Could not load finance figures: {error}</p>
  if (!data) return null
  const c = data.control || {}
  const attention = [
    c.refunds_to_return_count > 0 && `${c.refunds_to_return_count} refund${c.refunds_to_return_count === 1 ? '' : 's'} to send back (${naira(c.refunds_to_return_kobo)})`,
    c.paid_not_fulfilled > 0 && `${c.paid_not_fulfilled} paid payment${c.paid_not_fulfilled === 1 ? '' : 's'} not yet fulfilled`,
    c.underpaid_accounts > 0 && `${c.underpaid_accounts} short payment${c.underpaid_accounts === 1 ? '' : 's'} waiting`,
    c.payouts_failed_count > 0 && `${c.payouts_failed_count} failed payout${c.payouts_failed_count === 1 ? '' : 's'}`,
    c.open_disputes > 0 && `${c.open_disputes} open dispute${c.open_disputes === 1 ? '' : 's'}`,
    c.referrals_awaiting_review > 0 && `${c.referrals_awaiting_review} referral reward${c.referrals_awaiting_review === 1 ? '' : 's'} awaiting your review`,
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} className="px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={period === p.id ? { backgroundColor: 'var(--dm-gold)', color: 'var(--dm-deep)' } : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
            {p.label}
          </button>
        ))}
        {loading && <span className="text-xs" style={muted}>Updating...</span>}
      </div>

      {attention.length > 0 && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(200,95,45,0.06)', border: '1px solid rgba(200,95,45,0.25)' }}>
          <p className="text-xs font-bold text-white mb-2">Needs attention</p>
          <ul className="space-y-1 text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>{attention.map(a => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="Money moved through DealMatch (GMV)" value={naira(data.gmv_kobo)}
          note={`Room charges ${naira(data.gmv_parts.hotel_room_charges)} + property escrow ${naira(data.gmv_parts.property_escrow)} + completed jobs ${naira(data.gmv_parts.jobs_completed)}. This is other people's money, not DealMatch income.`} />
        <Figure label="DealMatch revenue (before VAT)" value={naira(data.revenue_kobo)} tone="var(--dm-gold)"
          note={`Subscriptions, listings and credits ${naira(data.revenue_parts.subscriptions_listings_credits)} + hotel booking fees ${naira(data.revenue_parts.hotel_booking_fee)} + job commission ${naira(data.revenue_parts.job_commission)}. VAT is excluded.`} />
        <Figure label="Referral rewards" value={naira(data.referral_cost_kobo)}
          note={`${naira(data.referral_parts.released)} released, ${naira(data.referral_parts.on_hold)} on hold, plus ${data.referral_parts.credits_awarded} unlock credits. Cancelled rewards are not counted.`} />
        <Figure label="Contribution (estimate)" value={naira(data.contribution_estimate_kobo)} tone="var(--dm-sage)"
          note="Revenue minus referral rewards. Gateway fees and running costs are not taken off yet, so this is higher than real profit." />
        <Figure label="Gateway fees" value="Not recorded" note="Flutterwave charges are not captured in the system yet. They are real costs, so contribution above is overstated by them." />
        <Figure label="Operating profit" value="Not available" note="Needs running costs (salaries, hosting, marketing) to be recorded. Nothing is estimated here." />
        <Figure label="Escrow fees held" value={naira(data.escrow_fees_held_kobo)} note="DealMatch's share of property escrows funded in this period. Counted as revenue only when the escrow is released." />
        <Figure label="Completed jobs" value={data.completed_jobs} note="Marketplace jobs finished in this period." />
        <Figure label="New people" value={data.users.new} note={`${data.users.verified} of them identity-verified.`} />
      </div>

      <div className="rounded-2xl p-4" style={card}>
        <p className="text-xs font-bold text-white mb-3">Money to watch</p>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div><p style={muted}>Provider payouts waiting</p><p className="text-lg font-bold text-white">{naira(c.payouts_pending_kobo)}</p></div>
          <div><p style={muted}>Refunds to send back</p><p className="text-lg font-bold text-white">{naira(c.refunds_to_return_kobo)}</p></div>
          <div><p style={muted}>Open disputes</p><p className="text-lg font-bold text-white">{c.open_disputes}</p></div>
        </div>
      </div>

      {data.tax ? (
        <div className="rounded-2xl p-4" style={card}>
          <p className="text-xs font-bold text-white mb-3">Tax (visible to you because you can read tax figures)</p>
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div><p style={muted}>VAT collected in this period</p><p className="text-lg font-bold text-white">{naira(data.tax.vat_collected_in_period_kobo)}</p></div>
            <div><p style={muted}>VAT owed to the authority</p><p className="text-lg font-bold text-white">{naira(data.tax.vat_owed_kobo)}</p></div>
            <div><p style={muted}>Withholding tax owed</p><p className="text-lg font-bold text-white">{naira(data.tax.wht_owed_kobo)}</p></div>
          </div>
        </div>
      ) : (
        <p className="text-xs" style={muted}>Tax figures are visible only to the owner and accountants the owner has added.</p>
      )}
    </div>
  )
}

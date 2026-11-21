/**
 * Admin > Referral. Every number the referral programme uses is edited here: levels, tiers,
 * caps, hold days and credits. The rules run in the database and read these values, so no code
 * change is needed. Also lists rewards held for review (a referrer went over the monthly cap).
 */
import React, { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  fetchReferralSettings, setReferralSetting, fetchReferralSettingHistory,
  fetchReferralReviewQueue, reviewReferral,
} from '@/data/referralSettingsRepository'
import { ago, FEE_INPUT_STYLE } from '../shared'

const UNIT_SUFFIX = { percent: '%', naira: '₦', days: 'days', months: 'months', count: '', credits: 'credits', flag: '' }
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG')
const muted = { color: 'rgba(255,255,255,0.45)' }

export function ReferralSettingsTab() {
  const [rows, setRows] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [history, setHistory] = useState([])
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const [{ data: s }, { data: h }, { data: q }] = await Promise.all([fetchReferralSettings(), fetchReferralSettingHistory(), fetchReferralReviewQueue()])
    setRows(s || []); setHistory(h || []); setQueue(q || [])
    setDrafts(Object.fromEntries((s || []).map(r => [r.key, String(r.value)])))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (r) => {
    const v = Number(drafts[r.key])
    if (!Number.isFinite(v) || v < 0) return toast.error('Enter a number of zero or more')
    if (r.unit === 'percent' && v > 100) return toast.error('A percentage cannot be more than 100')
    if (r.unit === 'flag' && v !== 0 && v !== 1) return toast.error('Use 1 for on and 0 for off')
    setBusy(r.key)
    const { error } = await setReferralSetting({ key: r.key, value: v })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success('Saved. It applies to new payments only.')
    load()
  }

  const decide = async (id, approve) => {
    setBusy(id)
    const { error } = await reviewReferral({ id, approve })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(approve ? 'Approved. It will release after its hold.' : 'Rejected')
    load()
  }

  const labelOf = (key) => rows?.find(r => r.key === key)?.label || key
  const levelShare = rows ? ['l1_pct', 'l2_pct', 'l3_pct'].reduce((n, k) => n + Number(rows.find(r => r.key === k)?.value || 0), 0) : 0
  const maxShare = Number(rows?.find(r => r.key === 'max_share_pct')?.value || 0)

  return (
    <div className="space-y-5">
      <p className="text-xs max-w-2xl" style={muted}>
        Referral rewards are paid out of DealMatch&apos;s commission (before VAT), never out of the deal price. Changes apply to new payments only; rewards already earned keep their rate.
        Levels 1 to 3 together are always capped at the &quot;most DealMatch pays out per deal&quot; share.
      </p>
      {rows && levelShare > maxShare && (
        <p className="text-xs rounded-xl p-3" style={{ backgroundColor: 'rgba(212,168,83,0.1)', color: 'var(--dm-gold)' }}>
          Levels 1 to 3 add up to {levelShare}%, which is above the {maxShare}% cap. Payouts will be scaled down to the cap.
        </p>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        {(rows || []).map(r => (
          <div key={r.key} className="flex items-center gap-3 flex-wrap px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <div className="flex-1 min-w-[14rem]">
              <p className="text-sm text-white">{r.label}</p>
              <p className="text-[11px]" style={muted}>{r.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" min="0" value={drafts[r.key] ?? ''} onChange={e => setDrafts(d => ({ ...d, [r.key]: e.target.value }))}
                className="w-28 rounded-xl px-3 py-2 text-xs outline-none" style={FEE_INPUT_STYLE} aria-label={r.label} />
              <span className="text-xs w-14" style={muted}>{UNIT_SUFFIX[r.unit]}</span>
              <button onClick={() => save(r)} disabled={busy === r.key || String(r.value) === drafts[r.key]}
                className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40" style={{ backgroundColor: 'var(--dm-gold)', color: 'var(--dm-deep)' }}>
                {busy === r.key ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
        {!rows && <p className="p-4 text-xs" style={muted}>Loading...</p>}
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(200,95,45,0.06)', border: '1px solid rgba(200,95,45,0.25)' }}>
        <p className="text-xs font-bold mb-1 text-white">Waiting for your review ({queue.length})</p>
        <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>Rewards that took a referrer over the monthly cap. Approve to let them release after the hold, or reject.</p>
        {queue.length === 0 && <p className="text-xs" style={muted}>Nothing to review.</p>}
        <div className="space-y-2">
          {queue.map(q => (
            <div key={q.id} className="flex items-center justify-between gap-3 flex-wrap text-xs text-white">
              <span>Level {q.referral_level} · {String(q.transaction_type).replace(/_/g, ' ')} · {naira(q.referral_earning)} <span style={muted}>· {ago(q.created_at)}</span></span>
              <span className="flex gap-2">
                <button onClick={() => decide(q.id, true)} disabled={busy === q.id} className="px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ backgroundColor: 'rgba(122,158,126,0.15)', color: 'var(--dm-sage)' }}>Approve</button>
                <button onClick={() => decide(q.id, false)} disabled={busy === q.id} className="px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ backgroundColor: 'rgba(200,95,45,0.12)', color: 'var(--dm-terracotta)' }}>Reject</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-bold mb-3 text-white">Recent changes</p>
        {history.length === 0 && <p className="text-xs" style={muted}>No changes yet.</p>}
        <div className="space-y-2">
          {history.map((h, i) => (
            <p key={i} className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span className="text-white">{labelOf(h.key)}</span> changed from {h.old_value} to {h.new_value} · {ago(h.changed_at)}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

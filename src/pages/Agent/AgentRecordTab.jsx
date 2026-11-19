import React, { useState } from 'react'
import { ShieldCheckIcon, TrophyIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { respondToComplaint } from '@/data/agentDashboardRepository'
import toast from 'react-hot-toast'

const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'

// A reply box for one open complaint. Its own component so typing is not lost on re-render.
function ComplaintReply({ complaint, onSent }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!text.trim()) { setError('Enter a response.'); return }
    setBusy(true); setError(null)
    const { error: err } = await respondToComplaint(complaint.id, text.trim())
    setBusy(false)
    if (err) { setError('Could not submit your response. Please try again.'); return }
    toast.success('Response submitted'); onSent()
  }
  return (
    <div className="rounded-2xl bg-gold/15 p-3">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-bark"><ClockIcon className="h-3.5 w-3.5" aria-hidden="true" /> Respond within 48 hours</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} aria-label="Your response to this complaint"
        placeholder="Your response to this complaint..." className="input !py-2 text-xs" />
      {error ? <p role="alert" className="mt-1 text-xs font-semibold text-terracotta-dark">{error}</p> : null}
      <button type="button" onClick={send} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-deep py-2 text-xs font-bold text-white">
        {busy ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Submit response
      </button>
    </div>
  )
}

const STATUS_TONE = { upheld: 'bg-danger/15 text-danger', dismissed: 'bg-sage/20 text-forest' }

export default function AgentRecordTab({ score, complaints, reload }) {
  const rate = score ? (score.total_verifications === 0 ? 100 : Math.round((score.verified_count / score.total_verifications) * 100)) : null
  return (
    <div className="space-y-4">
      {score ? (
        <section className={`rounded-[32px_32px_32px_10px] p-5 ${glass}`} aria-label="Performance record">
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl"><TrophyIcon className="h-5 w-5 text-gold" aria-hidden="true" /> Performance record</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Success rate', value: `${rate}%` },
              { label: 'Rating', value: `${score.rating?.toFixed(1)} / 5.0` },
              { label: 'Complaints', value: `${score.complaints_upheld} upheld / ${score.complaints_received} total` },
              { label: 'Strikes', value: `${score.strike_count} of 3` },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-line bg-white/60 p-3">
                <p className="text-[11px] font-bold text-warm">{s.label}</p>
                <p className="mt-0.5 text-sm font-bold">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs capitalize text-warm">Status: {score.status}</p>
        </section>
      ) : null}

      <section aria-label="Complaints against you">
        <h3 className="mb-3 text-sm font-bold">Complaints filed against you</h3>
        {complaints.length === 0 ? (
          <div className={`rounded-[28px_28px_28px_10px] px-6 py-10 text-center ${glass}`}>
            <ShieldCheckIcon className="mx-auto mb-2 h-9 w-9 text-sage" aria-hidden="true" />
            <p className="text-sm text-warm">No complaints on record</p>
          </div>
        ) : complaints.map(c => (
          <div key={c.id} className={`mb-3 rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold">{c.properties?.title || 'Property'}</p>
                <p className="mt-0.5 text-xs capitalize text-warm">{c.category?.replace(/_/g, ' ')}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[c.status] || 'bg-gold/20 text-bark'}`}>{c.status}</span>
            </div>
            <p className="mb-2 text-xs text-bark">{c.description}</p>
            {c.status === 'open' && !c.agent_responded_at ? <ComplaintReply complaint={c} onSent={() => reload({ silent: true })} /> : null}
            {c.agent_response ? <p className="mt-2 text-xs italic text-warm">Your response: {c.agent_response}</p> : null}
          </div>
        ))}
      </section>
    </div>
  )
}

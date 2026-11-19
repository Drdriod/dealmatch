import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowPathIcon, ArrowRightOnRectangleIcon, ChevronDownIcon, ChevronUpIcon, ClipboardDocumentListIcon, DocumentTextIcon,
  ExclamationTriangleIcon, MapPinIcon, NoSymbolIcon, ShieldCheckIcon, StarIcon, TrophyIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { useAgentDashboard } from '@/hooks/useAgentDashboard'
import LoadNotice from '@/components/ui/LoadNotice'
import { useAuth } from '@/context/AuthContext'
import { fmtNaira } from '@/components/charts/ChartKit'
import VisitForm from './VisitForm'
import AgentRecordTab from './AgentRecordTab'

const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

const STATUS = {
  pending_review:     { cls: 'bg-gold/20 text-bark',    label: 'Pending review' },
  under_verification: { cls: 'bg-sky/15 text-deep',     label: 'Verifying' },
  active:             { cls: 'bg-sage/20 text-forest',  label: 'Active' },
  rejected:           { cls: 'bg-danger/15 text-danger', label: 'Rejected' },
}

export default function AgentDashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab]           = useState('assigned')
  const [expanded, setExpanded] = useState(null)

  const allowed = ['admin', 'superadmin', 'agent'].includes(profile?.role)
  // Assigned properties, score and complaints, with loading and error state.
  const { listings, score, complaints, loading, error, issues, reload } = useAgentDashboard({ user, enabled: allowed })

  useEffect(() => {
    if (!user) return
    if (!allowed) navigate('/')
  }, [user, allowed, navigate])

  const handleSignOut = async () => { await supabase.auth.signOut(); window.location.href = '/staff-gate-7f3k' }

  const waiting = l => ['pending_review', 'under_verification'].includes(l.status)
  const TABS = [
    { id: 'assigned',  label: 'Assigned',  count: listings.filter(waiting).length },
    { id: 'completed', label: 'Completed', count: listings.filter(l => l.status === 'active').length },
    { id: 'score',     label: 'My record', count: complaints.filter(c => c.status === 'open').length },
  ]
  const visibleListings = listings.filter(l => tab === 'assigned' ? waiting(l) : tab === 'completed' ? l.status === 'active' : false)

  const liveListings  = listings.filter(l => l.status === 'active')
  const verifiedValue = liveListings.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const verifiedShare = listings.length ? Math.round((liveListings.length / listings.length) * 100) : 0

  const monthBuckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(1); d.setHours(0, 0, 0, 0)
    d.setMonth(d.getMonth() - (5 - i))
    return { y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleString('en-GB', { month: 'short' }), verified: 0, rejected: 0 }
  })
  listings.forEach(l => (l.agent_verifications || []).forEach(v => {
    if (!v.submitted_at || !['verified', 'rejected'].includes(v.verdict)) return
    const d = new Date(v.submitted_at)
    const b = monthBuckets.find(b => b.y === d.getFullYear() && b.m === d.getMonth())
    if (b) b[v.verdict]++
  }))
  const maxMonth = Math.max(1, ...monthBuckets.map(b => b.verified + b.rejected))
  const hasVerifications = monthBuckets.some(b => b.verified + b.rejected > 0)

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-cream" role="status" aria-label="Loading">
      <ArrowPathIcon className="h-7 w-7 animate-spin text-terracotta" aria-hidden="true" />
    </div>
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream pb-28 text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 top-[32rem] h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-2xl px-4 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-terracotta-dark">Agent portal</p>
            <h1 className="font-display text-3xl">{profile?.full_name?.split(' ')[0] || 'Agent'}</h1>
          </div>
          <div className="flex items-center gap-2">
            {score ? (
              <span className="flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1.5 text-xs font-bold text-bark">
                <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />{score.rating?.toFixed(1)}
              </span>
            ) : null}
            <button type="button" onClick={handleSignOut} aria-label="Sign out" className={`flex h-10 w-10 items-center justify-center rounded-full ${glass} ${focusRing}`}>
              <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <LoadNotice error={error} issues={issues} onRetry={reload} what="your assignments" className="mb-4" />

        <section className={`mb-4 rounded-[36px_36px_36px_12px] p-5 ${glass}`} aria-label="Verified value">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-warm"><TrophyIcon className="h-4 w-4 text-gold" aria-hidden="true" /> Verified listing value</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words font-display text-3xl">{fmtNaira(verifiedValue)}</p>
              <p className="mt-1 text-xs text-warm">{liveListings.length} live {liveListings.length === 1 ? 'listing' : 'listings'} verified by you</p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl text-forest">{listings.length ? `${verifiedShare}%` : '—'}</p>
              <p className="text-[11px] text-warm">verified</p>
            </div>
          </div>
          {score ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Total', value: score.total_verifications },
                { label: 'Verified', value: score.verified_count },
                { label: 'Complaints', value: score.complaints_received },
                { label: 'Strikes', value: `${score.strike_count}/3` },
              ].map(x => (
                <div key={x.label} className="rounded-2xl border border-line bg-white/60 p-2 text-center">
                  <p className="text-lg font-bold">{x.value}</p>
                  <p className="text-[11px] text-warm">{x.label}</p>
                </div>
              ))}
            </div>
          ) : null}
          {score?.status === 'suspended' ? (
            <p role="alert" className="mt-3 flex items-center gap-2 rounded-2xl bg-danger/10 p-3 text-xs font-bold text-danger"><NoSymbolIcon className="h-4 w-4" aria-hidden="true" /> Account suspended. Contact admin to appeal.</p>
          ) : score?.strike_count >= 2 ? (
            <p role="alert" className="mt-3 flex items-center gap-2 rounded-2xl bg-gold/20 p-3 text-xs font-bold text-bark"><ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" /> Warning: {3 - score.strike_count} strike remaining before suspension.</p>
          ) : null}
        </section>

        <section className={`mb-4 rounded-[32px_32px_32px_10px] p-5 ${glass}`} aria-label="Verifications over time">
          <h2 className="font-display text-xl">Verifications over time</h2>
          <p className="mb-3 text-xs text-warm">Last 6 months, verified and rejected</p>
          {hasVerifications ? (
            <div className="flex h-36 items-end gap-2" role="img" aria-label="Bar chart of verifications per month">
              {monthBuckets.map(b => (
                <div key={b.label + b.m} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-lg bg-sand/60">
                    <div className="bg-terracotta" style={{ height: `${(b.rejected / maxMonth) * 100}%` }} />
                    <div className="bg-forest" style={{ height: `${(b.verified / maxMonth) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-warm">{b.label}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-xs text-warm">No verifications submitted in the last 6 months</p>}
          <p className="mt-2 flex gap-4 text-[11px] text-warm">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-forest" />Verified</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-terracotta" />Rejected</span>
          </p>
        </section>

        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-terracotta/20 bg-orange-pale p-3">
          <ShieldCheckIcon className="mt-px h-4 w-4 flex-shrink-0 text-terracotta-dark" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-bark">As a DealMatch agent you are accountable for every verification you submit. False or negligent verifications lead to strikes, suspension and possible legal referral. Every visit is GPS-stamped, photo-checked, confirmed with the owner&apos;s visit code, and permanently logged.</p>
        </div>

        <div className="mb-4 flex gap-2" role="tablist" aria-label="Agent sections">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition-colors ${focusRing} ${tab === t.id ? 'bg-deep text-white' : 'border border-line bg-white/80 text-bark'}`}>
              {t.label}{t.count > 0 ? <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t.id ? 'bg-gold/30 text-gold' : 'bg-terracotta/15 text-terracotta-dark'}`}>{t.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'score' ? <AgentRecordTab score={score} complaints={complaints} reload={reload} /> : (
          <div className="space-y-4">
            {visibleListings.length === 0 ? (
              <div className="py-16 text-center">
                <ClipboardDocumentListIcon className="mx-auto mb-3 h-10 w-10 text-warm/50" aria-hidden="true" />
                <p className="text-sm text-warm">No {tab} listings</p>
              </div>
            ) : null}
            {visibleListings.map(property => {
              const cfg = STATUS[property.status] || STATUS.pending_review
              const isOpen = expanded === property.id
              const alreadyDone = property.agent_verifications?.some(v => v.verdict !== 'pending')
              const photos = property.images || []
              const cover = (photos.find(i => i.is_primary) || photos[0])?.url
              return (
                <div key={property.id} className={`overflow-hidden rounded-[28px_28px_28px_10px] ${glass}`}>
                  {cover ? <img src={cover} alt={property.title} className="h-36 w-full object-cover" /> : null}
                  <div className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold leading-snug">{property.title}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-warm"><MapPinIcon className="h-3 w-3" aria-hidden="true" /> {property.city}, {property.state}</p>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="mb-3 rounded-2xl border border-line bg-white/60 p-2.5">
                      <p className="text-xs font-bold">{property.profiles?.full_name}</p>
                      <p className="text-xs text-warm">{property.profiles?.phone} · {property.profiles?.email}</p>
                    </div>
                    {alreadyDone ? (
                      <p className="mb-2 flex items-center gap-1.5 rounded-2xl bg-sage/15 px-3 py-2 text-xs font-semibold text-forest"><CheckCircleIcon className="h-4 w-4" aria-hidden="true" /> Evidence already submitted</p>
                    ) : null}
                    {tab === 'assigned' && !alreadyDone ? (
                      <button type="button" onClick={() => setExpanded(prev => prev === property.id ? null : property.id)} aria-expanded={isOpen}
                        className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-terracotta/30 bg-orange-pale py-2.5 text-xs font-bold text-terracotta-dark ${focusRing}`}>
                        <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
                        {isOpen ? 'Close visit form' : 'Record site visit'}
                        {isOpen ? <ChevronUpIcon className="h-4 w-4" aria-hidden="true" /> : <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    ) : null}
                    {isOpen ? <VisitForm property={property} user={user} onDone={() => { setExpanded(null); reload() }} /> : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

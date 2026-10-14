import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, ChevronRight, Clock, FileText, Filter, Mail, MessageSquare, RefreshCw, Search, User, Users, Wallet, X } from 'lucide-react'
import { fetchApplications, fetchPipeline, updateApplicationStatus } from '@/data/lenderRepository'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CHART, fmtNaira, fmtNum, Funnel, HBars, KpiTile, Panel, Radial } from '@/components/charts/ChartKit'

const STATUS_CONFIG = {
  pending:    { label: 'New',         color: '#C85F2D', bg: 'rgba(200,95,45,0.1)' },
  processing: { label: 'Processing',  color: '#5B8DEF', bg: 'rgba(91,141,239,0.1)' },
  reviewing:  { label: 'Reviewing',   color: '#D4A853', bg: 'rgba(212,168,83,0.1)' },
  approved:   { label: 'Approved',    color: '#7A9E7E', bg: 'rgba(122,158,126,0.1)' },
  declined:   { label: 'Declined',    color: '#E31E25', bg: 'rgba(227,30,37,0.1)' },
  finished:   { label: 'Finished',    color: '#17211B', bg: 'rgba(23,33,27,0.1)' },
  on_hold:    { label: 'On Hold',     color: '#647068', bg: 'rgba(138,126,120,0.1)' },
}

// Pipeline order for the funnel and the board
const PIPELINE_ORDER = ['pending', 'processing', 'reviewing', 'on_hold', 'approved', 'finished', 'declined']
// Status colours that would disappear on the dark surface get a lighter accent
const ACCENT_OVERRIDE = { finished: '#F0D4BE', on_hold: '#A8B3AC' }
const OPEN_STATUSES = ['pending', 'processing', 'reviewing', 'on_hold']
const BOARD_CARD_LIMIT = 6
const WEEKS = 8
const DAY_MS = 24 * 60 * 60 * 1000

const loanOf = (a) => (Number(a.property_value) || 0) - (Number(a.down_payment) || 0)

// Monday 00:00 (local) of the week containing `date`
const startOfWeek = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const EmptyNote = ({ children }) => (
  <p className="text-sm text-center py-10" style={{ color: 'rgba(255,250,245,0.45)' }}>{children}</p>
)

export default function LenderDashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [updating, setUpdating] = useState(false)
  const [pipeline, setPipeline] = useState([])
  const [pipelineLoading, setPipelineLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'lender' && profile.role !== 'admin') {
      toast.error('Access denied: Lender role required')
      navigate('/dashboard')
      return
    }
    loadApplications()
  }, [profile, filter])

  // Unfiltered query that feeds the funnel, weekly chart, radial, KPIs and board
  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'lender' && profile.role !== 'admin') return
    loadPipeline()
  }, [profile])

  const loadApplications = async () => {
    setLoading(true)
    const { data, error } = await fetchApplications(filter !== 'all' ? filter : null)
    if (error) toast.error('Failed to load applications')
    else setApps(data || [])
    setLoading(false)
  }

  const loadPipeline = async () => {
    setPipelineLoading(true)
    const { data, error } = await fetchPipeline()
    if (error) toast.error('Failed to load pipeline')
    else setPipeline(data || [])
    setPipelineLoading(false)
  }

  const refreshAll = () => {
    loadApplications()
    loadPipeline()
  }

  const handleUpdateStatus = async (app, newStatus) => {
    setUpdating(true)
    const { error } = await updateApplicationStatus(app.id, { status: newStatus, notes: note || app.notes })

    if (error) {
      toast.error('Update failed: ' + error.message)
    } else {
      toast.success(`Application ${app.ticket_id} updated to ${newStatus}`)
      setSelected(null)
      setNote('')
      loadApplications()
      loadPipeline()
    }
    setUpdating(false)
  }

  const handleEmail = (app) => {
    const subject = encodeURIComponent(`Update on your Mortgage Application: ${app.ticket_id}`)
    const body = encodeURIComponent(`Hi ${app.full_name},\n\nI am contacting you regarding your mortgage application (${app.ticket_id}) on DealMatch.\n\nStatus: ${app.status.toUpperCase()}\n\n[Your message here]`)
    window.location.href = `mailto:${app.email}?subject=${subject}&body=${body}`
  }

  const handleMessage = async (app) => {
    if (!app.user_id) {
      toast.error('User not registered, please use email')
      return
    }
    // Check for existing thread or create one (Simplified: navigate to messages with user_id)
    navigate(`/messages?user=${app.user_id}`)
  }

  // Board card: show that status in the list below and open the application
  const openFromBoard = (app) => {
    setFilter(app.status)
    setSelected(app)
    document.getElementById('applications-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(PIPELINE_ORDER.map((s) => [s, []]))
    pipeline.forEach((a) => { if (byStatus[a.status]) byStatus[a.status].push(a) })

    const approved = byStatus.approved.length
    const declined = byStatus.declined.length
    const decided = approved + declined

    const pipelineValue = pipeline
      .filter((a) => OPEN_STATUSES.includes(a.status))
      .reduce((sum, a) => sum + loanOf(a), 0)

    // Submission to last status change, for applications with a final decision
    const durations = pipeline
      .filter((a) => (a.status === 'approved' || a.status === 'declined') && a.created_at && a.updated_at)
      .map((a) => (new Date(a.updated_at) - new Date(a.created_at)) / DAY_MS)
      .filter((d) => Number.isFinite(d) && d >= 0)
    const avgDays = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null

    const thisWeek = startOfWeek(new Date())
    const weeks = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(thisWeek)
      start.setDate(start.getDate() - (WEEKS - 1 - i) * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return { start, end, count: 0 }
    })
    pipeline.forEach((a) => {
      const t = new Date(a.created_at).getTime()
      const w = weeks.find((wk) => t >= wk.start.getTime() && t < wk.end.getTime())
      if (w) w.count += 1
    })

    return {
      total: pipeline.length,
      byStatus,
      approved,
      declined,
      decided,
      approvalRate: decided ? Math.round((approved / decided) * 100) : 0,
      pipelineValue,
      avgDays,
      weeks,
      weeksTotal: weeks.reduce((s, w) => s + w.count, 0),
      stages: PIPELINE_ORDER.map((s) => ({ label: STATUS_CONFIG[s].label, value: byStatus[s].length })),
    }
  }, [pipeline])

  const pendingNote = pipelineLoading ? 'Loading...' : 'No applications yet'

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#17211B', color:'#FFFAF5' }}>
      <div className="max-w-6xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color:'#D4A853' }}>Pipeline</p>
            <h1 className="font-display text-3xl font-black" style={{ color:'#FFFAF5' }}>Lender Dashboard</h1>
            <p className="text-sm mt-1" style={{ color:'rgba(255,250,245,0.5)' }}>Manage mortgage applications and deals</p>
          </div>
          <button onClick={refreshAll} aria-label="Refresh applications"
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ background:'rgba(255,255,255,0.05)', borderColor:'rgba(255,255,255,0.12)', color:'#FFFAF5' }}>
            <RefreshCw size={18} className={loading || pipelineLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <KpiTile label="Applications" value={fmtNum(stats.total)} color={CHART.palette[0]} icon={Users} />
          <KpiTile label="Pipeline value" value={`₦${fmtNum(stats.pipelineValue)}`} color={CHART.palette[1]} icon={Wallet} />
          <div className="col-span-2 md:col-span-1">
            <KpiTile label="Avg. decision time"
              value={stats.avgDays === null ? '—' : `${stats.avgDays.toFixed(1)} days`}
              color={CHART.palette[2]} icon={Clock} />
          </div>
        </div>

        {/* Funnel + approval rate */}
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <Panel title="Stage funnel" sub="Applications by current status, in pipeline order" className="md:col-span-2">
            {stats.total === 0 ? <EmptyNote>{pendingNote}</EmptyNote> : <Funnel stages={stats.stages} />}
          </Panel>
          <Panel title="Approval rate" sub="Approved out of decided applications">
            {stats.decided === 0 ? <EmptyNote>{pipelineLoading ? 'Loading...' : 'No decisions yet'}</EmptyNote> : (
              <div className="flex flex-col items-center gap-3 py-2">
                <Radial value={stats.approvalRate} max={100} size={136} color={CHART.palette[0]}
                  label={`${stats.approvalRate}%`} sub={`of ${stats.decided} decided`} />
                <p className="text-[11px]" style={{ color:'rgba(255,255,255,0.45)' }}>
                  {stats.approved} approved · {stats.declined} declined
                </p>
              </div>
            )}
          </Panel>
        </div>

        {/* Weekly volume */}
        <Panel title="Applications per week" sub={`Last ${WEEKS} weeks, by submission date`} className="mb-4">
          {stats.weeksTotal === 0 ? <EmptyNote>{pipelineLoading ? 'Loading...' : `No applications in the last ${WEEKS} weeks`}</EmptyNote> : (
            <HBars items={stats.weeks.map((w) => ({
              label: w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              value: w.count,
              color: CHART.palette[1],
            }))} />
          )}
        </Panel>

        {/* Board: stacks to one column on phones */}
        <Panel title="Board by status" sub="Applications grouped by current status" className="mb-8">
          {stats.total === 0 ? <EmptyNote>{pendingNote}</EmptyNote> : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
              {PIPELINE_ORDER.map((s) => {
                const cfg = STATUS_CONFIG[s]
                const accent = ACCENT_OVERRIDE[s] || cfg.color
                const items = stats.byStatus[s]
                return (
                  <div key={s} className="rounded-2xl p-3 flex flex-col gap-2 min-w-0"
                    style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center justify-between gap-2 pb-2" style={{ borderBottom:`2px solid ${accent}` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
                        <p className="text-xs font-semibold truncate" style={{ color:'#FFFAF5' }}>{cfg.label}</p>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background:'rgba(255,255,255,0.08)', color:'#FFFAF5' }}>{items.length}</span>
                    </div>

                    {items.length === 0 ? (
                      <p className="text-[11px] text-center py-4" style={{ color:'rgba(255,250,245,0.35)' }}>None</p>
                    ) : (
                      <>
                        {items.slice(0, BOARD_CARD_LIMIT).map((a) => (
                          <button key={a.id} onClick={() => openFromBoard(a)}
                            className="text-left rounded-xl p-3 min-w-0 transition-colors hover:bg-white/10"
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                            <p className="text-[10px] font-black tracking-widest truncate" style={{ color:'#D4A853' }}>{a.ticket_id}</p>
                            <p className="text-xs font-semibold truncate mt-0.5" style={{ color:'#FFFAF5' }}>{a.full_name}</p>
                            <p className="text-[11px] mt-1 truncate" style={{ color:'#7A9E7E' }}>{fmtNaira(loanOf(a))}</p>
                          </button>
                        ))}
                        {items.length > BOARD_CARD_LIMIT && (
                          <p className="text-[11px] text-center pt-1" style={{ color:'rgba(255,250,245,0.45)' }}>
                            +{items.length - BOARD_CARD_LIMIT} more in the list below
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {/* Applications list */}
        <section id="applications-list" className="scroll-mt-24">
          <div className="mb-4">
            <h2 className="font-display text-2xl" style={{ color:'#FFFAF5' }}>Applications</h2>
            <p className="text-xs mt-1" style={{ color:'rgba(255,250,245,0.5)' }}>Open an application to review, message or update its status</p>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-2" style={{ scrollbarWidth:'none' }}>
            {['all', 'pending', 'processing', 'reviewing', 'approved', 'declined'].map(f => {
              const active = filter === f
              return (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all"
                  style={{
                    backgroundColor: active ? '#D4A853' : 'rgba(255,255,255,0.05)',
                    color: active ? '#17211B' : 'rgba(255,250,245,0.75)',
                    borderColor: active ? '#D4A853' : 'rgba(255,255,255,0.12)'
                  }}>
                  {f === 'all' ? 'All Applications' : STATUS_CONFIG[f]?.label}
                </button>
              )
            })}
          </div>

          {/* List */}
          <div className="space-y-4">
            {loading && apps.length === 0 ? (
              <div className="p-12 text-center text-sm" style={{ color:'rgba(255,250,245,0.5)' }}>Loading applications...</div>
            ) : apps.length === 0 ? (
              <div className="p-12 text-center rounded-3xl border border-dashed" style={{ borderColor:'rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.02)' }}>
                <FileText size={48} className="mx-auto mb-4 opacity-20" style={{ color:'#FFFAF5' }} />
                <p className="text-sm font-semibold" style={{ color:'rgba(255,250,245,0.5)' }}>No applications found in this category</p>
              </div>
            ) : (
              apps.map(app => (
                <div key={app.id} className="rounded-2xl border overflow-hidden transition-all bg-white"
                  style={{ borderColor: selected?.id === app.id ? '#C85F2D' : '#DEDDD6' }}>
                  <div className="p-5 cursor-pointer" onClick={() => setSelected(selected?.id === app.id ? null : app)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded bg-[#17211B] text-white">
                            {app.ticket_id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: STATUS_CONFIG[app.status]?.bg, color: STATUS_CONFIG[app.status]?.color }}>
                            {STATUS_CONFIG[app.status]?.label}
                          </span>
                        </div>
                        <h3 className="font-bold text-base" style={{ color:'#17211B' }}>{app.full_name}</h3>
                        <p className="text-xs mt-0.5" style={{ color:'#647068' }}>
                          ₦{Number(app.property_value).toLocaleString()} Property · {app.property_state || 'Unknown State'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-display font-black text-lg" style={{ color:'#C85F2D' }}>
                          ₦{(Number(app.property_value) - Number(app.down_payment)).toLocaleString()}
                        </p>
                        <p className="text-[10px] font-bold uppercase" style={{ color:'rgba(23,33,27,0.3)' }}>Loan Requested</p>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {selected?.id === app.id && (
                      <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }} className="overflow-hidden border-t border-[#DEDDD6] bg-[#FFFAF5]">
                        <div className="p-5 space-y-6">
                          {/* Details Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              { label: 'Employment', value: app.employment_type },
                              { label: 'Monthly Income', value: `₦${Number(app.monthly_income).toLocaleString()}` },
                              { label: 'Loan Term', value: `${app.loan_term_years} Years` },
                              { label: 'Down Payment', value: `₦${Number(app.down_payment).toLocaleString()}` },
                              { label: 'Email', value: app.email || 'N/A' },
                              { label: 'Phone', value: app.phone },
                              { label: 'Applied On', value: new Date(app.created_at).toLocaleDateString() },
                              { label: 'Property Type', value: app.property_type || 'N/A' },
                            ].map(d => (
                              <div key={d.label}>
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color:'rgba(23,33,27,0.4)' }}>{d.label}</p>
                                <p className="text-sm font-semibold" style={{ color:'#17211B' }}>{d.value}</p>
                              </div>
                            ))}
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Internal Notes / Response</label>
                            <textarea value={note} onChange={e => setNote(e.target.value)}
                              placeholder="Add notes or your response to the applicant..."
                              className="input min-h-[100px] text-sm py-3" style={{ backgroundColor:'#FFFFFF' }} />
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-3">
                            <div className="flex-1 flex gap-2">
                              <button onClick={() => handleEmail(app)} className="flex-1 py-3 rounded-xl border border-[#DEDDD6] bg-white text-xs font-bold flex items-center justify-center gap-2">
                                <Mail size={14} /> Email Applicant
                              </button>
                              <button onClick={() => handleMessage(app)} className="flex-1 py-3 rounded-xl border border-[#DEDDD6] bg-white text-xs font-bold flex items-center justify-center gap-2">
                                <MessageSquare size={14} /> In-App Message
                              </button>
                            </div>
                            <div className="w-full md:w-auto flex gap-2">
                              <button onClick={() => handleUpdateStatus(app, 'approved')} disabled={updating}
                                className="px-6 py-3 rounded-xl bg-[#7A9E7E] text-white text-xs font-bold flex items-center gap-2">
                                <Check size={14} /> Approve
                              </button>
                              <button onClick={() => handleUpdateStatus(app, 'declined')} disabled={updating}
                                className="px-6 py-3 rounded-xl bg-[#E31E25] text-white text-xs font-bold flex items-center gap-2">
                                <X size={14} /> Decline
                              </button>
                              <select value={app.status} onChange={(e) => handleUpdateStatus(app, e.target.value)} disabled={updating}
                                className="px-4 py-3 rounded-xl border border-[#DEDDD6] bg-white text-xs font-bold outline-none">
                                {Object.keys(STATUS_CONFIG).map(s => (
                                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

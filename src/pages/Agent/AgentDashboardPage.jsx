import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle, XCircle, MapPin, RefreshCw, LogOut, Camera,
  ClipboardList, AlertTriangle, Star, Shield, Upload,
  ChevronDown, ChevronUp, Clock, FileText, Award, Ban, Trophy
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fetchAssignedProperties, fetchAgentScore, fetchAgentComplaints,
  saveAgentVerification, recordPropertyVerdict, respondToComplaint,
} from '@/data/agentDashboardRepository'
import { useAuth } from '@/context/AuthContext'
import { AreaChart, HBars, Radial, Panel, fmtNaira } from '@/components/charts/ChartKit'
import toast from 'react-hot-toast'

// Status colours tuned for the dark leaderboard surface (same hues as STATUS_CFG)
const DARK_STATUS = {
  pending_review:     '#D4A853',
  under_verification: '#5B8DEF',
  active:             '#7A9E7E',
  rejected:           '#C85F2D',
}

function EmptyNote({ text }) {
  return <p className="text-xs py-6 text-center" style={{ color:'rgba(255,255,255,0.4)' }}>{text}</p>
}

const STATUS_CFG = {
  pending_review:     { bg:'rgba(212,168,83,0.12)',  color:'#8A6A20', label:'Pending Review' },
  under_verification: { bg:'rgba(91,141,239,0.12)',  color:'#4A72C4', label:'Verifying' },
  active:             { bg:'rgba(122,158,126,0.12)', color:'#4A7A4E', label:'Active' },
  rejected:           { bg:'rgba(200,95,45,0.12)',  color:'#8A4A20', label:'Rejected' },
}

const CHECKLIST_LABELS = {
  water_running:       'Running water confirmed',
  electricity_working: 'Electricity working',
  matches_description: 'Property matches listing description',
  landlord_present:    'Landlord/caretaker was present',
  no_structural_damage:'No structural damage observed',
  address_confirmed:   'Physical address confirmed on-site',
}

const BLANK_CHECKLIST = {
  water_running: false, electricity_working: false,
  matches_description: false, landlord_present: false,
  no_structural_damage: false, address_confirmed: false,
}

export default function AgentDashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()

  const [tab, setTab]           = useState('assigned')
  const [listings, setListings] = useState([])
  const [score, setScore]       = useState(null)
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)

  // Evidence submission state
  const [submitting, setSubmitting] = useState(false)
  const [evidenceForm, setEvidenceForm] = useState({})
  // { [propertyId]: { photos:[], checklist:{...}, gps:{lat,lng,acc}, notes:'', acknowledged:false } }

  useEffect(() => {
    if (!user) return
    if (!['admin','superadmin','agent'].includes(profile?.role)) { navigate('/'); return }
    loadAll()
  }, [user, profile])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadAssigned(), loadScore(), loadComplaints()])
    setLoading(false)
  }

  const loadAssigned = async () => {
    const { data } = await fetchAssignedProperties(user.id)
    setListings(data || [])
  }

  const loadScore = async () => {
    const { data } = await fetchAgentScore(user.id)
    setScore(data)
  }

  const loadComplaints = async () => {
    const { data } = await fetchAgentComplaints(user.id)
    setComplaints(data || [])
  }

  // ── GPS capture ───────────────────────────────────────────────
  const captureGPS = (propertyId) => {
    if (!navigator.geolocation) { toast.error('GPS not available on this device'); return }
    toast('Capturing GPS location...', { icon: <MapPin size={16} /> })
    navigator.geolocation.getCurrentPosition(
      pos => {
        setEvidenceForm(f => ({
          ...f,
          [propertyId]: {
            ...f[propertyId],
            gps: { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }
          }
        }))
        toast.success(`GPS captured (±${Math.round(pos.coords.accuracy)}m)`)
      },
      () => toast.error('Could not get GPS. Make sure location is enabled.')
    )
  }

  // ── Photo upload ──────────────────────────────────────────────
  const uploadPhotos = async (propertyId, files) => {
    const paths = []
    for (const file of Array.from(files)) {
      const ext  = file.name.split('.').pop()
      const path = `${user.id}/${propertyId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('verification-photos')
        .upload(path, file, { upsert: true })
      if (error) { toast.error(`Photo upload failed: ${error.message}`); continue }
      paths.push(path)
    }
    setEvidenceForm(f => ({
      ...f,
      [propertyId]: { ...f[propertyId], photos: [...(f[propertyId]?.photos || []), ...paths] }
    }))
    toast.success(`${paths.length} photo${paths.length !== 1 ? 's' : ''} uploaded`)
  }

  // ── Submit verification with evidence ─────────────────────────
  const submitVerification = async (property, verdict) => {
    const ev = evidenceForm[property.id] || {}

    // Validate evidence
    if (!ev.acknowledged) {
      toast.error('You must acknowledge liability before submitting'); return
    }
    if ((ev.photos || []).length < 3) {
      toast.error('Upload at least 3 photos from your site visit'); return
    }
    if (!ev.gps?.lat) {
      toast.error('GPS location is required - tap Capture GPS first'); return
    }
    const checks = ev.checklist || BLANK_CHECKLIST
    const allChecked = Object.values(checks).every(Boolean)
    if (!allChecked && verdict === 'verified') {
      toast.error('Complete all checklist items before approving'); return
    }

    setSubmitting(true)
    try {
      // Insert evidence record
      const { error: evErr } = await saveAgentVerification({
        property_id:           property.id,
        agent_id:              user.id,
        photos:                ev.photos,
        gps_lat:               ev.gps.lat,
        gps_lng:               ev.gps.lng,
        gps_accuracy_m:        ev.gps.acc,
        checklist:             checks,
        verdict,
        rejection_reason:      verdict === 'rejected' ? (ev.notes || 'See checklist') : null,
        liability_acknowledged: true,
        visited_at:            new Date().toISOString(),
      })
      if (evErr) throw evErr

      // Update property status
      const newStatus = verdict === 'verified' ? 'active' : 'rejected'
      const { error: propErr } = await recordPropertyVerdict(property.id, {
        status:            newStatus,
        verified_by:       user.id,
        verification_date: new Date().toISOString(),
        verification_notes: ev.notes || null,
      })
      if (propErr) throw propErr

      toast.success(verdict === 'verified' ? 'Property verified and now live!' : 'Property rejected')
      setEvidenceForm(f => { const n = {...f}; delete n[property.id]; return n })
      setExpanded(null)
      loadAll()
    } catch (e) {
      toast.error(e.message || 'Submission failed')
    }
    setSubmitting(false)
  }

  const initForm = (propertyId) => {
    if (!evidenceForm[propertyId]) {
      setEvidenceForm(f => ({ ...f, [propertyId]: { photos:[], checklist:{...BLANK_CHECKLIST}, notes:'', acknowledged:false } }))
    }
    setExpanded(prev => prev === propertyId ? null : propertyId)
  }

  const handleSignOut = async () => { await supabase.auth.signOut(); window.location.href = '/staff-gate-7f3k' }

  const TABS = [
    { id:'assigned',   label:'Assigned',  count: listings.filter(l=>['pending_review','under_verification'].includes(l.status)).length },
    { id:'completed',  label:'Completed', count: listings.filter(l=>l.status==='active').length },
    { id:'score',      label:'My Record', count: complaints.filter(c=>c.status==='open').length },
  ]

  const visibleListings = listings.filter(l =>
    tab === 'assigned'  ? ['pending_review','under_verification'].includes(l.status) :
    tab === 'completed' ? l.status === 'active' : false
  )

  // ── Leaderboard derivations (only from listings and verifications already loaded) ──
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
  const hasVerifications = monthBuckets.some(b => b.verified + b.rejected > 0)

  const ranking = [...listings]
    .filter(l => Number(l.price) > 0)
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, 6)
    .map((l, i) => ({ label: `#${i + 1}  ${l.title}`, value: Number(l.price) }))

  const recent = listings.slice(0, 6)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor:'#FFFAF5' }}>
      <RefreshCw size={28} className="animate-spin text-terracotta" />
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor:'#FFFAF5' }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-6" style={{ backgroundColor:'#17211B' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs mb-0.5" style={{ color:'rgba(255,255,255,0.45)' }}>Agent Portal</p>
            <h1 className="font-display text-xl font-black text-white">{profile?.full_name?.split(' ')[0]}</h1>
          </div>
          <div className="flex items-center gap-3">
            {score && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full" style={{ backgroundColor:'rgba(212,168,83,0.15)' }}>
                <Star size={13} style={{ color:'#D4A853' }} />
                <span className="text-xs font-bold" style={{ color:'#D4A853' }}>{score.rating?.toFixed(1)}</span>
              </div>
            )}
            <button onClick={handleSignOut} className="p-2 rounded-full" style={{ backgroundColor:'rgba(255,255,255,0.06)' }}>
              <LogOut size={16} style={{ color:'rgba(255,255,255,0.5)' }} />
            </button>
          </div>
        </div>

        {/* Leaderboard hero */}
        <div className="rounded-3xl p-5 mb-4" style={{ background:'linear-gradient(135deg, rgba(212,168,83,0.16), rgba(122,158,126,0.06) 60%, rgba(255,255,255,0.02))', border:'1px solid rgba(212,168,83,0.2)' }}>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider flex items-center gap-1.5" style={{ color:'rgba(255,255,255,0.5)' }}>
                <Trophy size={13} style={{ color:'#D4A853' }} /> Verified listing value
              </p>
              <p className="font-display text-3xl mt-2 leading-none break-words" style={{ color:'#D4A853' }}>{fmtNaira(verifiedValue)}</p>
              <p className="text-xs mt-2" style={{ color:'rgba(255,255,255,0.5)' }}>
                {liveListings.length} live {liveListings.length === 1 ? 'listing' : 'listings'} verified by you
              </p>
            </div>
            <Radial value={liveListings.length} max={listings.length || 1} size={104} color="#7A9E7E"
              label={listings.length ? `${verifiedShare}%` : '—'} sub="verified" />
          </div>
        </div>

        {/* Score strip */}
        {score && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label:'Total',     value: score.total_verifications },
              { label:'Verified',  value: score.verified_count,   color:'#7A9E7E' },
              { label:'Complaints',value: score.complaints_received, color: score.complaints_received > 0 ? '#C85F2D' : undefined },
              { label:'Strikes',   value: `${score.strike_count}/3`, color: score.strike_count >= 2 ? '#C94A3A' : score.strike_count === 1 ? '#C85F2D' : undefined },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-2 text-center" style={{ backgroundColor:'rgba(255,255,255,0.05)' }}>
                <p className="text-lg font-black" style={{ color: s.color || 'white' }}>{s.value}</p>
                <p className="text-xs" style={{ color:'rgba(255,255,255,0.35)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Suspension warning */}
        {score?.status === 'suspended' && (
          <div className="mt-3 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor:'rgba(201,74,58,0.15)', border:'1px solid rgba(201,74,58,0.3)' }}>
            <Ban size={16} style={{ color:'#C94A3A' }} />
            <p className="text-xs font-bold" style={{ color:'#C94A3A' }}>Account suspended - contact admin to appeal</p>
          </div>
        )}
        {score?.strike_count >= 2 && score?.status !== 'suspended' && (
          <div className="mt-3 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor:'rgba(212,168,83,0.12)', border:'1px solid rgba(212,168,83,0.25)' }}>
            <AlertTriangle size={16} style={{ color:'#D4A853' }} />
            <p className="text-xs font-bold" style={{ color:'#D4A853' }}>Warning: {3 - score.strike_count} strike remaining before suspension</p>
          </div>
        )}
      </div>

      {/* ── Leaderboard analytics (dark) ─────────────────────────── */}
      <div className="px-4 pb-6 space-y-4 rounded-b-[32px]" style={{ backgroundColor:'#17211B' }}>
        <Panel title="Verifications over time" sub="Last 6 months, by verdict">
          {hasVerifications ? (
            <>
              <div className="flex gap-4 mb-2 text-[11px]" style={{ color:'rgba(255,255,255,0.55)' }}>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background:'#7A9E7E' }} />Verified</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background:'#C85F2D' }} />Rejected</span>
              </div>
              <AreaChart
                data={monthBuckets}
                series={[
                  { key:'verified', label:'Verified', color:'#7A9E7E' },
                  { key:'rejected', label:'Rejected', color:'#C85F2D' },
                ]}
                height={200}
              />
            </>
          ) : <EmptyNote text="No verifications submitted in the last 6 months" />}
        </Panel>

        <Panel title="Ranking by listing value" sub="Top 6 assigned listings by price">
          {ranking.length ? (
            <HBars items={ranking} format={fmtNaira} />
          ) : <EmptyNote text="No priced listings assigned yet" />}
        </Panel>

        <Panel title="Recent deals" sub="Latest assigned listings and their status">
          {recent.length === 0 ? <EmptyNote text="No deals assigned yet" /> : (
            <ul>
              {recent.map(l => {
                const color = DARK_STATUS[l.status] || '#D4A853'
                const created = l.created_at ? new Date(l.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : ''
                return (
                  <li key={l.id} className="py-3 flex items-center gap-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{l.title}</p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color:'rgba(255,255,255,0.4)' }}>
                        {[l.city, created].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <p className="text-xs font-bold text-white whitespace-nowrap">{fmtNaira(l.price)}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ background:`${color}22`, color }}>
                      {STATUS_CFG[l.status]?.label || l.status}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Liability declaration notice */}
      <div className="mx-4 mt-4 rounded-2xl p-3 flex items-start gap-2.5" style={{ backgroundColor:'rgba(200,95,45,0.06)', border:'1px solid rgba(200,95,45,0.15)' }}>
        <Shield size={15} style={{ color:'#C85F2D', flexShrink:0, marginTop:1 }} />
        <p className="text-xs leading-relaxed" style={{ color:'#647068' }}>
          As a DealMatch agent you are legally accountable for every verification you submit. False or negligent verifications will result in strikes, suspension, and potential legal referral. All submissions are GPS-stamped, photo-evidenced, and permanently audit-logged.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 mt-5 mb-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all relative"
            style={{
              backgroundColor: tab === t.id ? '#17211B' : 'rgba(23,33,27,0.05)',
              color: tab === t.id ? 'white' : '#647068',
            }}>
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: tab === t.id ? 'rgba(212,168,83,0.3)' : 'rgba(200,95,45,0.15)', color: tab === t.id ? '#D4A853' : '#C85F2D' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Listing cards ───────────────────────────────────────── */}
      {(tab === 'assigned' || tab === 'completed') && (
        <div className="px-4 space-y-4">
          {visibleListings.length === 0 && (
            <div className="text-center py-16">
              <ClipboardList size={40} className="mx-auto mb-3 text-muted opacity-40" />
              <p className="text-sm" style={{ color:'#647068' }}>No {tab} listings</p>
            </div>
          )}
          {visibleListings.map(property => {
            const cfg    = STATUS_CFG[property.status] || STATUS_CFG.pending_review
            const ev     = evidenceForm[property.id] || {}
            const isOpen = expanded === property.id
            const alreadyDone = property.agent_verifications?.some(v => v.verdict !== 'pending')

            return (
              <div key={property.id} className="rounded-3xl overflow-hidden" style={{ backgroundColor:'white', border:'1px solid #DEDDD6', boxShadow:'0 2px 12px rgba(23,33,27,0.06)' }}>
                {/* Property image */}
                {property.images?.[0] && (
                  <img src={property.images[0]} alt={property.title} className="w-full h-36 object-cover" />
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <h3 className="font-bold text-sm leading-snug" style={{ color:'#17211B' }}>{property.title}</h3>
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color:'#647068' }}>
                        <MapPin size={11} /> {property.city}, {property.state}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-bold flex-shrink-0" style={{ backgroundColor:cfg.bg, color:cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Landlord contact */}
                  <div className="rounded-xl p-2.5 mb-3" style={{ backgroundColor:'rgba(23,33,27,0.03)' }}>
                    <p className="text-xs font-semibold mb-0.5" style={{ color:'#17211B' }}>{property.profiles?.full_name}</p>
                    <p className="text-xs" style={{ color:'#647068' }}>{property.profiles?.phone} · {property.profiles?.email}</p>
                  </div>

                  {/* Already verified badge */}
                  {alreadyDone && (
                    <div className="flex items-center gap-1.5 py-2 rounded-xl px-3 mb-2" style={{ backgroundColor:'rgba(122,158,126,0.1)' }}>
                      <CheckCircle size={14} style={{ color:'#7A9E7E' }} />
                      <span className="text-xs font-semibold" style={{ color:'#4A7A4E' }}>Evidence already submitted</span>
                    </div>
                  )}

                  {/* Expand evidence form */}
                  {tab === 'assigned' && !alreadyDone && (
                    <button onClick={() => initForm(property.id)}
                      className="w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                      style={{ backgroundColor:'rgba(200,95,45,0.08)', color:'#C85F2D', border:'1px solid rgba(200,95,45,0.2)' }}>
                      <FileText size={14} />
                      {isOpen ? 'Close Evidence Form' : 'Submit Verification Evidence'}
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}

                  {/* ── Evidence Form ──────────────────────────────── */}
                  {isOpen && (
                    <div className="mt-4 space-y-4">

                      {/* GPS */}
                      <div>
                        <p className="text-xs font-bold mb-2" style={{ color:'#17211B' }}>GPS Location *</p>
                        {ev.gps ? (
                          <div className="rounded-xl p-2.5 flex items-center gap-2" style={{ backgroundColor:'rgba(122,158,126,0.08)', border:'1px solid rgba(122,158,126,0.2)' }}>
                            <CheckCircle size={14} style={{ color:'#7A9E7E' }} />
                            <span className="text-xs" style={{ color:'#4A7A4E' }}>
                              {ev.gps.lat.toFixed(5)}, {ev.gps.lng.toFixed(5)} (±{ev.gps.acc}m)
                            </span>
                          </div>
                        ) : (
                          <button onClick={() => captureGPS(property.id)}
                            className="w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"
                            style={{ backgroundColor:'rgba(91,141,239,0.08)', color:'#4A72C4', border:'1px solid rgba(91,141,239,0.2)' }}>
                            <MapPin size={14} /> Capture GPS (must be at property)
                          </button>
                        )}
                      </div>

                      {/* Photos */}
                      <div>
                        <p className="text-xs font-bold mb-1" style={{ color:'#17211B' }}>
                          Site Photos * <span style={{ color:'#647068', fontWeight:400 }}>(min 3 required - {(ev.photos||[]).length} uploaded)</span>
                        </p>
                        <button onClick={() => fileRef.current?.click()}
                          className="w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"
                          style={{ backgroundColor:'rgba(200,95,45,0.06)', color:'#C85F2D', border:'1.5px dashed rgba(200,95,45,0.3)' }}>
                          <Camera size={14} /> Take / Upload Photos
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                          onChange={e => uploadPhotos(property.id, e.target.files)} />
                        {(ev.photos||[]).length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {ev.photos.map((p,i) => (
                              <div key={i} className="w-16 h-16 rounded-xl overflow-hidden" style={{ border:'1px solid #DEDDD6' }}>
                                <div className="w-full h-full flex items-center justify-center text-xs" style={{ backgroundColor:'rgba(200,95,45,0.08)', color:'#C85F2D' }}>
                                  <Camera size={18} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Checklist */}
                      <div>
                        <p className="text-xs font-bold mb-2" style={{ color:'#17211B' }}>Physical Inspection Checklist *</p>
                        <div className="space-y-2">
                          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
                            const checked = ev.checklist?.[key] || false
                            return (
                              <button key={key}
                                onClick={() => setEvidenceForm(f => ({
                                  ...f,
                                  [property.id]: {
                                    ...f[property.id],
                                    checklist: { ...(f[property.id]?.checklist || BLANK_CHECKLIST), [key]: !checked }
                                  }
                                }))}
                                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all"
                                style={{
                                  backgroundColor: checked ? 'rgba(122,158,126,0.08)' : 'rgba(23,33,27,0.03)',
                                  border: `1px solid ${checked ? 'rgba(122,158,126,0.3)' : '#DEDDD6'}`
                                }}>
                                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: checked ? '#7A9E7E' : 'white', border:`1.5px solid ${checked ? '#7A9E7E' : '#DEDDD6'}` }}>
                                  {checked && <CheckCircle size={12} style={{ color:'white' }} />}
                                </div>
                                <span className="text-xs" style={{ color: checked ? '#4A7A4E' : '#5C4A3A' }}>{label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <p className="text-xs font-bold mb-1" style={{ color:'#17211B' }}>Additional Notes</p>
                        <textarea
                          value={ev.notes || ''}
                          onChange={e => setEvidenceForm(f => ({ ...f, [property.id]: { ...f[property.id], notes: e.target.value } }))}
                          placeholder="Any observations, discrepancies, or notes about the property..."
                          rows={3}
                          className="w-full rounded-2xl px-3 py-2.5 text-xs resize-none outline-none"
                          style={{ backgroundColor:'rgba(23,33,27,0.03)', border:'1.5px solid #DEDDD6', color:'#17211B' }}
                        />
                      </div>

                      {/* Liability acknowledgment */}
                      <button
                        onClick={() => setEvidenceForm(f => ({ ...f, [property.id]: { ...f[property.id], acknowledged: !ev.acknowledged } }))}
                        className="w-full flex items-start gap-3 p-3 rounded-2xl text-left"
                        style={{ backgroundColor: ev.acknowledged ? 'rgba(122,158,126,0.06)' : 'rgba(201,74,58,0.04)', border:`1.5px solid ${ev.acknowledged ? 'rgba(122,158,126,0.25)' : 'rgba(201,74,58,0.15)'}` }}>
                        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: ev.acknowledged ? '#7A9E7E' : 'white', border:`1.5px solid ${ev.acknowledged ? '#7A9E7E' : '#C94A3A'}` }}>
                          {ev.acknowledged && <CheckCircle size={12} style={{ color:'white' }} />}
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color:'#5C4A3A' }}>
                          I acknowledge that this verification is accurate and truthful. I understand that submitting false information constitutes grounds for immediate suspension and potential legal action by DealMatch.
                        </p>
                      </button>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          onClick={() => submitVerification(property, 'rejected')}
                          disabled={submitting || !ev.acknowledged}
                          className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                          style={{ backgroundColor:'rgba(201,74,58,0.08)', color:'#C94A3A', border:'1.5px solid rgba(201,74,58,0.2)' }}>
                          <XCircle size={16} /> Reject
                        </button>
                        <button
                          onClick={() => submitVerification(property, 'verified')}
                          disabled={submitting || !ev.acknowledged || (ev.photos||[]).length < 3 || !ev.gps}
                          className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                          style={{ backgroundColor:'#7A9E7E', color:'white' }}>
                          <CheckCircle size={16} /> {submitting ? 'Submitting...' : 'Verify'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── My Record tab ─────────────────────────────────────── */}
      {tab === 'score' && (
        <div className="px-4 space-y-4">
          {/* Score card */}
          {score && (
            <div className="rounded-3xl p-4" style={{ backgroundColor:'#17211B' }}>
              <div className="flex items-center gap-2 mb-4">
                <Award size={20} style={{ color:'#D4A853' }} />
                <h2 className="font-bold text-white">Performance Record</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label:'Success Rate', value:`${score.total_verifications === 0 ? 100 : Math.round(score.verified_count/score.total_verifications*100)}%`, color:'#7A9E7E' },
                  { label:'Rating',       value:`${score.rating?.toFixed(1)} / 5.0`, color:'#D4A853' },
                  { label:'Complaints',   value:`${score.complaints_upheld} upheld / ${score.complaints_received} total`, color: score.complaints_upheld > 0 ? '#C85F2D' : '#7A9E7E' },
                  { label:'Strikes',      value:`${score.strike_count} of 3`, color: score.strike_count >= 2 ? '#C94A3A' : score.strike_count === 1 ? '#C85F2D' : '#7A9E7E' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-3" style={{ backgroundColor:'rgba(255,255,255,0.05)' }}>
                    <p className="text-xs mb-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{s.label}</p>
                    <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: score.status==='active' ? '#7A9E7E' : '#C94A3A' }} />
                <span className="text-xs capitalize" style={{ color:'rgba(255,255,255,0.5)' }}>Status: {score.status}</span>
              </div>
            </div>
          )}

          {/* Complaints against this agent */}
          <div>
            <h3 className="font-bold text-sm mb-3" style={{ color:'#17211B' }}>Complaints Filed Against You</h3>
            {complaints.length === 0 ? (
              <div className="text-center py-10">
                <Shield size={36} className="mx-auto mb-3" style={{ color:'#7A9E7E', opacity:0.5 }} />
                <p className="text-sm" style={{ color:'#647068' }}>No complaints on record</p>
              </div>
            ) : complaints.map(c => (
              <div key={c.id} className="rounded-2xl p-4 mb-3" style={{ backgroundColor:'white', border:'1px solid #DEDDD6' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs font-bold" style={{ color:'#17211B' }}>{c.properties?.title || 'Property'}</p>
                    <p className="text-xs mt-0.5" style={{ color:'#647068' }}>{c.category?.replace(/_/g,' ')}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                    backgroundColor: c.status==='upheld' ? 'rgba(201,74,58,0.1)' : c.status==='dismissed' ? 'rgba(122,158,126,0.1)' : 'rgba(212,168,83,0.1)',
                    color: c.status==='upheld' ? '#C94A3A' : c.status==='dismissed' ? '#4A7A4E' : '#8A6A20'
                  }}>
                    {c.status}
                  </span>
                </div>
                <p className="text-xs mb-2" style={{ color:'#5C4A3A' }}>{c.description}</p>
                {/* Response window */}
                {c.status === 'open' && !c.agent_responded_at && (
                  <div className="rounded-xl p-2.5" style={{ backgroundColor:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.2)' }}>
                    <p className="text-xs font-bold mb-1" style={{ color:'#8A6A20' }}>
                      <Clock size={11} className="inline mr-1" />
                      Respond within 48 hours
                    </p>
                    <textarea
                      placeholder="Your response to this complaint..."
                      rows={2}
                      className="w-full rounded-xl px-2.5 py-2 text-xs resize-none outline-none"
                      style={{ backgroundColor:'white', border:'1px solid #DEDDD6', color:'#17211B' }}
                      id={`response-${c.id}`}
                    />
                    <button
                      onClick={async () => {
                        const txt = document.getElementById(`response-${c.id}`)?.value?.trim()
                        if (!txt) { toast.error('Enter a response'); return }
                        const { error: respErr } = await respondToComplaint(c.id, txt)
                        if (respErr) { toast.error('Could not submit your response. Please try again.'); return }
                        toast.success('Response submitted'); loadComplaints()
                      }}
                      className="mt-2 w-full py-2 rounded-xl text-xs font-bold"
                      style={{ backgroundColor:'#D4A853', color:'#17211B' }}>
                      Submit Response
                    </button>
                  </div>
                )}
                {c.agent_response && (
                  <p className="text-xs mt-2 italic" style={{ color:'#647068' }}>Your response: {c.agent_response}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

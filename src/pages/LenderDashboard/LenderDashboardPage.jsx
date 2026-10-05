import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronRight, Clock, FileText, Filter, Mail, MessageSquare, RefreshCw, Search, User, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  pending:    { label: 'New',         color: '#C85F2D', bg: 'rgba(200,95,45,0.1)' },
  processing: { label: 'Processing',  color: '#5B8DEF', bg: 'rgba(91,141,239,0.1)' },
  reviewing:  { label: 'Reviewing',   color: '#D4A853', bg: 'rgba(212,168,83,0.1)' },
  approved:   { label: 'Approved',    color: '#7A9E7E', bg: 'rgba(122,158,126,0.1)' },
  declined:   { label: 'Declined',    color: '#E31E25', bg: 'rgba(227,30,37,0.1)' },
  finished:   { label: 'Finished',    color: '#17211B', bg: 'rgba(23,33,27,0.1)' },
  on_hold:    { label: 'On Hold',     color: '#647068', bg: 'rgba(138,126,120,0.1)' },
}

export default function LenderDashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'lender' && profile.role !== 'admin') {
      toast.error('Access denied: Lender role required')
      navigate('/dashboard')
      return
    }
    loadApplications()
  }, [profile, filter])

  const loadApplications = async () => {
    setLoading(true)
    let query = supabase
      .from('mortgage_applications')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query
    if (error) toast.error('Failed to load applications')
    else setApps(data || [])
    setLoading(false)
  }

  const handleUpdateStatus = async (app, newStatus) => {
    setUpdating(true)
    const { error } = await supabase
      .from('mortgage_applications')
      .update({ 
        status: newStatus, 
        notes: note || app.notes,
        updated_at: new Date().toISOString() 
      })
      .eq('id', app.id)

    if (error) {
      toast.error('Update failed: ' + error.message)
    } else {
      toast.success(`Application ${app.ticket_id} updated to ${newStatus}`)
      setSelected(null)
      setNote('')
      loadApplications()
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

  if (loading && apps.length === 0) {
    return <div className="min-h-screen pt-32 text-center" style={{ color:'#647068' }}>Loading applications...</div>
  }

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-4xl mx-auto px-4">
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-black" style={{ color:'#17211B' }}>Lender Dashboard</h1>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>Manage mortgage applications and deals</p>
          </div>
          <button onClick={loadApplications} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-[#DEDDD6]">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2" style={{ scrollbarWidth:'none' }}>
          {['all', 'pending', 'processing', 'reviewing', 'approved', 'declined'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all"
              style={{ 
                backgroundColor: filter === f ? '#17211B' : '#FFFFFF',
                color: filter === f ? '#FFFFFF' : '#5C4A3A',
                borderColor: filter === f ? '#17211B' : '#DEDDD6'
              }}>
              {f === 'all' ? 'All Applications' : STATUS_CONFIG[f]?.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-4">
          {apps.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-dashed border-[#DEDDD6] bg-[#FFFAF5]">
              <FileText size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm font-semibold" style={{ color:'#647068' }}>No applications found in this category</p>
            </div>
          ) : (
            apps.map(app => (
              <div key={app.id} className="rounded-2xl border overflow-hidden transition-all bg-white"
                style={{ borderColor: selected?.id === app.id ? '#C85F2D' : '#DEDDD6' }}>
                <div className="p-5 cursor-pointer" onClick={() => setSelected(selected?.id === app.id ? null : app)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
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
                    <div className="text-right">
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
      </div>
    </div>
  )
}

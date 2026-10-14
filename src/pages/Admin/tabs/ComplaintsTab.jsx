/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '@/lib/supabase'
import { processReferralPayoutsForTransaction, AGENT_FIELD_FEE, AGENT_SENIOR_FEE } from '@/lib/referral'
import { notifyIdentityApproved, notifyIdentityRejected } from '@/lib/notifications'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { friendlyDbError } from '@/lib/dbErrors'
import { usePlatformFees, formatPlatformFee } from '@/lib/platformFees'
import { listCategories } from '@/modules/catalog/catalogService'
import { fetchFeeHistory, fetchPendingRefunds, markRefundReturned, setPlatformFee, createPlatformFee } from '@/data/monetisationRepository'
import { Sparkline, AreaChart, Donut, Panel, fmtNum as compactNum } from '@/components/charts/ChartKit'
import { SUPERADMIN_EMAILS, STAFF_ROLES, ROLE_LABELS, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS, fmt, fmtNum, ago, maskEmail, maskPhone, adminFetch, auditLog, useReauthGate, Spinner, Badge, ActionBtn, SearchBar, StatCard, ConfirmModal, ImageLightbox, FilterBar, TH, TableWrap, TR, EmptyRow, PIPELINE_STAGES, FEE_INPUT_STYLE, FEE_LABEL_STYLE, AREA_LABEL, EMPTY_NEW_FEE, NAV_ITEMS } from '../shared'

// ─── Complaints Tab ───────────────────────────────────────────────────────────
export function ComplaintsTab({ admin }) {
  const [complaints, setComplaints] = useState([])
  const [filter, setFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(null)
  const [resolutionNote, setResolutionNote] = useState('')

  useEffect(() => { load() }, [filter])

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('complaints')
      .select('*, properties(title,city,state), profiles!complainant_id(full_name,email), agent:profiles!agent_id(full_name,email)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setComplaints(data || [])
    setLoading(false)
  }

  const resolve = async (complaint, newStatus) => {
    if (!resolutionNote.trim()) { toast.error('Enter a resolution note'); return }
    setResolving(complaint.id)
    const { error } = await supabase.from('complaints').update({
      status: newStatus,
      resolution_note: resolutionNote,
      resolved_by: admin?.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', complaint.id)
    if (error) toast.error('Failed to resolve complaint')
    else { toast.success(newStatus === 'upheld' ? 'Complaint upheld - strike issued to agent' : 'Complaint dismissed'); load() }
    setResolving(null); setResolutionNote('')
  }

  const STATUSES = ['open','under_review','upheld','dismissed','all']
  const STATUS_COLOR = { open:'#D4A853', under_review:'#5B8DEF', upheld:'#C94A3A', dismissed:'#7A9E7E', escalated:'#9B7BD4' }
  const CAT_LABEL = { fake_listing:'Fake Listing', misrepresentation:'Misrepresentation', wrong_address:'Wrong Address', structural_damage:'Structural Damage', fraud:'Fraud', agent_misconduct:'Agent Misconduct', other:'Other' }

  if (loading) return <div className="flex justify-center pt-16"><Spinner /></div>

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-all"
            style={{
              backgroundColor: filter===s ? (STATUS_COLOR[s]||'#D4A853') : 'rgba(255,255,255,0.05)',
              color: filter===s ? 'white' : 'rgba(255,255,255,0.45)',
            }}>{s==='all'?'All':s.replace('_',' ')}</button>
        ))}
      </div>

      <p className="text-xs mb-4" style={{color:'rgba(255,255,255,0.3)'}}>{complaints.length} complaint{complaints.length!==1?'s':''}</p>

      {complaints.length === 0 && (
        <div className="text-center py-16 rounded-3xl" style={{backgroundColor:'rgba(255,255,255,0.03)'}}>
          <Gavel size={36} style={{color:'rgba(255,255,255,0.1)',margin:'0 auto 12px'}} />
          <p style={{color:'rgba(255,255,255,0.3)',fontSize:13}}>No {filter} complaints</p>
        </div>
      )}

      <div className="space-y-4">
        {complaints.map(c => (
          <div key={c.id} className="rounded-3xl overflow-hidden" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}>
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{backgroundColor:`${STATUS_COLOR[c.status]||'#D4A853'}20`,color:STATUS_COLOR[c.status]||'#D4A853'}}>
                      {c.status?.replace('_',' ')}
                    </span>
                    <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{CAT_LABEL[c.category]||c.category}</span>
                  </div>
                  <p className="font-bold text-white text-sm">{c.properties?.title || 'Unknown Property'}</p>
                  <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.3)'}}>{c.properties?.city}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{new Date(c.created_at).toLocaleDateString()}</p>
                  {c.status === 'open' && new Date() > new Date(c.response_deadline) && (
                    <p className="text-xs font-bold mt-0.5" style={{color:'#C94A3A'}}>Response overdue</p>
                  )}
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl p-2.5" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                  <p className="text-xs font-bold mb-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Complainant</p>
                  <p className="text-xs text-white">{c.profiles?.full_name || 'Unknown'}</p>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{c.profiles?.email}</p>
                </div>
                <div className="rounded-xl p-2.5" style={{backgroundColor: c.agent ? 'rgba(201,74,58,0.06)' : 'rgba(255,255,255,0.04)', border: c.agent ? '1px solid rgba(201,74,58,0.15)' : 'none'}}>
                  <p className="text-xs font-bold mb-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Responsible Agent</p>
                  {c.agent ? (
                    <>
                      <p className="text-xs font-bold" style={{color:'#C85F2D'}}>{c.agent.full_name}</p>
                      <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{c.agent.email}</p>
                    </>
                  ) : <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>Not yet assigned</p>}
                </div>
              </div>

              {/* Complaint text */}
              <div className="rounded-xl p-3 mb-3" style={{backgroundColor:'rgba(255,255,255,0.03)'}}>
                <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.7)'}}>{c.description}</p>
              </div>

              {/* Agent response */}
              {c.agent_response && (
                <div className="rounded-xl p-3 mb-3" style={{backgroundColor:'rgba(91,141,239,0.06)',border:'1px solid rgba(91,141,239,0.15)'}}>
                  <p className="text-xs font-bold mb-1" style={{color:'#5B8DEF'}}>Agent Response</p>
                  <p className="text-xs leading-relaxed" style={{color:'rgba(255,255,255,0.6)'}}>{c.agent_response}</p>
                  <p className="text-xs mt-1" style={{color:'rgba(255,255,255,0.25)'}}>{new Date(c.agent_responded_at).toLocaleString()}</p>
                </div>
              )}

              {/* Resolution */}
              {c.resolution_note && (
                <div className="rounded-xl p-3 mb-3" style={{backgroundColor:'rgba(122,158,126,0.06)',border:'1px solid rgba(122,158,126,0.15)'}}>
                  <p className="text-xs font-bold mb-1" style={{color:'#7A9E7E'}}>Resolution</p>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.6)'}}>{c.resolution_note}</p>
                </div>
              )}

              {/* Admin resolution controls */}
              {(c.status === 'open' || c.status === 'under_review') && (
                <div>
                  <textarea
                    placeholder="Resolution note (required before upholding or dismissing)..."
                    rows={2}
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                    className="w-full rounded-2xl px-3 py-2.5 text-xs resize-none outline-none mb-2"
                    style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => resolve(c, 'dismissed')} disabled={!!resolving}
                      className="py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                      style={{backgroundColor:'rgba(122,158,126,0.12)',color:'#7A9E7E'}}>
                      <ThumbsDown size={13} /> Dismiss
                    </button>
                    <button onClick={() => resolve(c, 'upheld')} disabled={!!resolving}
                      className="py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                      style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>
                      <Gavel size={13} /> {resolving===c.id ? 'Processing...' : 'Uphold + Strike'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


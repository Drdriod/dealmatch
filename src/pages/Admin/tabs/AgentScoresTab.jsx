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

// ─── Agent Scores Tab ────────────────────────────────────────────────────────
export function AgentScoresTab({ admin }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [verifications, setVerifications] = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('v_agent_scorecard')
      .select('*')
    setAgents(data || [])
    setLoading(false)
  }

  const loadVerifications = async (agentId) => {
    const { data } = await supabase
      .from('agent_verifications')
      .select('*, properties(title,city,state)')
      .eq('agent_id', agentId)
      .order('submitted_at', { ascending: false })
      .limit(20)
    setVerifications(data || [])
  }

  const reinstateAgent = async (agentId) => {
    await supabase.from('agent_scores').update({ status:'active', strike_count:0, updated_at:new Date().toISOString() }).eq('agent_id', agentId)
    // FIX: account_status, not role - the agent's role never changed in
    // the first place, only their status did (see suspendAgent below).
    await supabase.from('profiles').update({ account_status:'active' }).eq('id', agentId)
    toast.success('Agent reinstated'); load()
  }

  const suspendAgent = async (agentId) => {
    await supabase.from('agent_scores').update({ status:'suspended', updated_at:new Date().toISOString() }).eq('agent_id', agentId)
    // FIX: this used to overwrite role:'suspended', wiping out role:'agent'
    // entirely - reinstateAgent then had to hardcode role:'agent' back,
    // which only worked because this action is agent-specific. Using
    // account_status instead means role is never touched by a moderation
    // action anywhere in this file now.
    await supabase.from('profiles').update({ account_status:'suspended' }).eq('id', agentId)
    toast.success('Agent suspended'); load()
  }

  const STATUS_COLOR = { active:'#7A9E7E', under_review:'#D4A853', suspended:'#C94A3A', banned:'#8A2020' }

  if (loading) return <div className="flex justify-center pt-16"><Spinner /></div>

  return (
    <div>
      <p className="text-xs mb-4" style={{color:'rgba(255,255,255,0.35)'}}>
        Live performance records for all field agents. 3 upheld complaints = automatic suspension.
      </p>

      {agents.length === 0 && (
        <div className="text-center py-16 rounded-3xl" style={{backgroundColor:'rgba(255,255,255,0.03)'}}>
          <Award size={36} style={{color:'rgba(255,255,255,0.15)',margin:'0 auto 12px'}} />
          <p style={{color:'rgba(255,255,255,0.3)',fontSize:13}}>No agents on record yet</p>
        </div>
      )}

      <div className="space-y-3">
        {agents.map(a => (
          <div key={a.id} className="rounded-3xl overflow-hidden" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)'}}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white text-sm truncate">{a.full_name}</p>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0" style={{backgroundColor:`${STATUS_COLOR[a.status]}20`, color:STATUS_COLOR[a.status]}}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{a.email}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Star size={13} style={{color:'#D4A853'}} />
                  <span className="text-sm font-black" style={{color:'#D4A853'}}>{parseFloat(a.rating||5).toFixed(1)}</span>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  {label:'Verified', value:a.verified_count, color:'#7A9E7E'},
                  {label:'Success',  value:`${a.success_rate_pct}%`, color:'#7A9E7E'},
                  {label:'Complaints', value:`${a.complaints_upheld}/${a.complaints_received}`, color:a.complaints_upheld>0?'#C85F2D':'rgba(255,255,255,0.5)'},
                  {label:'Strikes', value:`${a.strike_count}/3`, color:a.strike_count>=2?'#C94A3A':a.strike_count===1?'#C85F2D':'rgba(255,255,255,0.5)'},
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-2 text-center" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                    <p className="text-sm font-black" style={{color:m.color}}>{m.value}</p>
                    <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Strike progress bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1" style={{color:'rgba(255,255,255,0.3)'}}>
                  <span>Strike progress</span>
                  <span>{a.strikes_remaining} remaining before suspension</span>
                </div>
                <div className="h-1.5 rounded-full" style={{backgroundColor:'rgba(255,255,255,0.08)'}}>
                  <div className="h-full rounded-full transition-all" style={{
                    width:`${(a.strike_count/3)*100}%`,
                    backgroundColor:a.strike_count>=2?'#C94A3A':a.strike_count>=1?'#C85F2D':'#7A9E7E'
                  }} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => { setSelected(a); loadVerifications(a.id) }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>
                  View History
                </button>
                {a.status === 'suspended' ? (
                  <button onClick={() => reinstateAgent(a.id)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold"
                    style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E'}}>
                    Reinstate
                  </button>
                ) : (
                  <button onClick={() => suspendAgent(a.id)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold"
                    style={{backgroundColor:'rgba(201,74,58,0.1)',color:'#C94A3A'}}>
                    Suspend
                  </button>
                )}
              </div>
            </div>

            {/* Verification history */}
            {selected?.id === a.id && verifications.length > 0 && (
              <div className="border-t px-4 py-3 space-y-2" style={{borderColor:'rgba(255,255,255,0.06)'}}>
                <p className="text-xs font-bold mb-2" style={{color:'rgba(255,255,255,0.4)'}}>Recent Verifications</p>
                {verifications.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b" style={{borderColor:'rgba(255,255,255,0.04)'}}>
                    <div>
                      <p className="text-xs font-semibold text-white">{v.properties?.title}</p>
                      <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{v.properties?.city} · {new Date(v.submitted_at).toLocaleDateString()}</p>
                      {v.gps_lat && <p className="text-xs" style={{color:'rgba(255,255,255,0.2)'}}>GPS: {parseFloat(v.gps_lat).toFixed(4)}, {parseFloat(v.gps_lng).toFixed(4)} (±{v.gps_accuracy_m}m)</p>}
                      <p className="text-xs" style={{color:'rgba(255,255,255,0.2)'}}>Photos: {v.photos?.length || 0}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                      backgroundColor:v.verdict==='verified'?'rgba(122,158,126,0.15)':'rgba(201,74,58,0.1)',
                      color:v.verdict==='verified'?'#7A9E7E':'#C94A3A'
                    }}>{v.verdict}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

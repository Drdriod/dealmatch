/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Scale, Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
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

export const SUPERADMIN_EMAILS = ['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com']
export const STAFF_ROLES       = ['agent', 'verifier', 'admin']
// FIX: role and account_status used to be conflated (moderation status
// living inside the same column as role) - see
// supabase/migrations/20260915000000_fix_role_status_conflation.sql.
// role itself is untouched: it still holds every persona value
// OnboardingPage.jsx writes (buyer/seller/renter/landlord/investor/
// student/professional) alongside the staff values (admin/agent/verifier/
// lender). account_status (active/suspended/deleted) is the separate,
// newly-enforced moderation flag - a suspended admin stays an admin, just
// suspended, which is the exact case the old unsuspend bug got wrong.
export const ROLE_LABELS = {
  admin:'Admin', agent:'Agent', verifier:'Verifier', lender:'Lender',
  buyer:'Buyer', seller:'Seller', landlord:'Landlord', renter:'Renter',
  investor:'Investor', student:'Student', professional:'Professional',
}
export const ROLE_COLORS = { admin:'#D4A853', agent:'#5B8DEF', verifier:'#7A9E7E', lender:'#8B6BD9' }
export const STATUS_LABELS = { active:'Active', suspended:'Suspended', deleted:'Deleted' }
export const STATUS_COLORS = { active:'#7A9E7E', suspended:'#C85F2D', deleted:'#888' }

export const fmt    = (n=0) => n>=1e6?`₦${(n/1e6).toFixed(1)}M`:n>=1e3?`₦${(n/1e3).toFixed(0)}K`:`₦${Math.round(n)}`
export const fmtNum = (n=0) => Number(n||0).toLocaleString()
export const ago    = (ts) => {
  if (!ts) return 'N/A'
  const s=(Date.now()-new Date(ts))/1000
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
}
export const maskEmail = (e='') => e?e.replace(/(.{2}).+(@.+)/,'$1***$2'):'N/A'
export const maskPhone = (p='') => p?String(p).slice(0,4)+'****'+String(p).slice(-3):'N/A'

export async function adminFetch(path, opts={}) {
  const { data:{ session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const base = import.meta.env.VITE_APP_URL || ''
  const res = await fetch(`${base}/api/admin/${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}`, ...(opts.headers||{}) },
  })
  const json = await res.json().catch(()=>({ error: res.statusText }))
  if (!res.ok) throw new Error(json?.error || `API error ${res.status}`)
  return json
}

// auditLog is handled entirely by DB triggers on admin_audit_log (see
// db/fixes-v2.sql / supabase/migrations/20260828000001_fixes_v2_mortgage_hostel_audit.sql
// for the trigger definitions and the fn_audit_admin_action() function).
// Frontend must NOT insert directly - the "Anyone insert audit log" policy
// was removed in that same migration, so a direct insert from here would
// now be rejected by RLS. This stub remains as a callsite placeholder so
// existing call sites don't need to change; it is intentionally a no-op.
export async function auditLog(_action, _meta={}) {
  // Intentional no-op: audit entries are written by Postgres triggers only.
}

// ── Reauthentication gate for high-impact admin settings ────────────────────────
// Checklist item 16: bank destinations change "live, no code
// deploy needed" per the copy shown on this page - exactly the kind of
// change that should require a fresh password check, not just an active
// admin session. requireReauth() re-verifies the current password via
// Supabase's own signInWithPassword before the caller is allowed to
// proceed, and remembers a short grace window so a superadmin editing
// several fields in a row isn't re-prompted on every keystroke's Save.
const REAUTH_TTL_MS = 5 * 60 * 1000 // 5 minutes
let lastReauthAt = 0

export function useReauthGate(email) {
  const [visible, setVisible] = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const resolverRef = useRef(null)

  const requireReauth = useCallback(() => {
    if (Date.now() - lastReauthAt < REAUTH_TTL_MS) return Promise.resolve(true)
    setPassword('')
    setVisible(true)
    return new Promise(resolve => { resolverRef.current = resolve })
  }, [])

  const cancel = () => {
    setVisible(false)
    resolverRef.current?.(false)
    resolverRef.current = null
  }

  const submit = async () => {
    if (!password || !email) return
    setVerifying(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setVerifying(false)
    if (error) { toast.error('Incorrect password'); return }
    lastReauthAt = Date.now()
    setVisible(false)
    resolverRef.current?.(true)
    resolverRef.current = null
  }

  const ReauthModalEl = !visible ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-3" style={{backgroundColor:'#17211B',border:'1px solid rgba(255,255,255,0.1)'}}>
        <p className="text-sm font-bold text-white flex items-center gap-2"><Shield size={14} style={{color:'#D4A853'}}/> Confirm your password</p>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          This changes where DealMatch funds are sent. Re-enter your password to continue.
        </p>
        <input type="password" autoFocus value={password} onChange={e=>setPassword(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') submit() }}
          placeholder="Password"
          className="w-full px-4 py-2.5 rounded-xl text-sm"
          style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} disabled={verifying||!password}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{backgroundColor:'#D4A853',color:'#17211B'}}>
            {verifying?'Verifying...':'Confirm'}
          </button>
          <button onClick={cancel}
            className="px-4 py-2.5 rounded-xl text-xs font-bold"
            style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return { requireReauth, ReauthModalEl }
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
export const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor:'#D4A853' }} />
  </div>
)

export const Badge = ({ label='', color='#D4A853' }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize"
    style={{ backgroundColor:`${color}1A`, color, border:`1px solid ${color}33` }}>
    {String(label).replace(/_/g,' ')}
  </span>
)

export const ActionBtn = ({ icon:Icon, color, tip, onClick, disabled=false }) => (
  <button onClick={onClick} title={tip} disabled={disabled}
    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-30"
    style={{ backgroundColor:`${color}18` }}>
    <Icon size={13} style={{ color }} />
  </button>
)

export const SearchBar = ({ value, onChange, placeholder='Search...', onSearch }) => (
  <div className="relative flex-1">
    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color:'rgba(255,255,255,0.3)' }} />
    <input value={value} onChange={e=>onChange(e.target.value)}
      onKeyDown={e=>{ if(e.key==='Enter'&&onSearch) onSearch(value) }}
      placeholder={placeholder}
      className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
      style={{ backgroundColor:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', color:'#fff' }} />
  </div>
)

export const StatCard = ({ icon:Icon, label, value, trend, color='#D4A853', onClick }) => (
  <div onClick={onClick} className={`rounded-2xl p-4 ${onClick?'cursor-pointer hover:opacity-80 transition-all':''}`}
    style={{ backgroundColor:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
    <div className="flex items-start justify-between mb-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor:`${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      {trend!==undefined&&<span className="text-xs font-semibold flex items-center gap-0.5"
        style={{ color:trend>=0?'#7A9E7E':'#C85F2D' }}>
        {trend>=0?<TrendingUp size={11}/>:<TrendingDown size={11}/>}{Math.abs(trend)}%
      </span>}
    </div>
    <div className="text-2xl font-black text-white mb-0.5">{value??'N/A'}</div>
    <div className="text-xs font-semibold" style={{ color:'rgba(255,255,255,0.4)' }}>{label}</div>
  </div>
)

export const ConfirmModal = ({ title, body, danger, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
    style={{ backgroundColor:'rgba(0,0,0,0.8)', backdropFilter:'blur(6px)' }}>
    <motion.div initial={{ scale:0.92, opacity:0 }} animate={{ scale:1, opacity:1 }}
      className="w-full max-w-sm rounded-3xl p-6"
      style={{ backgroundColor:'#1E1510', border:'1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor:danger?'rgba(200,95,45,0.12)':'rgba(212,168,83,0.1)' }}>
        {danger?<AlertTriangle size={22} style={{ color:'#C85F2D' }}/>:<Shield size={22} style={{ color:'#D4A853' }}/>}
      </div>
      <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm mb-6" style={{ color:'rgba(255,255,255,0.5)' }}>{body}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm font-semibold"
          style={{ backgroundColor:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.6)' }}>Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl text-sm font-bold"
          style={{ backgroundColor:danger?'#C85F2D':'#D4A853', color:'#17211B' }}>Confirm</button>
      </div>
    </motion.div>
  </div>
)

export const ImageLightbox = ({ src, label, onClose }) => (
  <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-6"
    style={{ backgroundColor:'rgba(0,0,0,0.92)', backdropFilter:'blur(4px)' }}>
    <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }}
      onClick={e=>e.stopPropagation()} className="relative w-full max-w-2xl flex flex-col items-center">
      <div className="flex items-center justify-between w-full mb-3">
        {label&&<span className="text-white text-sm font-bold px-3 py-1 rounded-full" style={{ backgroundColor:'rgba(255,255,255,0.08)' }}>{label}</span>}
        <div className="flex gap-2 ml-auto">
          <a href={src} target="_blank" rel="noopener noreferrer"
            className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor:'rgba(255,255,255,0.1)' }}
            title="Open original in new tab">
            <ExternalLink size={16} style={{ color:'#fff' }}/>
          </a>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor:'rgba(255,255,255,0.1)' }}>
            <X size={18} style={{ color:'#fff' }}/>
          </button>
        </div>
      </div>
      {/* pinch-to-zoom friendly: native img at full res, scrollable if it overflows */}
      <div className="w-full max-h-[80vh] overflow-auto rounded-2xl" style={{ border:'1px solid rgba(255,255,255,0.15)' }}>
        <img src={src} alt={label||'Document'} className="w-full h-auto block" style={{ touchAction:'pinch-zoom' }}/>
      </div>
      <p className="text-xs mt-3" style={{ color:'rgba(255,255,255,0.4)' }}>Pinch to zoom, or tap the link icon to open full-size in a new tab.</p>
    </motion.div>
  </div>
)

export const FilterBar = ({ options, value, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
    {options.map(([k,l])=>(
      <button key={k} onClick={()=>onChange(k)}
        className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
        style={{ backgroundColor:value===k?'#D4A853':'rgba(255,255,255,0.06)', color:value===k?'#17211B':'rgba(255,255,255,0.5)' }}>
        {l}
      </button>
    ))}
  </div>
)

export const TH = ({ cols }) => (
  <thead>
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      {cols.map(c=><th key={c} className="px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
        style={{ color:'rgba(255,255,255,0.35)' }}>{c}</th>)}
    </tr>
  </thead>
)

export const TableWrap = ({ cols, children }) => (
  <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
    <div className="overflow-x-auto">
      <table className="w-full text-sm"><TH cols={cols}/><tbody>{children}</tbody></table>
    </div>
  </div>
)

export const TR = ({ children }) => (
  <tr className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
    {children}
  </tr>
)

export const EmptyRow = ({ cols, msg='No records found' }) => (
  <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>{msg}</td></tr>
)

// ── Constants that used to sit between tabs ──
export const PIPELINE_STAGES=[
  {id:'enquiry',    label:'Enquiry',      color:'#647068'},
  {id:'negotiation',label:'Negotiation',  color:'#D4A853'},
  {id:'paid_escrow',label:'Paid (Escrow)',color:'#5B8DEF'},
  {id:'completed',  label:'Completed',    color:'#7A9E7E'},
  {id:'disputed',   label:'Disputed',     color:'#C94A3A'},
  {id:'lost',       label:'Lost',         color:'#555'},
]
export const FEE_INPUT_STYLE={backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}
export const FEE_LABEL_STYLE={color:'rgba(255,255,255,0.5)'}
export const AREA_LABEL={place:'Places',people:'People',other:'Other'}
export const EMPTY_NEW_FEE={key:'',label:'',description:'',area:'other',kind:'percent',value:''}
export const NAV_ITEMS=[
  {path:'',         label:'Overview',        icon:LayoutDashboard},
  {path:'properties',label:'Properties',     icon:Home},
  {path:'users',    label:'Users',           icon:Users},
  {path:'identity', label:'ID Verify',       icon:Shield},
  {path:'skill-verify',label:'Skill Verify', icon:Award},
  {path:'pipeline', label:'Pipeline',        icon:GitBranch},
  {path:'transactions',label:'Transactions', icon:CreditCard},
  {path:'payouts',  label:'Payouts',         icon:Landmark},
  {path:'monetisation',label:'Monetisation',  icon:Percent},
  {path:'fees',     label:'Commission Schedules', icon:Percent},
  {path:'mortgage', label:'Mortgage',        icon:FileText},
  {path:'enquiries',label:'Enquiries',       icon:MessageSquare},
  {path:'professionals',label:'Professionals',icon:Briefcase},
  {path:'hostels',  label:'Student Hostels', icon:BookOpen},
  {path:'student-verifications',label:'Student IDs',icon:GraduationCap},
  {path:'announcements',label:'Announcements',icon:Bell},
  {path:'testimonials',label:'Testimonials',   icon:Quote},
  {path:'agent-scores', label:'Agent Scores',    icon:Award},
  {path:'complaints',   label:'Complaints',       icon:AlertOctagon},
  {path:'disputes',     label:'Disputes',         icon:Scale},
  {path:'staff',    label:'Staff',           icon:UserCog},
  {path:'settings', label:'Settings',        icon:Settings},
  {path:'analytics',label:'Analytics',       icon:BarChart2},
]

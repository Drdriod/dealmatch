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
import { fetchFeeHistory, fetchPendingRefunds, markRefundReturned, setPlatformFee, createPlatformFee } from '@/data/monetisationRepository'
import { Sparkline, AreaChart, Donut, Panel, fmtNum as compactNum } from '@/components/charts/ChartKit'

const SUPERADMIN_EMAILS = ['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com']
const STAFF_ROLES       = ['agent', 'verifier', 'admin']
// FIX: role and account_status used to be conflated (moderation status
// living inside the same column as role) - see
// supabase/migrations/20260915000000_fix_role_status_conflation.sql.
// role itself is untouched: it still holds every persona value
// OnboardingPage.jsx writes (buyer/seller/renter/landlord/investor/
// student/professional) alongside the staff values (admin/agent/verifier/
// lender). account_status (active/suspended/deleted) is the separate,
// newly-enforced moderation flag - a suspended admin stays an admin, just
// suspended, which is the exact case the old unsuspend bug got wrong.
const ROLE_LABELS = {
  admin:'Admin', agent:'Agent', verifier:'Verifier', lender:'Lender',
  buyer:'Buyer', seller:'Seller', landlord:'Landlord', renter:'Renter',
  investor:'Investor', student:'Student', professional:'Professional',
}
const ROLE_COLORS = { admin:'#D4A853', agent:'#5B8DEF', verifier:'#7A9E7E', lender:'#8B6BD9' }
const STATUS_LABELS = { active:'Active', suspended:'Suspended', deleted:'Deleted' }
const STATUS_COLORS = { active:'#7A9E7E', suspended:'#C85F2D', deleted:'#888' }

const fmt    = (n=0) => n>=1e6?`₦${(n/1e6).toFixed(1)}M`:n>=1e3?`₦${(n/1e3).toFixed(0)}K`:`₦${Math.round(n)}`
const fmtNum = (n=0) => Number(n||0).toLocaleString()
const ago    = (ts) => {
  if (!ts) return 'N/A'
  const s=(Date.now()-new Date(ts))/1000
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
}
const maskEmail = (e='') => e?e.replace(/(.{2}).+(@.+)/,'$1***$2'):'N/A'
const maskPhone = (p='') => p?String(p).slice(0,4)+'****'+String(p).slice(-3):'N/A'

async function adminFetch(path, opts={}) {
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
async function auditLog(_action, _meta={}) {
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

function useReauthGate(email) {
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
const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor:'#D4A853' }} />
  </div>
)

const Badge = ({ label='', color='#D4A853' }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold capitalize"
    style={{ backgroundColor:`${color}1A`, color, border:`1px solid ${color}33` }}>
    {String(label).replace(/_/g,' ')}
  </span>
)

const ActionBtn = ({ icon:Icon, color, tip, onClick, disabled=false }) => (
  <button onClick={onClick} title={tip} disabled={disabled}
    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:opacity-80 disabled:opacity-30"
    style={{ backgroundColor:`${color}18` }}>
    <Icon size={13} style={{ color }} />
  </button>
)

const SearchBar = ({ value, onChange, placeholder='Search...', onSearch }) => (
  <div className="relative flex-1">
    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color:'rgba(255,255,255,0.3)' }} />
    <input value={value} onChange={e=>onChange(e.target.value)}
      onKeyDown={e=>{ if(e.key==='Enter'&&onSearch) onSearch(value) }}
      placeholder={placeholder}
      className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
      style={{ backgroundColor:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', color:'#fff' }} />
  </div>
)

const StatCard = ({ icon:Icon, label, value, trend, color='#D4A853', onClick }) => (
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

const ConfirmModal = ({ title, body, danger, onConfirm, onCancel }) => (
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

const ImageLightbox = ({ src, label, onClose }) => (
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

const FilterBar = ({ options, value, onChange }) => (
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

const TH = ({ cols }) => (
  <thead>
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      {cols.map(c=><th key={c} className="px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
        style={{ color:'rgba(255,255,255,0.35)' }}>{c}</th>)}
    </tr>
  </thead>
)

const TableWrap = ({ cols, children }) => (
  <div className="rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(255,255,255,0.07)' }}>
    <div className="overflow-x-auto">
      <table className="w-full text-sm"><TH cols={cols}/><tbody>{children}</tbody></table>
    </div>
  </div>
)

const TR = ({ children }) => (
  <tr className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
    {children}
  </tr>
)

const EmptyRow = ({ cols, msg='No records found' }) => (
  <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>{msg}</td></tr>
)

// ── OVERVIEW ───────────────────────────────────────────────────────────────────
function OverviewTab() {
  const navigate = useNavigate()
  const [stats,setStats]=useState(null)
  const [recent,setRecent]=useState([])
  const [recentUsers,setRecentUsers]=useState([])
  const [command,setCommand]=useState(null)
  const [loading,setLoading]=useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
    // Command-centre data (30-day series, queue counts, mix, recent payments).
    // Runs alongside the stats call and fails soft: a broken query only blanks
    // its own panel, never the KPI strip.
    const d30 = new Date(); d30.setHours(0,0,0,0); d30.setDate(d30.getDate()-29)
    const since = d30.toISOString()
    const count = (table, apply) => Promise.resolve(apply(supabase.from(table).select('*',{count:'exact',head:true})))
      .then(r=>r.error?null:(r.count??0)).catch(()=>null)
    const rows = (table, cols, apply) => Promise.resolve(apply(supabase.from(table).select(cols,{count:'exact'})))
      .then(r=>r.error?null:{ rows:r.data||[], total:r.count??0 }).catch(()=>null)
    const commandP = Promise.all([
      count('properties', q=>q.eq('status','active')),
      count('properties', q=>q.eq('status','pending_review')),
      count('properties', q=>q.eq('status','paused')),
      count('properties', q=>q.eq('status','sold')),
      count('properties', q=>q.eq('status','rejected')),
      count('student_verifications', q=>q.eq('status','pending')),
      count('complaints', q=>q.in('status',['open','escalated'])),
      count('payout_queue', q=>q.eq('status','failed')),
      count('withdrawal_requests', q=>q.eq('status','pending')),
      count('payout_accounts', q=>q.eq('status','pending')),
      rows('profiles', 'created_at', q=>q.gte('created_at',since)),
      rows('properties', 'created_at', q=>q.gte('created_at',since)),
      rows('payments', 'amount,created_at', q=>q.eq('status','success').gte('created_at',since)),
      supabase.from('payments').select('id,amount,payment_type,status,created_at').order('created_at',{ascending:false}).limit(6)
        .then(r=>r.error?[]:(r.data||[])).catch(()=>[]),
    ]).then(v=>({
      mix: { active:v[0], pending_review:v[1], paused:v[2], sold:v[3], rejected:v[4] },
      studentIds:v[5], complaints:v[6], failedPayouts:v[7], withdrawals:v[8], bankAccounts:v[9],
      signups:v[10], listings:v[11], payments:v[12], recentPayments:v[13],
    })).catch(()=>null)

    try {
      const d = await adminFetch('stats')
      setStats(d); setRecent(d.recentProps||[]); setRecentUsers(d.recentUsers||[])
    } catch(apiErr) {
      console.warn('Stats API failed:', apiErr.message)
      try {
        const [{count:u},{count:a},{count:p},{data:pay},{data:rp}]=await Promise.all([
          supabase.from('profiles').select('*',{count:'exact',head:true}),
          supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','active'),
          supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
          supabase.from('payments').select('amount').eq('status','success'),
          supabase.from('properties').select('id,title,status,created_at,profiles(full_name)').order('created_at',{ascending:false}).limit(6),
        ])
        setStats({totalUsers:u,activeListings:a,pendingListings:p,totalRevenue:(pay||[]).reduce((s,x)=>s+(x.amount||0),0)})
        setRecent(rp||[])
      } catch(e2){console.error(e2)}
    }
    setCommand(await commandP)
    setLoading(false)
  },[])

  useEffect(()=>{load()},[load])

  const SC={pending_review:'#D4A853',active:'#7A9E7E',rejected:'#C85F2D',paused:'#888',sold:'#888'}
  if(loading) return <Spinner/>

  // ── Derived view data (every figure traces back to a query above) ──────────
  const WINDOW_DAYS = 30
  const windowStart = () => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(WINDOW_DAYS-1)); return d }
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  // One bucket per calendar day, filled only from real rows.
  const dailyBuckets = (series, valueOf=()=>1) => {
    const start = windowStart()
    const buckets = Array.from({length:WINDOW_DAYS}, (_,i)=>{
      const d=new Date(start); d.setDate(start.getDate()+i)
      return { key:dayKey(d), label:d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}), value:0 }
    })
    const index = new Map(buckets.map((b,i)=>[b.key,i]))
    series.rows.forEach(r=>{ const i=index.get(dayKey(new Date(r.created_at))); if(i!==undefined) buckets[i].value+=valueOf(r) })
    return buckets
  }
  const sig = command?.signups ? dailyBuckets(command.signups) : null
  const lst = command?.listings ? dailyBuckets(command.listings) : null
  const pay = command?.payments ? dailyBuckets(command.payments, r=>Number(r.amount)||0) : null
  const capped = [command?.signups, command?.listings, command?.payments].some(s=>s && s.total > s.rows.length)
  const sumLast = (b, n=7) => b ? b.slice(-n).reduce((s,x)=>s+x.value,0) : null
  const hasAny = (b) => !!b && b.some(x=>x.value>0)
  const vals = (b) => b ? b.map(x=>x.value) : []
  const v = (n, f=fmtNum) => (n==null ? '—' : f(n))

  const CHART_SERIES = [
    { key:'signups', label:'New members', color:'#D4A853' },
    { key:'listings', label:'New listings', color:'#7A9E7E' },
  ]
  const chartData = sig && lst ? sig.map((d,i)=>({ label:d.label, signups:d.value, listings:lst[i].value })) : []

  const kpis = [
    { label:'Total users', value:v(stats?.totalUsers), sub: sig ? `+${sumLast(sig)} in last 7 days` : 'Sign-ups unavailable', to:'/admin/users', color:'#5B8DEF', icon:Users, spark:vals(sig) },
    { label:'Active listings', value:v(stats?.activeListings), sub: lst ? `+${sumLast(lst)} new in last 7 days` : 'Listings unavailable', to:'/admin/properties', color:'#7A9E7E', icon:Home, spark:vals(lst) },
    { label:'Pending review', value:v(stats?.pendingListings), sub:'Listings awaiting a decision', to:'/admin/properties', color:'#D4A853', icon:Clock },
    { label:'Total revenue', value: stats?.totalRevenue==null ? '—' : fmt(stats.totalRevenue), sub: pay ? `${fmt(sumLast(pay))} in last 7 days` : 'Payments unavailable', color:'#D4A853', icon:Wallet, spark:vals(pay) },
    { label:'ID pending', value:v(stats?.pendingIdentity), sub:'Identity checks to review', to:'/admin/identity', color:'#C85F2D', icon:Shield },
    { label:'Professionals', value:v(stats?.totalPros), sub:'Active professional accounts', to:'/admin/professionals', color:'#5B8DEF', icon:Briefcase },
    { label:'Mortgage apps', value:v(stats?.mortgageApps), sub:'All applications', to:'/admin/mortgage', color:'#888', icon:FileText },
    { label:'Enquiries', value:v(stats?.rentalEnquiries), sub:'Rental enquiries received', to:'/admin/enquiries', color:'#888', icon:MessageSquare },
  ]

  const mixSlices = [
    { label:'Active', value:command?.mix.active??0, color:'#7A9E7E' },
    { label:'Pending review', value:command?.mix.pending_review??0, color:'#D4A853' },
    { label:'Paused', value:command?.mix.paused??0, color:'#888888' },
    { label:'Sold', value:command?.mix.sold??0, color:'#F0D4BE' },
    { label:'Rejected', value:command?.mix.rejected??0, color:'#C85F2D' },
  ]
  const mixTotal = mixSlices.reduce((s,x)=>s+x.value,0)

  const queues = [
    { key:'id', label:'ID verifications', sub:'Identity documents submitted', count:stats?.pendingIdentity, to:'/admin/identity', color:'#C85F2D' },
    { key:'listings', label:'Listings to review', sub:'Pending review', count:stats?.pendingListings, to:'/admin/properties', color:'#D4A853' },
    { key:'students', label:'Student IDs', sub:'Pending verification', count:command?.studentIds, to:'/admin/student-verifications', color:'#5B8DEF' },
    { key:'complaints', label:'Complaints', sub:'Open or escalated', count:command?.complaints, to:'/admin/complaints', color:'#C94A3A' },
    { key:'failed', label:'Failed payouts', sub:'Retry from Payouts', count:command?.failedPayouts, to:'/admin/payouts', color:'#C85F2D' },
    { key:'withdrawals', label:'Withdrawal requests', sub:'Awaiting approval', count:command?.withdrawals, to:'/admin/payouts', color:'#D4A853' },
    { key:'bank', label:'Bank accounts', sub:'Payout accounts to verify', count:command?.bankAccounts, to:'/admin/payouts', color:'#8B6BD9' },
  ]
  const ranked = queues.filter(q=>typeof q.count==='number' && q.count>0).sort((a,b)=>b.count-a.count)
  const queuesUnknown = queues.some(q=>q.count==null)
  const waitingTotal = ranked.reduce((s,q)=>s+q.count,0)

  const feed = [
    ...recentUsers.map(u=>({ key:`u-${u.id}`, at:u.created_at, icon:UserPlus, color:'#5B8DEF', title:u.full_name||'New member', sub:`Signed up as ${ROLE_LABELS[u.role]||'Member'}` })),
    ...recent.map(p=>({ key:`p-${p.id}`, at:p.created_at, icon:Home, color:SC[p.status]||'#888', title:p.title||'Untitled listing', sub:`${p.profiles?.full_name||'Unknown'} · ${String(p.status||'').replace('_',' ')}` })),
    ...(command?.recentPayments||[]).map(x=>({ key:`pay-${x.id}`, at:x.created_at, icon:Wallet, color:'#D4A853', title:fmt(Number(x.amount)||0), sub:`${String(x.payment_type||'payment').replace(/_/g,' ')} · ${String(x.status||'').replace(/_/g,' ')}` })),
  ].filter(e=>e.at).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,10)

  const emptyBox = (text) => (
    <div className="rounded-xl py-10 px-4 text-center text-xs" style={{ background:'rgba(255,255,255,0.02)', color:'rgba(255,255,255,0.35)' }}>{text}</div>
  )

  return(
    <div className="space-y-4 -mx-1 sm:mx-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-white text-2xl leading-none" style={{fontFamily:"'DM Serif Display', serif"}}>Command centre</h2>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{backgroundColor:'rgba(122,158,126,0.12)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.2)'}}>
            <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:'#7A9E7E',boxShadow:'0 0 0 3px rgba(122,158,126,0.2)'}}/>
            Operational
          </span>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all"
          style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k=>{
          const Icon=k.icon
          return (
            <button key={k.label} type="button" onClick={k.to?()=>navigate(k.to):undefined}
              className={`rounded-2xl p-4 text-left flex flex-col gap-2 min-w-0 ${k.to?'hover:opacity-80 transition-opacity':'cursor-default'}`}
              style={{background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider truncate" style={{color:'rgba(255,255,255,0.45)'}}>{k.label}</span>
                <Icon size={14} style={{color:k.color}} className="shrink-0"/>
              </div>
              <span className="text-2xl font-black text-white leading-none truncate">{k.value}</span>
              {k.spark && k.spark.some(x=>x>0) && <Sparkline values={k.spark} color={k.color} height={30}/>}
              <span className="text-[11px] truncate" style={{color:'rgba(255,255,255,0.4)'}}>{k.sub}</span>
            </button>
          )
        })}
      </div>

      {/* Main chart + mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Activity, last 30 days"
          sub={sig&&lst ? `${fmtNum(sumLast(sig,30))} new members · ${fmtNum(sumLast(lst,30))} new listings` : 'Series unavailable'}>
          {!sig||!lst ? emptyBox('Activity data could not be loaded. Refresh to try again.')
            : !(hasAny(sig)||hasAny(lst)) ? emptyBox('No sign-ups or listings in the last 30 days yet.')
            : (
              <>
                <AreaChart data={chartData} series={CHART_SERIES} height={240} format={compactNum}/>
                {capped && <p className="text-[11px] mt-3" style={{color:'rgba(255,255,255,0.35)'}}>Some series hit the row limit, so older days may be undercounted.</p>}
              </>
            )}
        </Panel>

        <Panel title="Listing mix" sub="Listings by current status">
          {!command ? emptyBox('Listing mix could not be loaded.')
            : mixTotal===0 ? emptyBox('No listings yet.')
            : (
              <div className="flex flex-col items-center gap-5">
                <Donut slices={mixSlices} size={156} thickness={20} center={fmtNum(mixTotal)} centerSub="listings"/>
                <div className="w-full space-y-2">
                  {mixSlices.map(s=>(
                    <div key={s.label} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{background:s.color}}/>
                        <span className="text-white truncate">{s.label}</span>
                      </span>
                      <span style={{color:'rgba(255,255,255,0.55)'}}>{fmtNum(s.value)} · {Math.round(s.value/mixTotal*100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </Panel>
      </div>

      {/* Attention + activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Needs attention" sub={(command||stats) ? (waitingTotal ? `${fmtNum(waitingTotal)} items across ${ranked.length} queue${ranked.length===1?'':'s'}, largest first` : 'Nothing is waiting') : 'Queues unavailable'}>
          {ranked.length===0 ? (
            queuesUnknown
              ? emptyBox('Some queue counts could not be loaded.')
              : (
                <div className="rounded-xl py-8 px-4 text-center" style={{background:'rgba(122,158,126,0.06)',border:'1px solid rgba(122,158,126,0.15)'}}>
                  <CheckCircle size={20} className="mx-auto mb-2" style={{color:'#7A9E7E'}}/>
                  <p className="text-sm font-semibold text-white">All queues are clear</p>
                  <p className="text-xs mt-1" style={{color:'rgba(255,255,255,0.4)'}}>Nothing is waiting on a decision right now.</p>
                </div>
              )
          ) : (
            <div className="space-y-2">
              {ranked.map(q=>(
                <button key={q.key} type="button" onClick={()=>navigate(q.to)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/[0.03] transition-colors min-w-0"
                  style={{border:'1px solid rgba(255,255,255,0.06)'}}>
                  <span className="w-1 h-9 rounded-full shrink-0" style={{background:q.color}}/>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{q.label}</span>
                    <span className="block text-[11px] truncate" style={{color:'rgba(255,255,255,0.4)'}}>{q.sub}</span>
                  </span>
                  <span className="text-lg font-black text-white leading-none shrink-0">{fmtNum(q.count)}</span>
                  <ChevronRight size={14} className="shrink-0" style={{color:'rgba(255,255,255,0.3)'}}/>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent activity" sub="Latest sign-ups, listings and payments"
          action={(
            <div className="flex items-center gap-3 shrink-0">
              <NavLink to="/admin/users" className="text-xs font-semibold flex items-center gap-0.5 whitespace-nowrap" style={{color:'#D4A853'}}>Users <ChevronRight size={12}/></NavLink>
              <NavLink to="/admin/properties" className="text-xs font-semibold flex items-center gap-0.5 whitespace-nowrap" style={{color:'#D4A853'}}>Listings <ChevronRight size={12}/></NavLink>
            </div>
          )}>
          {feed.length===0 ? emptyBox('No activity yet.') : (
            <ul className="space-y-1">
              {feed.map(e=>{
                const Icon=e.icon
                return (
                  <li key={e.key} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.02] transition-colors min-w-0">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background:`${e.color}1A`}}>
                      <Icon size={14} style={{color:e.color}}/>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{e.title}</span>
                      <span className="block text-[11px] truncate" style={{color:'rgba(255,255,255,0.4)'}}>{e.sub}</span>
                    </span>
                    <span className="text-[11px] shrink-0" style={{color:'rgba(255,255,255,0.3)'}}>{ago(e.at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ── PROPERTIES ─────────────────────────────────────────────────────────────────
function PropertiesTab() {
  const {user}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [confirm,setConfirm]=useState(null)
  const SM={pending_review:{label:'Pending',color:'#D4A853'},active:{label:'Live',color:'#7A9E7E'},rejected:{label:'Rejected',color:'#C85F2D'},paused:{label:'Paused',color:'#888'},sold:{label:'Sold',color:'#888'}}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('properties').select('id,title,category,listing_type,price,status,state,city,created_at,profiles(full_name,email)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data,error}=await q
    if(error) toast.error('Failed to load properties')
    setItems(data||[]); setLoading(false)
  },[filter])

  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,title)=>{
    const {error}=await supabase.from('properties').update({status:s,verified_by:user?.id,verified_at:s==='active'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('property_status',{id,status:s,by:user?.id})
    toast.success(`"${title}" → ${SM[s]?.label||s}`)
    load(); setConfirm(null)
  }

  const filtered=items.filter(i=>!search||i.title?.toLowerCase().includes(search.toLowerCase())||i.profiles?.full_name?.toLowerCase().includes(search.toLowerCase())||i.state?.toLowerCase().includes(search.toLowerCase()))

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search title, owner, state…"/>
        <FilterBar value={filter} onChange={setFilter} options={[['all','All'],['pending_review','Pending'],['active','Live'],['rejected','Rejected'],['paused','Paused'],['sold','Sold']]}/>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} listing{filtered.length!==1?'s':''}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Property','Owner','Price','Type','Status','Date','Actions']}>
          {filtered.map(p=>{
            const meta=SM[p.status]||{label:p.status,color:'#888'}
            return(<TR key={p.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm truncate max-w-[180px]">{p.title}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{p.city}, {p.state}</div></td>
              <td className="px-4 py-3"><div className="text-white text-xs">{p.profiles?.full_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{maskEmail(p.profiles?.email)}</div></td>
              <td className="px-4 py-3 text-white font-semibold text-sm">{fmt(p.price||0)}</td>
              <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.5)'}}>{(p.listing_type||p.category||'N/A').replace(/_/g,' ')}</td>
              <td className="px-4 py-3"><Badge label={meta.label} color={meta.color}/></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(p.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {p.status!=='active'&&<ActionBtn icon={Check} color="#7A9E7E" tip="Approve" onClick={()=>setConfirm({title:'Approve listing?',body:`"${p.title}" will go live.`,onConfirm:()=>setStatus(p.id,'active',p.title)})}/>}
                  {p.status==='active'&&<ActionBtn icon={Pause} color="#D4A853" tip="Pause" onClick={()=>setConfirm({title:'Pause listing?',body:`"${p.title}" will be hidden.`,onConfirm:()=>setStatus(p.id,'paused',p.title)})}/>}
                  {p.status==='paused'&&<ActionBtn icon={Play} color="#5B8DEF" tip="Restore" onClick={()=>setStatus(p.id,'active',p.title)}/>}
                  {p.status!=='rejected'&&<ActionBtn icon={X} color="#C85F2D" tip="Reject" onClick={()=>setConfirm({title:'Reject listing?',body:`"${p.title}" will be rejected.`,danger:true,onConfirm:()=>setStatus(p.id,'rejected',p.title)})}/>}
                </div>
              </td>
            </TR>)
          })}
          {filtered.length===0&&<EmptyRow cols={7} msg="No listings found"/>}
        </TableWrap>
      )}
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── USERS ──────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [items,setItems]=useState([])
  const [total,setTotal]=useState(0)
  const [page,setPage]=useState(0)
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [roleFilter,setRoleFilter]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [confirm,setConfirm]=useState(null)
  const [roleTarget,setRoleTarget]=useState(null)
  const PAGE=50

  const [apiError,setApiError]=useState('')

  const load=useCallback(async(pg=0,q=search,role=roleFilter,status=statusFilter)=>{
    setLoading(true)
    setApiError('')
    try{
      // First try: API route using service role key
      const params=new URLSearchParams({page:pg,limit:PAGE})
      if(q) params.set('search',q)
      if(role) params.set('role',role)
      if(status) params.set('status',status)
      const res=await adminFetch(`users?${params}`)
      setItems(res.users||[]); setTotal(res.total||0); setPage(pg)
      setLoading(false); return
    }catch(apiErr){
      console.warn('API route failed, trying direct query:', apiErr.message)
    }
    // Second try: direct Supabase query (works if admin RLS policy is applied)
    try{
      let q2=supabase.from('profiles')
        .select('id,full_name,email,phone,role,account_status,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated',{count:'exact'})
        .order('created_at',{ascending:false})
        .range(pg*PAGE, pg*PAGE+PAGE-1)
      if(q) q2=q2.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      if(role) q2=q2.eq('role',role)
      if(status) q2=q2.eq('account_status',status)
      const {data,count,error}=await q2
      if(error) throw error
      setItems(data||[]); setTotal(count||data?.length||0); setPage(pg)
    }catch(dbErr){
      console.error('Direct query also failed:', dbErr.message)
      setApiError(dbErr.message)
    }
    setLoading(false)
  },[search,roleFilter,statusFilter])

  useEffect(()=>{load(0,'','','')},[])


  const action=async(act,userId,name,role='')=>{
    try{
      await adminFetch('users',{method:'POST',body:JSON.stringify({action:act,userId,role})})
      const msgs={suspend:`${name} suspended`,unsuspend:`${name} unsuspended`,deactivate:`${name} deactivated`,set_role:`Role -> ${ROLE_LABELS[role]||role}`}
      toast.success(msgs[act]||'Done')
      setConfirm(null); setRoleTarget(null); load(page)
    }catch(e){toast.error(e.message)}
  }

  const IDC={approved:'#7A9E7E',submitted:'#D4A853',rejected:'#C85F2D'}

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={v=>{setSearch(v);load(0,v,roleFilter,statusFilter)}} onSearch={v=>load(0,v,roleFilter,statusFilter)} placeholder="Search name or email…"/>
        {/* Role is staff-only now (Admin/Agent/Verifier) - a regular
            member simply has no role value. Status (active/suspended/
            deleted) is its own filter, completely separate from role. */}
        <select value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);load(0,search,e.target.value,statusFilter)}}
          className="px-3 py-2.5 rounded-xl text-xs outline-none font-semibold"
          style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:roleFilter?'#D4A853':'rgba(255,255,255,0.5)',minWidth:120}}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k} style={{backgroundColor:'#17211B'}}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);load(0,search,roleFilter,e.target.value)}}
          className="px-3 py-2.5 rounded-xl text-xs outline-none font-semibold"
          style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:statusFilter?'#D4A853':'rgba(255,255,255,0.5)',minWidth:120}}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k} style={{backgroundColor:'#17211B'}}>{v}</option>)}
        </select>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{total} user{total!==1?'s':''} total</div>
      {apiError&&(
        <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(200,95,45,0.08)',border:'1px solid rgba(200,95,45,0.2)'}}>
          <p className="text-xs font-bold mb-1" style={{color:'#C85F2D'}}>Could not load users from database</p>
          <p className="text-xs mb-2" style={{color:'rgba(255,255,255,0.5)'}}>Error: {apiError}</p>
          <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Fix: Run the SQL below in Supabase SQL Editor, then refresh this page.</p>
          <pre className="text-xs mt-2 p-3 rounded-xl overflow-x-auto" style={{backgroundColor:'rgba(0,0,0,0.3)',color:'#7A9E7E',fontFamily:'monospace'}}>
{`DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.id = auth.uid()
    AND p2.role IN ('admin','agent','verifier')
  )
);`}
          </pre>
        </div>
      )}
      {loading?<Spinner/>:(
        <>
          <TableWrap cols={['User','Contact','Role','Status','ID Status','Joined','Actions']}>
            {items.map(u=>(
              <TR key={u.id}>
                <td className="px-4 py-3" style={{opacity:u.is_deactivated?0.45:1}}>
                  <div className="font-semibold text-white text-sm">{u.full_name||'N/A'}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{u.onboarding_completed ? 'Yes' : 'No'}{u.is_deactivated?' Deactivated':''}</div>
                </td>
                <td className="px-4 py-3"><div className="text-white text-xs">{maskEmail(u.email)}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskPhone(u.phone)}</div></td>
                <td className="px-4 py-3"><Badge label={ROLE_LABELS[u.role]||u.role||'Member'} color={ROLE_COLORS[u.role]||'#888'}/></td>
                <td className="px-4 py-3"><Badge label={STATUS_LABELS[u.account_status]||'Active'} color={STATUS_COLORS[u.account_status]||STATUS_COLORS.active}/></td>
                <td className="px-4 py-3">
                  {u.identity_verification_status==='approved'&&<Badge label="Verified" color="#7A9E7E"/>}
                  {u.identity_verification_status==='submitted'&&<Badge label="Pending" color="#D4A853"/>}
                  {u.identity_verification_status==='rejected'&&<Badge label="Rejected" color="#C85F2D"/>}
                  {(!u.identity_verification_status||u.identity_verification_status==='unverified')&&<span className="text-xs" style={{color:'rgba(255,255,255,0.2)'}}>None</span>}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <ActionBtn icon={UserCog} color="#D4A853" tip="Change role" onClick={()=>setRoleTarget({id:u.id,current:u.role,name:u.full_name||u.email})}/>
                    {u.account_status!=='suspended'&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Ban} color="#C85F2D" tip="Suspend" onClick={()=>setConfirm({title:'Suspend user?',body:`${u.full_name||'User'} will lose access immediately. Their role is not affected and is restored automatically on unsuspend.`,danger:true,onConfirm:()=>action('suspend',u.id,u.full_name||u.email)})}/>}
                    {u.account_status==='suspended'&&<ActionBtn icon={Play} color="#7A9E7E" tip="Unsuspend" onClick={()=>action('unsuspend',u.id,u.full_name||u.email)}/>}
                    {!u.is_deactivated&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Trash2} color="#888" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate account?',body:`${u.full_name||'User'}'s account will be permanently deactivated.`,danger:true,onConfirm:()=>action('deactivate',u.id,u.full_name||u.email)})}/>}
                  </div>
                </td>
              </TR>
            ))}
            {items.length===0&&<EmptyRow cols={7} msg="No users found"/>}
          </TableWrap>
          {total>PAGE&&(
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{page*PAGE+1} to {Math.min((page+1)*PAGE,total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={()=>load(page-1)} disabled={page===0} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Prev</button>
                <button onClick={()=>load(page+1)} disabled={(page+1)*PAGE>=total} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
      <AnimatePresence>
        {roleTarget&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-sm rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <UserCog size={22} style={{color:'#D4A853'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Assign Role</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Changing role for <strong className="text-white">{roleTarget.name}</strong></p>
              {/* Full role list, matching original admin capability - an
                  admin can reassign a persona (buyer/landlord/etc.) or
                  grant a staff role from the same modal. Only 'suspended'
                  is gone from here for good; that's a Status action now,
                  not a role. */}
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {Object.entries(ROLE_LABELS).map(([r,l])=>(
                  <button key={r} onClick={()=>action('set_role',roleTarget.id,roleTarget.name,r)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                    style={{backgroundColor:roleTarget.current===r?`${ROLE_COLORS[r]||'#888888'}18`:'rgba(255,255,255,0.04)',border:`1px solid ${roleTarget.current===r?(ROLE_COLORS[r]||'#888')+'44':'rgba(255,255,255,0.06)'}`}}>
                    <span className="text-sm font-semibold text-white">{l}</span>
                    {roleTarget.current===r&&<Check size={14} style={{color:ROLE_COLORS[r]||'#D4A853'}}/>}
                  </button>
                ))}
              </div>
              <button onClick={()=>setRoleTarget(null)} className="w-full py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── IDENTITY VERIFICATION ──────────────────────────────────────────────────────
function IdentityTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('submitted')
  const [confirm,setConfirm]=useState(null)
  const [reject,setReject]=useState(null)
  const [reason,setReason]=useState('')
  const [lightbox,setLightbox]=useState(null)
  const DOC={nin:'NIN Slip',voters:"Voter's Card",passport:'Passport',drivers:"Driver's License"}
  const SC={submitted:'#D4A853',approved:'#7A9E7E',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('profiles').select('id,full_name,email,phone,role,identity_photo_url,identity_selfie_url,identity_doc_type,identity_verification_status,identity_verified_at,identity_rejection_note,identity_nin_submitted_at,created_at').order('created_at',{ascending:false}).limit(200)
    if(filter==='all') q=q.in('identity_verification_status',['submitted','approved','rejected'])
    else q=q.eq('identity_verification_status',filter)
    const {data,error}=await q
    if(error){console.error('[Identity verify load]', error.message); toast.error('Could not load identity submissions. Please retry, or contact support if this keeps happening.'); setLoading(false); return}
    // Generate 30-min signed URLs for private identity-docs bucket
    const enriched=await Promise.all((data||[]).map(async u=>{
      let photo_signed=null,selfie_signed=null
      if(u.identity_photo_url){
        const path=u.identity_photo_url.replace(/^identity-docs\//,'')
        const {data:sd}=await supabase.storage.from('identity-docs').createSignedUrl(path,1800)
        photo_signed=sd?.signedUrl||null
      }
      if(u.identity_selfie_url){
        const path=u.identity_selfie_url.replace(/^identity-docs\//,'')
        const {data:sd}=await supabase.storage.from('identity-docs').createSignedUrl(path,1800)
        selfie_signed=sd?.signedUrl||null
      }
      return{...u,photo_signed,selfie_signed}
    }))
    setItems(enriched); setLoading(false)
  },[filter])

  useEffect(()=>{load()},[load])

  const approve=async(id,name)=>{
    const {error}=await supabase.from('profiles').update({identity_verification_status:'approved',is_photo_verified:true,is_live_verified:true,identity_verified_at:new Date().toISOString(),identity_verified_by:admin?.id,identity_rejection_note:null,verification_skipped:false}).eq('id',id)
    if(error){toast.error(friendlyDbError(error,'Could not approve. Please try again.'));return}
    await auditLog('identity_approved',{user_id:id,by:admin?.id})
    // Let the user know in-app (bell + email) and via a status they'll see
    // next time they load their profile/dashboard - the update above is
    // what actually flips that view, this just tells them it happened.
    notifyIdentityApproved(id)
    toast.success(`${name} - verified`); setConfirm(null); load()
  }

  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter rejection reason');return}
    const {error}=await supabase.from('profiles').update({identity_verification_status:'rejected',is_photo_verified:false,is_live_verified:false,identity_rejection_note:reason.trim(),identity_verified_by:admin?.id}).eq('id',reject.id)
    if(error){toast.error('Failed');return}
    await auditLog('identity_rejected',{user_id:reject.id,reason,by:admin?.id})
    notifyIdentityRejected(reject.id, reason.trim())
    toast.success(`${reject.name} - rejected`); setReject(null); setReason(''); load()
  }

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.45)'}}>Approving sets <code style={{color:'#7A9E7E'}}>is_photo_verified + is_live_verified = true</code> - unlocks all transactions. All actions are audit-logged.</p>
      </div>
      <FilterBar value={filter} onChange={setFilter} options={[['submitted','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All Submitted']]}/>
      {loading?<Spinner/>:(
        <div className="space-y-3">
          {items.map(u=>(
            <div key={u.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-semibold text-sm">{u.full_name||'N/A'}</span>
                    <Badge label={u.identity_verification_status} color={SC[u.identity_verification_status]||'#888'}/>
                    {u.identity_doc_type&&<Badge label={DOC[u.identity_doc_type]||u.identity_doc_type} color="#5B8DEF"/>}
                    <Badge label={u.identity_nin_submitted_at?'NIN/BVN submitted':'NIN/BVN not submitted'} color={u.identity_nin_submitted_at?'#7A9E7E':'#C85F2D'}/>
                    <Badge label={ROLE_LABELS[u.role]||u.role||'N/A'} color={ROLE_COLORS[u.role]||'#888'}/>
                  </div>
                  <div className="text-xs mb-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(u.email)} · {maskPhone(u.phone)}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{ago(u.created_at)}</div>
                  <div className="text-xs mt-0.5" style={{color:u.identity_nin_submitted_at?'rgba(255,255,255,0.4)':'#C85F2D'}}>
                    {u.identity_nin_submitted_at?`NIN/BVN submitted ${ago(u.identity_nin_submitted_at)}`:'NIN/BVN not submitted yet. Approval is blocked until it is.'}
                  </div>
                  {u.identity_rejection_note&&<div className="mt-2 text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(200,95,45,0.08)',color:'#C85F2D'}}>Prev rejection: {u.identity_rejection_note}</div>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {u.photo_signed&&<button onClick={()=>setLightbox({src:u.photo_signed,label:`${u.full_name||'User'} - ID Doc`})} className="relative overflow-hidden rounded-xl border" style={{width:80,height:56,borderColor:'rgba(255,255,255,0.1)'}}>
                    <img src={u.photo_signed} alt="ID" className="w-full h-full object-cover" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}}/>
                    <div style={{display:'none',position:'absolute',inset:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.3)',fontSize:9}}>No bucket</div>
                    <div className="absolute bottom-0 left-0 right-0 text-center py-0.5 text-white" style={{fontSize:8,backgroundColor:'rgba(0,0,0,0.6)'}}>ID DOC · TAP TO VIEW</div>
                  </button>}
                  {u.selfie_signed&&<button onClick={()=>setLightbox({src:u.selfie_signed,label:`${u.full_name||'User'} - Selfie`})} className="relative overflow-hidden rounded-xl border" style={{width:56,height:56,borderColor:'rgba(255,255,255,0.1)'}}>
                    <img src={u.selfie_signed} alt="Selfie" className="w-full h-full object-cover" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}}/>
                    <div style={{display:'none',position:'absolute',inset:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.3)',fontSize:9}}></div>
                    <div className="absolute bottom-0 left-0 right-0 text-center py-0.5 text-white" style={{fontSize:8,backgroundColor:'rgba(0,0,0,0.6)'}}>SELFIE</div>
                  </button>}
                  {!u.identity_photo_url&&!u.identity_selfie_url&&<div className="flex items-center justify-center rounded-xl text-xs" style={{width:80,height:56,backgroundColor:'rgba(255,255,255,0.04)',color:'rgba(255,255,255,0.2)'}}>No docs</div>}
                </div>
              </div>
              {u.identity_verification_status==='submitted'&&(
                <div className="flex gap-2 mt-3">
                  <button disabled={!u.identity_nin_submitted_at} onClick={()=>setConfirm({title:'Approve identity?',body:`${u.full_name} will be fully verified and unlock all transactions.`,onConfirm:()=>approve(u.id,u.full_name||u.email)})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.3)'}}>
                    <Check size={13}/> Approve & Verify
                  </button>
                  <button onClick={()=>setReject({id:u.id,name:u.full_name||u.email})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D',border:'1px solid rgba(200,95,45,0.2)'}}>
                    <X size={13}/> Reject
                  </button>
                </div>
              )}
              {u.identity_verification_status==='approved'&&<div className="mt-2 text-xs" style={{color:'#7A9E7E'}}> Verified {u.identity_verified_at?ago(u.identity_verified_at):''}</div>}
            </div>
          ))}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No {filter==='all'?'submitted':filter} verifications</div>}
        </div>
      )}
      <AnimatePresence>
        {reject&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-sm rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <X size={22} style={{color:'#C85F2D'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Reject Identity</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Tell <strong className="text-white">{reject.name}</strong> why their ID was rejected.</p>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. Photo is blurry. Please upload a clearer image." className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
              <div className="flex gap-3">
                <button onClick={()=>{setReject(null);setReason('')}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C85F2D',color:'#17211B'}}>Send Rejection</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
      <AnimatePresence>
        {lightbox&&<ImageLightbox src={lightbox.src} label={lightbox.label} onClose={()=>setLightbox(null)}/>}
      </AnimatePresence>
    </div>
  )
}

// ── SKILL VERIFICATION QUEUE ─────────────────────────────────────────────────
// ADR-008's Level 2 review surface. Submissions come from
// verification_submissions (written by the provider via submit_verification()
// -- see SkillVerificationPage.jsx); approving/rejecting here calls
// review_verification_submission(), a SECURITY DEFINER RPC that is the ONLY
// path that can move verified_providers.level. This tab never writes to
// verified_providers directly, matching the "no client write" RLS policy on
// that table (see 20260812000000_production_hardening.sql).
function SkillVerifyTab() {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('pending')
  const [lightbox,setLightbox]=useState(null)
  const [reject,setReject]=useState(null)
  const [reason,setReason]=useState('')
  const [busyId,setBusyId]=useState(null)
  const SC={pending:'#D4A853',approved:'#7A9E7E',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('verification_submissions').select('id,user_id,level,kind,submission_data,status,admin_note,created_at').eq('level',2).order('created_at',{ascending:false}).limit(200)
    q = filter==='all' ? q : q.eq('status',filter)
    const {data,error}=await q
    if(error){toast.error('Could not load submissions');setLoading(false);return}
    const userIds=[...new Set((data||[]).map(s=>s.user_id))]
    const {data:profiles}=userIds.length?await supabase.from('profiles').select('id,full_name,email,phone').in('id',userIds):{data:[]}
    const enriched=await Promise.all((data||[]).map(async s=>{
      const paths=s.submission_data?.portfolio_paths||[]
      const signedUrls=await Promise.all(paths.slice(0,6).map(async p=>{
        const {data:sd}=await supabase.storage.from('provider-portfolio').createSignedUrl(p,1800)
        return sd?.signedUrl||null
      }))
      return {...s, profile:profiles?.find(p=>p.id===s.user_id), signedUrls:signedUrls.filter(Boolean)}
    }))
    setItems(enriched); setLoading(false)
  },[filter])

  useEffect(()=>{load()},[load])

  const approve=async(item)=>{
    setBusyId(item.id)
    const {error}=await supabase.rpc('review_verification_submission',{p_submission_id:item.id,p_approve:true,p_note:null})
    setBusyId(null)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('skill_verification_approved',{submission_id:item.id,user_id:item.user_id})
    toast.success(`${item.profile?.full_name||'Provider'} - Skill Verified`); load()
  }
  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter a reason');return}
    setBusyId(reject.id)
    const {error}=await supabase.rpc('review_verification_submission',{p_submission_id:reject.id,p_approve:false,p_note:reason.trim()})
    setBusyId(null)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('skill_verification_rejected',{submission_id:reject.id,reason})
    toast.success('Submission rejected'); setReject(null); setReason(''); load()
  }

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Award size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.45)'}}>Portfolio-first review, per the handoff spec: photos of real work matter more than certificates. Approving moves the provider to Level 2 and they start appearing in Find a Provider search.</p>
      </div>
      <FilterBar value={filter} onChange={setFilter} options={[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All']]}/>
      {loading?<Spinner/>:items.length===0?(
        <div className="text-center py-12 text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No submissions in this filter</div>
      ):(
        <div className="space-y-3">
          {items.map(s=>(
            <div key={s.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-white font-semibold text-sm">{s.profile?.full_name||'N/A'}</span>
                <Badge label={s.status} color={SC[s.status]||'#888'}/>
                {s.submission_data?.category&&<Badge label={s.submission_data.category} color="#5B8DEF"/>}
              </div>
              <div className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(s.profile?.email)} · {maskPhone(s.profile?.phone)} · {ago(s.created_at)}</div>
              <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.55)'}}>{s.submission_data?.description}</p>
              {s.submission_data?.years_experience&&<div className="text-xs mb-1" style={{color:'rgba(255,255,255,0.4)'}}>{s.submission_data.years_experience} years experience</div>}
              {s.submission_data?.references&&<div className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>References: {s.submission_data.references}</div>}
              {s.signedUrls.length>0&&(
                <div className="flex gap-2 flex-wrap mb-3">
                  {s.signedUrls.map((url,i)=>(
                    <button key={i} onClick={()=>setLightbox({src:url,label:s.profile?.full_name})} className="w-16 h-16 rounded-xl overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover"/>
                    </button>
                  ))}
                </div>
              )}
              {s.status==='pending'&&(
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>setReject(s)} disabled={busyId===s.id} className="py-2.5 rounded-2xl text-xs font-bold disabled:opacity-40" style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>Reject</button>
                  <button onClick={()=>approve(s)} disabled={busyId===s.id} className="py-2.5 rounded-2xl text-xs font-bold disabled:opacity-40" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E'}}>{busyId===s.id?'Processing...':'Approve - Skill Verified'}</button>
                </div>
              )}
              {s.status==='rejected'&&s.admin_note&&<div className="text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(200,95,45,0.08)',color:'#C85F2D'}}>Reason: {s.admin_note}</div>}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {reject&&(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full sm:max-w-sm rounded-2xl p-5" style={{backgroundColor:'#17211B'}}>
              <h3 className="text-white font-bold text-sm mb-3">Reject submission</h3>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Reason (shown to the provider)"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-3" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'#fff'}}/>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>{setReject(null);setReason('')}} className="py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C85F2D',color:'#17211B'}}>Send Rejection</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {lightbox&&<ImageLightbox src={lightbox.src} label={lightbox.label} onClose={()=>setLightbox(null)}/>}
      </AnimatePresence>
    </div>
  )
}

// ── DEAL PIPELINE ─────────────────────────────────────────────────────────────
// Reads admin_deal_pipeline, the view unifying the legacy escrow world and
// the ADR-009 category-transactions world into one Enquiry -> Negotiation ->
// Paid (Escrow) -> Completed -> Commissioned/Lost pipeline (see
// 20260812000000_production_hardening.sql). Read-only -- this tab is a
// dashboard, not an editor; stage transitions still happen through their
// normal flows (payment webhooks, RPCs), not by dragging cards here.
const PIPELINE_STAGES=[
  {id:'enquiry',    label:'Enquiry',      color:'#647068'},
  {id:'negotiation',label:'Negotiation',  color:'#D4A853'},
  {id:'paid_escrow',label:'Paid (Escrow)',color:'#5B8DEF'},
  {id:'completed',  label:'Completed',    color:'#7A9E7E'},
  {id:'disputed',   label:'Disputed',     color:'#C94A3A'},
  {id:'lost',       label:'Lost',         color:'#555'},
]
function PipelineTab() {
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [source,setSource]=useState('all')
  const [cancellingId,setCancellingId]=useState(null)
  const [payingOutId,setPayingOutId]=useState(null)

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('admin_deal_pipeline').select('*').order('created_at',{ascending:false}).limit(300)
    if(error){toast.error('Could not load pipeline');setLoading(false);return}
    setRows(data||[]); setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  // Only 'category' deals map 1:1 onto public.transactions.id, which is
  // what cancel_transaction() operates on - 'legacy' real-estate deals are
  // backed by escrow_transactions and need their own equivalent, so the
  // button only appears where it can actually do something.
  const cancelDeal = async (item) => {
    if (!window.confirm(`Cancel "${item.listing_title||'this job'}"? This cannot be undone.`)) return
    setCancellingId(item.deal_id)
    const { error } = await supabase.rpc('cancel_transaction', {
      p_transaction_id: Number(item.deal_id),
      p_reason: 'Cancelled by admin via Pipeline',
    })
    setCancellingId(null)
    if (error) { toast.error(error.message || 'Could not cancel this deal'); return }
    toast.success('Deal cancelled')
    load()
  }

  // Only appears on completed category deals, and only once - the RPC
  // itself also refuses a second run for the same transaction, this just
  // avoids a wasted round-trip and a confusing duplicate-error toast.
  const payoutReferrals = async (item) => {
    if (!window.confirm(`Process referral payouts for "${item.listing_title||'this job'}"? This cannot be undone.`)) return
    setPayingOutId(item.deal_id)
    const result = await processReferralPayoutsForTransaction(Number(item.deal_id))
    setPayingOutId(null)
    if (!result.success) { toast.error(result.error || 'Could not process referral payouts'); return }
    toast.success(result.payoutsMade > 0 ? `${result.payoutsMade} referral payout(s) credited` : 'No referrers in this chain - nothing to pay out')
    load()
  }

  const filtered = source==='all' ? rows : rows.filter(r=>r.source===source)
  const byStage = PIPELINE_STAGES.map(stage=>({
    ...stage,
    items: filtered.filter(r=>r.pipeline_stage===stage.id),
  }))
  const totalValue = filtered.filter(r=>r.pipeline_stage==='completed').reduce((s,r)=>s+Number(r.amount||0),0)
  const commissioned = filtered.filter(r=>r.commissioned).length

  return(
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Total deals</p>
          <p className="text-white font-bold text-lg">{filtered.length}</p>
        </div>
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Completed value</p>
          <p className="text-white font-bold text-lg">₦{totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Commissioned</p>
          <p className="text-white font-bold text-lg">{commissioned}</p>
        </div>
      </div>
      <FilterBar value={source} onChange={setSource} options={[['all','All'],['legacy','Real Estate'],['category','Categories']]}/>
      {loading?<Spinner/>:(
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {byStage.map(stage=>(
            <div key={stage.id} className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{color:stage.color}}>{stage.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{backgroundColor:stage.color+'22',color:stage.color}}>{stage.items.length}</span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stage.items.slice(0,30).map(item=>{
                  const canCancel = item.source==='category' && (stage.id==='enquiry'||stage.id==='negotiation')
                  const canPayoutReferrals = item.source==='category' && stage.id==='completed'
                  return (
                  <div key={item.source+item.deal_id} className="rounded-xl p-2.5" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                    <p className="text-xs font-semibold text-white truncate">{item.listing_title||'Untitled'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px]" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</span>
                      {item.amount>0&&<span className="text-[10px] font-bold" style={{color:'rgba(255,255,255,0.6)'}}>₦{Number(item.amount).toLocaleString()}</span>}
                    </div>
                    {canCancel && (
                      <button onClick={()=>cancelDeal(item)} disabled={cancellingId===item.deal_id}
                        className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>
                        {cancellingId===item.deal_id?'Cancelling...':'Cancel'}
                      </button>
                    )}
                    {canPayoutReferrals && (
                      <button onClick={()=>payoutReferrals(item)} disabled={payingOutId===item.deal_id}
                        className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        style={{backgroundColor:'rgba(212,168,83,0.12)',color:'#D4A853'}}>
                        {payingOutId===item.deal_id?'Processing...':'Pay Out Referrals'}
                      </button>
                    )}
                  </div>
                  )
                })}
                {stage.items.length===0&&<p className="text-[11px] text-center py-4" style={{color:'rgba(255,255,255,0.25)'}}>Empty</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TRANSACTIONS ───────────────────────────────────────────────────────────────
function TransactionsTab() {
  const [tab,setTab]=useState('payments')
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const SC={success:'#7A9E7E',paid:'#7A9E7E',confirmed:'#7A9E7E',released:'#7A9E7E',pending:'#D4A853',funded:'#5B8DEF',failed:'#C85F2D',rejected:'#C85F2D',disputed:'#C85F2D',refunded:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      if(tab==='payments'){const{data}=await supabase.from('payments').select('id,reference,amount,payment_type,email,status,created_at').order('created_at',{ascending:false}).limit(200);setItems(data||[])}
      else if(tab==='escrow'){
        // ✅ SCHEMA FIX (Aug 2026 hardening pass): was selecting amount/
        // platform_fee, which don't exist on escrow_transactions (the real
        // columns are gross_amount/platform_amount) -- aliased back to
        // amount/platform_fee here so the rest of this component (the
        // `total` calc and the render below) doesn't need to change. Also
        // disambiguates the profiles embed: escrow_transactions has FOUR
        // FKs to profiles (buyer/seller/agent/referrer), so a bare
        // `profiles(full_name)` is ambiguous and PostgREST rejects it --
        // pinned to seller_id (the landlord/seller, most relevant party
        // for an admin transactions list).
        const{data}=await supabase.from('escrow_transactions').select('id,amount:gross_amount,platform_fee:platform_amount,status,payment_ref,created_at,properties(title),profiles:profiles!escrow_transactions_seller_id_fkey(full_name)').order('created_at',{ascending:false}).limit(200);setItems(data||[])
      }
    }catch(e){console.error(e)}
    setLoading(false)
  },[tab])
  useEffect(()=>{load()},[load])

  const filtered=items.filter(i=>!search||i.reference?.toLowerCase().includes(search.toLowerCase())||i.email?.toLowerCase().includes(search.toLowerCase())||i.description?.toLowerCase().includes(search.toLowerCase())||i.user_name?.toLowerCase().includes(search.toLowerCase())||i.properties?.title?.toLowerCase().includes(search.toLowerCase()))
  const total=items.reduce((s,i)=>s+(i.amount||0),0)

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          {[['payments','Flutterwave'],['escrow','Escrow']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className="px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{backgroundColor:tab===k?'#D4A853':'rgba(255,255,255,0.06)',color:tab===k?'#17211B':'rgba(255,255,255,0.5)'}}>{l}</button>
          ))}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search reference, email…"/>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} records · Total: {fmt(total)}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={tab==='payments'?['Reference','Amount','Type','Email','Status','Date']:['Property','User','Amount','Fee','Status','Date']}>
          {filtered.map(item=>(
            <TR key={item.id}>
              {tab==='payments'&&<>
                <td className="px-4 py-3 font-mono text-xs text-white">{(item.reference||'N/A').slice(0,16)}…</td>
                <td className="px-4 py-3 font-semibold text-white">{fmt(item.amount||0)}</td>
                <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.5)'}}>{(item.payment_type||'N/A').replace(/_/g,' ')}</td>
                <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{maskEmail(item.email)}</td>
                <td className="px-4 py-3"><Badge label={item.status||'N/A'} color={SC[item.status]||'#888'}/></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</td>
              </>}
              {tab==='escrow'&&<>
                <td className="px-4 py-3 text-white text-xs truncate max-w-[140px]">{item.properties?.title||'N/A'}</td>
                <td className="px-4 py-3 text-white text-xs">{item.profiles?.full_name||'N/A'}</td>
                <td className="px-4 py-3 font-semibold text-white">{fmt(item.amount||0)}</td>
                <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{fmt(item.platform_fee||0)}</td>
                <td className="px-4 py-3"><Badge label={item.status||'N/A'} color={SC[item.status]||'#888'}/></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</td>
              </>}
            </TR>
          ))}
          {filtered.length===0&&<EmptyRow cols={6} msg="No transactions found"/>}
        </TableWrap>
      )}
    </div>
  )
}

// ── PAYOUTS (item 8) ────────────────────────────────────────────────────
// Three sections in one tab: payout accounts awaiting verification (gate
// for accept_bid/request_withdrawal), the automated payout queue (so a
// failed/stuck automated payout is visible instead of silently vanishing),
// and withdrawal_requests as the manual backstop channel.
function PayoutsTab() {
  const [section,setSection]=useState('accounts')
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [rejectTarget,setRejectTarget]=useState(null)
  const [rejectReason,setRejectReason]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      let rows=[]
      if(section==='accounts'){
        const {data}=await supabase.from('payout_accounts')
          .select('id,profile_id,bank_name,bank_code,account_number,account_name,status,gateway_recipient_code,created_at')
          .in('status',['pending','verified','rejected'])
          .order('created_at',{ascending:false}).limit(100)
        rows=data||[]
      }else if(section==='queue'){
        const {data}=await supabase.from('payout_queue')
          .select('id,transaction_id,profile_id,amount_cents,status,gateway_ref,attempts,failure_reason,created_at,processed_at')
          .order('created_at',{ascending:false}).limit(100)
        rows=data||[]
      }else{
        const {data}=await supabase.from('withdrawal_requests')
          .select('id,profile_id,amount_cents,status,requested_at')
          .order('requested_at',{ascending:false}).limit(100)
        rows=data||[]
      }
      // Fetched separately rather than a `profiles:profile_id(...)` embed -
      // that syntax needs a direct FK between these tables and profiles
      // specifically, which none of the three have (profile_id references
      // auth.users, not profiles) - same reasoning as ProviderProfilePage's
      // review-author lookup.
      const ids=[...new Set(rows.map(r=>r.profile_id))]
      let byId={}
      if(ids.length){
        const {data:profs}=await supabase.from('profiles').select('id,full_name,email').in('id',ids)
        byId=Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      }
      setItems(rows.map(r=>({...r,profiles:byId[r.profile_id]||null})))
    }catch(e){console.error(e); setItems([])}
    setLoading(false)
  },[section])

  useEffect(()=>{load()},[load])

  const verifyAccount=async(id)=>{
    const {error}=await supabase.rpc('verify_payout_account',{p_id:id})
    if(error) return toast.error(error.message)
    toast.success('Payout account verified'); load()
  }
  const rejectAccount=async()=>{
    if(!rejectReason.trim()) return toast.error('A reason is required')
    const {error}=await supabase.rpc('reject_payout_account',{p_id:rejectTarget,p_reason:rejectReason.trim()})
    if(error) return toast.error(error.message)
    toast.success('Payout account rejected'); setRejectTarget(null); setRejectReason(''); load()
  }
  const retryQueueRow=async(id)=>{
    // Resets the row back to 'pending' with attempts kept as-is (the cron
    // processor's own 5-attempt ceiling still applies) so the next
    // scheduled tick picks it up again - no separate retry endpoint
    // needed since the queue itself is the source of truth.
    const {error}=await supabase.from('payout_queue').update({status:'pending',failure_reason:null}).eq('id',id)
    if(error) return toast.error(error.message)
    toast.success('Queued for retry on the next cron run'); load()
  }

  const fulfillWithdrawal=async(id)=>{
    const {error}=await supabase.rpc('fulfill_withdrawal_request',{p_request_id:id})
    if(error) return toast.error(error.message)
    toast.success('Marked as paid'); load()
  }
  const rejectWithdrawal=async(id)=>{
    const {error}=await supabase.rpc('reject_withdrawal_request',{p_request_id:id})
    if(error) return toast.error(error.message)
    toast.success('Rejected'); load()
  }

  const money=(c)=>`\u20a6${(Number(c||0)/100).toLocaleString()}`
  const SC={pending:'#D4A853',verified:'#7A9E7E',rejected:'#C85F2D',processing:'#5B8DEF',paid:'#7A9E7E',failed:'#C85F2D'}

  return(
    <div className="space-y-4">
      <FilterBar options={[{value:'accounts',label:'Payout Accounts'},{value:'queue',label:'Automated Payouts'},{value:'withdrawals',label:'Withdrawal Requests'}]} value={section} onChange={setSection}/>

      {section==='accounts'&&(
        <TableWrap cols={['Provider','Bank','Account','Status','Submitted','Actions']}>
          {items.map(a=>(
            <TR key={a.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm">{a.profiles?.full_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{a.profiles?.email}</div></td>
              <td className="px-4 py-3 text-xs text-white">{a.bank_name}{!a.bank_code&&<span className="block" style={{color:'#C85F2D'}}>No bank code (pre-automation)</span>}</td>
              <td className="px-4 py-3 text-xs text-white">{a.account_name}<div style={{color:'rgba(255,255,255,0.35)'}}>****{String(a.account_number).slice(-4)}</div></td>
              <td className="px-4 py-3"><Badge label={a.status} color={SC[a.status]}/></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(a.created_at)}</td>
              <td className="px-4 py-3">
                {a.status==='pending'&&<div className="flex gap-1">
                  <ActionBtn icon={CheckCircle} color="#7A9E7E" tip="Verify" onClick={()=>verifyAccount(a.id)}/>
                  <ActionBtn icon={XCircleIcon} color="#C85F2D" tip="Reject" onClick={()=>setRejectTarget(a.id)}/>
                </div>}
              </td>
            </TR>
          ))}
          {!loading&&items.length===0&&<EmptyRow cols={6} msg="No payout accounts"/>}
        </TableWrap>
      )}

      {section==='queue'&&(
        <TableWrap cols={['Provider','Amount','Status','Attempts','Failure reason','Actions']}>
          {items.map(q=>(
            <TR key={q.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm">{q.profiles?.full_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>tx #{q.transaction_id}</div></td>
              <td className="px-4 py-3 font-semibold text-white text-sm">{money(q.amount_cents)}</td>
              <td className="px-4 py-3"><Badge label={q.status} color={SC[q.status]}/></td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{q.attempts}/5</td>
              <td className="px-4 py-3 text-xs" style={{color:'#C85F2D',maxWidth:220}}>{q.failure_reason||'-'}</td>
              <td className="px-4 py-3">
                {q.status==='failed'&&<ActionBtn icon={RefreshCw} color="#D4A853" tip="Retry" onClick={()=>retryQueueRow(q.id)}/>}
              </td>
            </TR>
          ))}
          {!loading&&items.length===0&&<EmptyRow cols={6} msg="No payouts queued"/>}
        </TableWrap>
      )}

      {section==='withdrawals'&&(
        <TableWrap cols={['Provider','Amount','Status','Requested','Actions']}>
          {items.map(w=>(
            <TR key={w.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm">{w.profiles?.full_name||'N/A'}</div></td>
              <td className="px-4 py-3 font-semibold text-white text-sm">{money(w.amount_cents)}</td>
              <td className="px-4 py-3"><Badge label={w.status} color={SC[w.status]||'#888'}/></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(w.requested_at)}</td>
              <td className="px-4 py-3">
                {w.status==='pending'&&<div className="flex gap-1">
                  <ActionBtn icon={CheckCircle} color="#7A9E7E" tip="Mark paid" onClick={()=>fulfillWithdrawal(w.id)}/>
                  <ActionBtn icon={XCircleIcon} color="#C85F2D" tip="Reject" onClick={()=>rejectWithdrawal(w.id)}/>
                </div>}
              </td>
            </TR>
          ))}
          {!loading&&items.length===0&&<EmptyRow cols={5} msg="No withdrawal requests"/>}
        </TableWrap>
      )}

      {rejectTarget&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
          <div className="rounded-2xl p-5 w-full max-w-sm" style={{backgroundColor:'#17211B'}}>
            <p className="text-sm font-bold text-white mb-3">Reject payout account</p>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} placeholder="Reason (shown to the provider)"
              className="w-full rounded-xl px-3 py-2.5 text-xs resize-none outline-none mb-3" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            <div className="flex gap-2">
              <button onClick={()=>{setRejectTarget(null);setRejectReason('')}} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Cancel</button>
              <button onClick={rejectAccount} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{backgroundColor:'#C85F2D',color:'#fff'}}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PLATFORM FEES (item 8) ──────────────────────────────────────────────
// CRUD over the `commissions` table - get_active_commission()/
// activate_scheduled_commissions() were already built server-side
// (20260909000003_commissions.sql) but nothing in the admin UI ever wrote
// to this table. Status is a real lifecycle (DRAFT -> SCHEDULED -> ACTIVE
// -> EXPIRED/ARCHIVED) driven by effective_date/expiry_date and a
// once-a-minute pg_cron job, not a simple on/off flag, so this tab creates
// new scheduled rate changes rather than editing a live row in place -
// consistent with accept_bid() locking a rate in at deal creation and
// never re-reading a row that changed under it.
function PlatformFeesTab() {
  const [items,setItems]=useState([])
  const [categories,setCategories]=useState([])
  const [loading,setLoading]=useState(true)
  const [form,setForm]=useState(null) // null = closed, {} = new schedule

  const load=async()=>{
    setLoading(true)
    const [{data:comm},{data:cats}]=await Promise.all([
      supabase.from('commissions').select('*').order('effective_date',{ascending:false}),
      supabase.from('categories').select('id,name,slug'),
    ])
    setItems(comm||[]); setCategories(cats||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const catName=(id)=>categories.find(c=>c.id===id)?.name || 'All categories'

  const save=async()=>{
    if(!form.name?.trim()) return toast.error('Give this fee schedule a name')
    if(!form.percentage_rate&&!form.fixed_fee_cents) return toast.error('Set a percentage rate and/or a fixed fee')
    const effectiveDate = form.effective_date ? new Date(form.effective_date).toISOString() : new Date().toISOString()
    const {error} = await supabase.from('commissions').insert({
      name: form.name.trim(),
      description: form.description?.trim() || null,
      target_category_id: form.target_category_id || null,
      percentage_rate: Number(form.percentage_rate)||0,
      fixed_fee_cents: Number(form.fixed_fee_cents)||0,
      effective_date: effectiveDate,
      // SCHEDULED, not ACTIVE directly - activate_scheduled_commissions()
      // (pg_cron, every minute) promotes it and correctly expires whatever
      // was ACTIVE for the same category, honoring the one-ACTIVE-per-
      // category unique index. Writing status='ACTIVE' straight from here
      // would race that index if another row is already active.
      status: 'SCHEDULED',
    })
    if(error) return toast.error(error.message)
    toast.success(new Date(effectiveDate)<=new Date() ? 'Saved - takes effect within a minute' : 'Scheduled')
    setForm(null); load()
  }

  const expireNow=async(row)=>{
    const {error}=await supabase.from('commissions').update({status:'EXPIRED',expiry_date:new Date().toISOString()}).eq('id',row.id)
    if(error) return toast.error(error.message)
    toast.success('Expired'); load()
  }
  const archive=async(row)=>{
    const {error}=await supabase.from('commissions').update({status:'ARCHIVED'}).eq('id',row.id)
    if(error) return toast.error(error.message)
    toast.success('Archived'); load()
  }

  const STATUS_COLOR={DRAFT:'#888',SCHEDULED:'#D4A853',ACTIVE:'#7A9E7E',EXPIRED:'#C85F2D',ARCHIVED:'#555'}

  return(
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={()=>setForm({})} className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5" style={{backgroundColor:'#D4A853',color:'#17211B'}}>
          <Plus size={14}/> New Fee Schedule
        </button>
      </div>
      <TableWrap cols={['Name','Category','Rate','Fixed Fee','Effective','Status','Actions']}>
        {items.map(c=>(
          <TR key={c.id}>
            <td className="px-4 py-3 text-sm text-white">{c.name}</td>
            <td className="px-4 py-3 text-xs text-white">{catName(c.target_category_id)}</td>
            <td className="px-4 py-3 text-sm text-white">{c.percentage_rate}%</td>
            <td className="px-4 py-3 text-sm text-white">{'\u20a6'}{(Number(c.fixed_fee_cents||0)/100).toLocaleString()}</td>
            <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(c.effective_date)}</td>
            <td className="px-4 py-3"><Badge label={c.status} color={STATUS_COLOR[c.status]||'#888'}/></td>
            <td className="px-4 py-3">
              <div className="flex gap-1">
                {c.status==='ACTIVE'&&<ActionBtn icon={Pause} color="#C85F2D" tip="Expire now" onClick={()=>expireNow(c)}/>}
                {(c.status==='DRAFT'||c.status==='SCHEDULED')&&<ActionBtn icon={Trash2} color="#888" tip="Archive (never went live)" onClick={()=>archive(c)}/>}
              </div>
            </td>
          </TR>
        ))}
        {!loading&&items.length===0&&<EmptyRow cols={7} msg="No fee schedules yet - transactions use a 0% rate until one is added (accept_bid() never invents a number nobody approved)"/>}
      </TableWrap>

      {form&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
          <div className="rounded-2xl p-5 w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto" style={{backgroundColor:'#17211B'}}>
            <p className="text-sm font-bold text-white">New Fee Schedule</p>
            <div>
              <label className="text-xs block mb-1" style={{color:'rgba(255,255,255,0.5)'}}>Name</label>
              <input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Standard marketplace fee"
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{color:'rgba(255,255,255,0.5)'}}>Category (blank = all categories)</label>
              <select value={form.target_category_id||''} onChange={e=>setForm(f=>({...f,target_category_id:e.target.value||null}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}>
                <option value="">All categories</option>
                {categories.map(c=><option key={c.id} value={c.id} style={{backgroundColor:'#17211B'}}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{color:'rgba(255,255,255,0.5)'}}>Percentage rate (%)</label>
              <input type="number" step="0.01" value={form.percentage_rate??''} onChange={e=>setForm(f=>({...f,percentage_rate:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{color:'rgba(255,255,255,0.5)'}}>Fixed fee (kobo)</label>
              <input type="number" value={form.fixed_fee_cents??''} onChange={e=>setForm(f=>({...f,fixed_fee_cents:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{color:'rgba(255,255,255,0.5)'}}>Effective from</label>
              <input type="datetime-local" value={form.effective_date||''} onChange={e=>setForm(f=>({...f,effective_date:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
              <p className="text-xs mt-1" style={{color:'rgba(255,255,255,0.35)'}}>Blank = now. A background job promotes this to Active within a minute of its effective time, and automatically expires whatever was active before it for the same category.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={()=>setForm(null)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{backgroundColor:'#D4A853',color:'#17211B'}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MONETISATION: every platform fee, changed here only ─────────────────────
// Reads and writes the platform_fees registry. Every change goes through
// admin_set_platform_fee / admin_create_platform_fee, which write the history
// and notify every active user. Nothing else writes these rows.
const FEE_INPUT_STYLE={backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}
const FEE_LABEL_STYLE={color:'rgba(255,255,255,0.5)'}
const AREA_LABEL={place:'Places',people:'People',other:'Other'}
const EMPTY_NEW_FEE={key:'',label:'',description:'',area:'other',kind:'percent',value:''}

function MonetisationTab() {
  const {fees,error,reload}=usePlatformFees()
  const [history,setHistory]=useState([])
  const [editing,setEditing]=useState(null) // {key,label,kind,value,is_active,note}
  const [adding,setAdding]=useState(null)   // EMPTY_NEW_FEE shape
  const [busy,setBusy]=useState(false)

  const loadHistory=useCallback(async()=>{
    const {data}=await fetchFeeHistory()
    setHistory(data||[])
  },[])
  useEffect(()=>{loadHistory()},[loadHistory])

  const [refunds,setRefunds]=useState([])
  const [refundBusy,setRefundBusy]=useState(null)
  const loadRefunds=useCallback(async()=>{
    const {data}=await fetchPendingRefunds()
    setRefunds(data||[])
  },[])
  useEffect(()=>{loadRefunds()},[loadRefunds])

  const naira=(kobo)=>'\u20a6'+(Number(kobo)/100).toLocaleString('en-NG')
  const markRefunded=async(r)=>{
    const bank=window.prompt(`Bank reference for the ${naira(r.amount_kobo)} sent back to ${r.payer_email||'the payer'}:`)
    if(!bank||!bank.trim()) return
    setRefundBusy(r.id)
    const {error:err}=await markRefundReturned(r.id,bank.trim())
    setRefundBusy(null)
    if(err) return toast.error(err.message)
    toast.success('Recorded as returned')
    loadRefunds()
  }

  // Marketplace job commission is set in Commission Schedules (the `commissions`
  // table that accept_bid reads). The registry's job row is not used, so it is
  // hidden here to keep one place to set that fee.
  const JOB_COMMISSION_KEY='job_escrow'
  const rows=fees?Object.values(fees).filter(r=>r.key!==JOB_COMMISSION_KEY):[]
  const labelOf=(key)=>fees?.[key]?.label||key

  const saveEdit=async()=>{
    const v=Number(editing.value)
    if(!Number.isFinite(v)||v<0) return toast.error('Enter a number of zero or more')
    setBusy(true)
    const {error:err}=await setPlatformFee({key:editing.key,value:v,isActive:editing.is_active,note:editing.note})
    setBusy(false)
    if(err) return toast.error(err.message)
    toast.success('Saved. Every user has been notified of a change.')
    setEditing(null); reload(); loadHistory()
  }

  const saveNew=async()=>{
    const f=adding
    if(!f.key.trim()||!f.label.trim()) return toast.error('A key and a label are required')
    setBusy(true)
    const {error:err}=await createPlatformFee({key:f.key,label:f.label,area:f.area,kind:f.kind,value:f.value,description:f.description})
    setBusy(false)
    if(err) return toast.error(err.message)
    toast.success('Channel added. Every user has been notified.')
    setAdding(null); reload(); loadHistory()
  }

  return(
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-xs max-w-xl" style={{color:'rgba(255,255,255,0.45)'}}>
          Every fee the site charges is listed here. The site reads these values from the database, so a change here applies everywhere and is announced to all users. Adding a channel registers it; code must still charge it before any money is taken.
        </p>
        <button onClick={()=>setAdding({...EMPTY_NEW_FEE})} className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5" style={{backgroundColor:'#D4A853',color:'#17211B'}}>
          <Plus size={14}/> Add Channel
        </button>
      </div>

      {error&&<p className="text-xs" style={{color:'#C85F2D'}}>Could not load fees: {error.message}</p>}

      <p className="text-xs" style={{color:'rgba(255,255,255,0.45)'}}>
        Marketplace job commission is not listed here. Set it in{' '}
        <a href="/admin/fees" className="underline" style={{color:'#D4A853'}}>Commission Schedules</a>.
      </p>

      <TableWrap cols={['Channel','Area','Rate or fee','Status','Last changed','Actions']}>
        {rows.map(r=>(
          <TR key={r.key}>
            <td className="px-4 py-3">
              <p className="text-sm text-white">{r.label}</p>
              <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{r.key}</p>
            </td>
            <td className="px-4 py-3 text-xs text-white">{AREA_LABEL[r.area]||r.area}</td>
            <td className="px-4 py-3 text-sm text-white">{formatPlatformFee(r)}</td>
            <td className="px-4 py-3"><Badge label={r.is_active?'ON':'OFF'} color={r.is_active?'#7A9E7E':'#888'}/></td>
            <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(r.updated_at)}</td>
            <td className="px-4 py-3">
              <button onClick={()=>setEditing({key:r.key,label:r.label,kind:r.kind,value:String(r.value),is_active:r.is_active,note:''})}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(212,168,83,0.15)',color:'#D4A853'}}>
                Edit
              </button>
            </td>
          </TR>
        ))}
        {!fees&&!error&&<EmptyRow cols={6} msg="Loading fees..."/>}
      </TableWrap>

      <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
        <p className="text-xs font-bold mb-3 text-white">Recent changes</p>
        {history.length===0&&<p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>No changes yet.</p>}
        <div className="space-y-2">
          {history.map((h,i)=>(
            <div key={`${h.fee_key}-${h.changed_at}-${i}`} className="text-xs" style={{color:'rgba(255,255,255,0.6)'}}>
              <span className="text-white">{labelOf(h.fee_key)}</span>
              {' '}{h.old_value!=null&&h.new_value!=null&&h.old_value!==h.new_value
                ? <>changed from {h.old_value} to {h.new_value}</>
                : h.new_active!==h.old_active&&h.old_active!=null
                  ? <>switched {h.new_active?'on':'off'}</>
                  : <>set to {h.new_value}</>}
              {h.note?` (${h.note})`:''}
              <span style={{color:'rgba(255,255,255,0.3)'}}> · {ago(h.changed_at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(200,95,45,0.06)',border:'1px solid rgba(200,95,45,0.25)'}}>
        <p className="text-xs font-bold mb-1 text-white">Money to return ({refunds.length})</p>
        <p className="text-[11px] mb-3" style={{color:'rgba(255,255,255,0.4)'}}>Overpayments and short payments. Send the money back from your bank, then record the bank reference here.</p>
        {refunds.length===0&&<p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Nothing to return.</p>}
        <div className="space-y-2">
          {refunds.map(r=>(
            <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap text-xs" style={{color:'rgba(255,255,255,0.7)'}}>
              <span>
                <span className="text-white">{r.reason==='overpaid'?'Overpaid':'Short payment'}</span>
                {' '}· {r.payer_email||'no email'} · {r.reference}
                {' '}· <span className="text-white">{naira(r.amount_kobo)}</span>
              </span>
              <button onClick={()=>markRefunded(r)} disabled={refundBusy===r.id}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E'}}>
                {refundBusy===r.id?'Saving...':'Mark returned'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {editing&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
          <div className="rounded-2xl p-5 w-full max-w-sm space-y-3" style={{backgroundColor:'#17211B'}}>
            <p className="text-sm font-bold text-white">Edit {editing.label}</p>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>{editing.kind==='percent'?'Rate (%)':'Amount (naira)'}</label>
              <input type="number" step="0.01" min="0" value={editing.value} onChange={e=>setEditing(f=>({...f,value:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <label className="flex items-center gap-2 text-xs text-white">
              <input type="checkbox" checked={!!editing.is_active} onChange={e=>setEditing(f=>({...f,is_active:e.target.checked}))}/>
              Charge this fee
            </label>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Note for the history (optional)</label>
              <input value={editing.note} onChange={e=>setEditing(f=>({...f,note:e.target.value}))} placeholder="Why this changed"
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Saving notifies every active user. It applies to new payments only; deals already in progress keep their rate.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={()=>setEditing(null)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{busy?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {adding&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
          <div className="rounded-2xl p-5 w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto" style={{backgroundColor:'#17211B'}}>
            <p className="text-sm font-bold text-white">Add a monetisation channel</p>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Name shown to users</label>
              <input value={adding.label} onChange={e=>setAdding(f=>({...f,label:e.target.value}))} placeholder="e.g. Featured listing"
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Key (lowercase, no spaces, cannot change later)</label>
              <input value={adding.key} onChange={e=>setAdding(f=>({...f,key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')}))} placeholder="e.g. featured_listing"
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Area</label>
                <select value={adding.area} onChange={e=>setAdding(f=>({...f,area:e.target.value}))}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}>
                  <option value="place" style={{backgroundColor:'#17211B'}}>Places</option>
                  <option value="people" style={{backgroundColor:'#17211B'}}>People</option>
                  <option value="other" style={{backgroundColor:'#17211B'}}>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Type</label>
                <select value={adding.kind} onChange={e=>setAdding(f=>({...f,kind:e.target.value}))}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}>
                  <option value="percent" style={{backgroundColor:'#17211B'}}>Percent</option>
                  <option value="flat_ngn" style={{backgroundColor:'#17211B'}}>Flat (naira)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>{adding.kind==='percent'?'Rate (%)':'Amount (naira)'}</label>
              <input type="number" step="0.01" min="0" value={adding.value} onChange={e=>setAdding(f=>({...f,value:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <div>
              <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Description (shown to users)</label>
              <textarea rows={2} value={adding.description} onChange={e=>setAdding(f=>({...f,description:e.target.value}))}
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE}/>
            </div>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Adding a channel notifies every active user. It does not charge anything by itself: the code that takes this payment must read this fee before it goes live.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={()=>setAdding(null)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Cancel</button>
              <button onClick={saveNew} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{busy?'Adding...':'Add channel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PROFESSIONALS ──────────────────────────────────────────────────────────────
function ProfessionalsTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [confirm,setConfirm]=useState(null)
  const SC={approved:'#7A9E7E',pending:'#D4A853',inactive:'#888',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('professional_applications').select('id,full_name,email,phone,professional_type,company_name,plan_type,rating,review_count,status,created_at,coverage_areas').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data,error}=await q
    if(error) toast.error('Failed to load')
    setItems(data||[]); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,name)=>{
    const {error}=await supabase.from('professional_applications').update({status:s==='active'?'approved':s,activated_at:s==='active'?new Date().toISOString():null}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('professional_status',{id,status:s,by:admin?.id})
    toast.success(`${name}: ${s}`); load(); setConfirm(null)
  }

  const filtered=items.filter(i=>!search||i.full_name?.toLowerCase().includes(search.toLowerCase())||i.type?.toLowerCase().includes(search.toLowerCase())||i.company?.toLowerCase().includes(search.toLowerCase()))

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name, type, company…"/>
        <FilterBar value={filter} onChange={setFilter} options={[['all','All'],['pending','Pending Payment'],['approved','Approved'],['rejected','Rejected']]}/>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} professional{filtered.length!==1?'s':''}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Name / Company','Type','Fee/mo','Rating','Status','Date','Actions']}>
          {filtered.map(p=>(
            <TR key={p.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm">{p.full_name}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{p.company_name||maskEmail(p.email)}</div></td>
              <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.6)'}}>{(p.professional_type||'N/A').replace(/_/g,' ')}</td>
              <td className="px-4 py-3 text-xs text-white">{p.plan_type||'monthly'}</td>
              <td className="px-4 py-3 text-xs" style={{color:'#D4A853'}}>{p.rating?`${p.rating}`:'N/A'}</td>
              <td className="px-4 py-3"><Badge label={(p.status||'N/A').replace('_',' ')} color={SC[p.status]||'#888'}/></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(p.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {p.status!=='approved'&&<ActionBtn icon={Check} color="#7A9E7E" tip="Activate" onClick={()=>setConfirm({title:'Activate professional?',body:`${p.full_name} will appear in the directory.`,onConfirm:()=>setStatus(p.id,'active',p.full_name)})}/>}
                  {p.status==='approved'&&<ActionBtn icon={Pause} color="#D4A853" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate?',body:`${p.full_name} will be hidden.`,danger:true,onConfirm:()=>setStatus(p.id,'paused',p.full_name)})}/>}
                  {p.status!=='rejected'&&<ActionBtn icon={X} color="#C85F2D" tip="Reject" onClick={()=>setConfirm({title:'Reject?',body:`Reject ${p.full_name}'s application?`,danger:true,onConfirm:()=>setStatus(p.id,'rejected',p.full_name)})}/>}
                </div>
              </td>
            </TR>
          ))}
          {filtered.length===0&&<EmptyRow cols={7} msg="No professionals found"/>}
        </TableWrap>
      )}
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── MORTGAGE ───────────────────────────────────────────────────────────────────
function MortgageTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [confirm,setConfirm]=useState(null)
  const SC={pending:'#D4A853',under_review:'#5B8DEF',approved:'#7A9E7E',rejected:'#C85F2D',disbursed:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('mortgage_applications').select('*,profiles(full_name,email,phone)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data,error}=await q
    if(error){ console.error('[Mortgage load]', error.message); toast.error('Could not load mortgage applications. Please retry, or contact support if this keeps happening.') }
    setItems(data||[]); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,name)=>{
    const {error}=await supabase.from('mortgage_applications').update({status:s,updated_at:new Date().toISOString()}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('mortgage_status',{id,status:s,by:admin?.id})
    toast.success(`${name}: ${s.replace('_',' ')}`); load(); setConfirm(null)
  }

  return(
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} options={[['all','All'],['pending','Pending'],['under_review','Under Review'],['approved','Approved'],['rejected','Rejected'],['disbursed','Disbursed']]}/>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{items.length} application{items.length!==1?'s':''}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Applicant','Loan Amount','Property','Income/mo','Status','Date','Actions']}>
          {items.map(m=>(
            <TR key={m.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm">{m.profiles?.full_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(m.profiles?.email)}</div></td>
              <td className="px-4 py-3 font-semibold text-white">{fmt(m.loan_amount||m.amount||0)}</td>
              <td className="px-4 py-3 text-xs truncate max-w-[130px]" style={{color:'rgba(255,255,255,0.6)'}}>{m.property_address||m.property_type||'N/A'}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{fmt(m.monthly_income||0)}</td>
              <td className="px-4 py-3"><Badge label={(m.status||'pending').replace('_',' ')} color={SC[m.status]||'#888'}/></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(m.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {m.status==='pending'&&<ActionBtn icon={Eye} color="#5B8DEF" tip="Under review" onClick={()=>setStatus(m.id,'under_review',m.profiles?.full_name||'Applicant')}/>}
                  {['pending','under_review'].includes(m.status)&&<>
                    <ActionBtn icon={Check} color="#7A9E7E" tip="Approve" onClick={()=>setConfirm({title:'Approve mortgage?',body:`Approve ${m.profiles?.full_name}'s application?`,onConfirm:()=>setStatus(m.id,'approved',m.profiles?.full_name||'Applicant')})}/>
                    <ActionBtn icon={X} color="#C85F2D" tip="Reject" onClick={()=>setConfirm({title:'Reject?',body:`Reject ${m.profiles?.full_name}'s application?`,danger:true,onConfirm:()=>setStatus(m.id,'rejected',m.profiles?.full_name||'Applicant')})}/>
                  </>}
                  {m.status==='approved'&&<ActionBtn icon={CheckCircle} color="#7A9E7E" tip="Mark disbursed" onClick={()=>setStatus(m.id,'disbursed',m.profiles?.full_name||'Applicant')}/>}
                </div>
              </td>
            </TR>
          ))}
          {items.length===0&&<EmptyRow cols={7} msg="No mortgage applications"/>}
        </TableWrap>
      )}
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── ENQUIRIES ──────────────────────────────────────────────────────────────────
function EnquiriesTab() {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')

  const load=async()=>{
    setLoading(true)
    const {data}=await supabase.from('rental_enquiries').select('*,properties(title,state,city,listing_type)').order('created_at',{ascending:false}).limit(200)
    setItems(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])

  const filtered=items.filter(i=>!search||i.tenant_name?.toLowerCase().includes(search.toLowerCase())||i.properties?.title?.toLowerCase().includes(search.toLowerCase()))

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Rental Enquiries</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Tenant interest submissions sent to landlords</p></div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}><RefreshCw size={12}/> Refresh</button>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search tenant or property…"/>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} enquir{filtered.length!==1?'ies':'y'}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Tenant','Property','Type','Move-in','Duration','Message','Date']}>
          {filtered.map(e=>(
            <TR key={e.id}>
              <td className="px-4 py-3"><div className="text-white text-sm font-semibold">{e.tenant_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskPhone(e.tenant_phone)}</div></td>
              <td className="px-4 py-3"><div className="text-white text-xs truncate max-w-[150px]">{e.properties?.title||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{e.properties?.city}, {e.properties?.state}</div></td>
              <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.5)'}}>{(e.properties?.listing_type||'rental').replace(/_/g,' ')}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.6)'}}>{e.move_in_date||'N/A'}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{e.duration||'N/A'}</td>
              <td className="px-4 py-3 text-xs max-w-[160px] truncate" style={{color:'rgba(255,255,255,0.5)'}}>{e.message||'N/A'}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(e.created_at)}</td>
            </TR>
          ))}
          {filtered.length===0&&<EmptyRow cols={7} msg="No enquiries yet"/>}
        </TableWrap>
      )}
    </div>
  )
}

// ── STUDENT HOSTELS ────────────────────────────────────────────────────────────
function StudentHostelsAdminTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [confirm,setConfirm]=useState(null)
  const SM={pending_review:{label:'Pending',color:'#D4A853'},active:{label:'Live',color:'#7A9E7E'},paused:{label:'Paused',color:'#888'},rejected:{label:'Rejected',color:'#C85F2D'},filled:{label:'Filled',color:'#5B8DEF'}}
  const ROOM={single:'Single',shared_2:'Shared×2',shared_4:'Shared×4',shared_6:'Shared×6',self_contain:'Self Contain',mini_flat:'Mini Flat','2_bedroom':'2 Bed'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('student_hostels').select('id,title,city,state,institution_name,room_type,price_per_year,rooms_available,status,listing_paid,verified,created_at,profiles(full_name,email)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data,error}=await q
    if(error) toast.error('Failed')
    setItems(data||[]); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,title)=>{
    const updates={status:s,updated_at:new Date().toISOString()}
    if(s==='active'){updates.verified=true;updates.verified_by=admin?.id;updates.verified_at=new Date().toISOString()}
    const {error}=await supabase.from('student_hostels').update(updates).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('hostel_status',{id,status:s,by:admin?.id})
    toast.success(`"${title}" → ${SM[s]?.label||s}`); load(); setConfirm(null)
  }

  return(
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} options={[['all','All'],['pending_review','Pending'],['active','Live'],['paused','Paused'],['rejected','Rejected'],['filled','Filled']]}/>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{items.length} hostel{items.length!==1?'s':''}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Hostel','Owner','Institution','Type','Price/yr','Paid','Status','Actions']}>
          {items.map(h=>{
            const meta=SM[h.status]||{label:h.status,color:'#888'}
            return(<TR key={h.id}>
              <td className="px-4 py-3"><div className="font-semibold text-white text-sm truncate max-w-[150px]">{h.title}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{h.city}, {h.state}</div></td>
              <td className="px-4 py-3"><div className="text-white text-xs">{h.profiles?.full_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(h.profiles?.email)}</div></td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.6)'}}>{h.institution_name||'N/A'}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{ROOM[h.room_type]||h.room_type||'N/A'}</td>
              <td className="px-4 py-3 text-white text-sm font-semibold">{fmt(h.price_per_year||0)}</td>
              <td className="px-4 py-3">{h.listing_paid?<Badge label="Paid" color="#7A9E7E"/>:<Badge label="Unpaid" color="#C85F2D"/>}</td>
              <td className="px-4 py-3"><Badge label={meta.label} color={meta.color}/></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {h.status!=='active'&&h.listing_paid&&<ActionBtn icon={Check} color="#7A9E7E" tip="Approve" onClick={()=>setConfirm({title:'Approve hostel?',body:`"${h.title}" will go live for students.`,onConfirm:()=>setStatus(h.id,'active',h.title)})}/>}
                  {h.status==='active'&&<ActionBtn icon={Pause} color="#D4A853" tip="Pause" onClick={()=>setConfirm({title:'Pause hostel?',body:`"${h.title}" will be hidden.`,onConfirm:()=>setStatus(h.id,'paused',h.title)})}/>}
                  {h.status==='paused'&&<ActionBtn icon={Play} color="#5B8DEF" tip="Restore" onClick={()=>setStatus(h.id,'active',h.title)}/>}
                  {h.status!=='rejected'&&<ActionBtn icon={X} color="#C85F2D" tip="Reject" onClick={()=>setConfirm({title:'Reject hostel?',body:`"${h.title}" will be rejected.`,danger:true,onConfirm:()=>setStatus(h.id,'rejected',h.title)})}/>}
                </div>
              </td>
            </TR>)
          })}
          {items.length===0&&<EmptyRow cols={8} msg="No hostels found"/>}
        </TableWrap>
      )}
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── STUDENT VERIFICATIONS ──────────────────────────────────────────────────────
function StudentVerificationsTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('pending')
  const [confirm,setConfirm]=useState(null)
  const [reject,setReject]=useState(null)
  const [reason,setReason]=useState('')
  const [lightbox,setLightbox]=useState(null)
  const SC={pending:'#D4A853',approved:'#7A9E7E',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('student_verifications').select('*,profiles(full_name,email)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data}=await q
    // ✅ Student ID images now live in the private 'identity-docs' bucket
    // (previously the fully public 'property-images' - security fix).
    // Older rows still hold a full public URL from the old code and can
    // be used as-is; only new rows (bare storage paths) need signing.
    const withSigned = await Promise.all((data||[]).map(async v=>{
      if(!v.id_image_url) return v
      if(v.id_image_url.startsWith('http')) return {...v, id_image_signed: v.id_image_url} // legacy public URL
      const {data:sd} = await supabase.storage.from('identity-docs').createSignedUrl(v.id_image_url,1800)
      return {...v, id_image_signed: sd?.signedUrl || null}
    }))
    setItems(withSigned); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const approve=async(id,userId,name)=>{
    const {error}=await supabase.from('student_verifications').update({status:'approved',reviewed_by:admin?.id,reviewed_at:new Date().toISOString()}).eq('id',id)
    if(error){toast.error('Failed');return}
    await supabase.from('profiles').update({is_student_verified:true}).eq('id',userId)
    await auditLog('student_verified',{id,user_id:userId,by:admin?.id})
    toast.success(`${name} - student verified`); setConfirm(null); load()
  }

  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter rejection reason');return}
    const {error}=await supabase.from('student_verifications').update({status:'rejected',reviewed_by:admin?.id,reviewed_at:new Date().toISOString(),rejection_reason:reason.trim()}).eq('id',reject.id)
    if(error){toast.error('Failed');return}
    await supabase.from('profiles').update({is_student_verified:false}).eq('id',reject.userId)
    await auditLog('student_rejected',{id:reject.id,reason,by:admin?.id})
    toast.success(`${reject.name} - rejected`); setReject(null); setReason(''); load()
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Student ID Verifications</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Review student identity submissions for hostel access</p></div>
        <FilterBar value={filter} onChange={setFilter} options={[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All']]}/>
      </div>
      {loading?<Spinner/>:(
        <div className="space-y-3">
          {items.map(v=>{
            const name=v.profiles?.full_name||'N/A'
            return(
              <div key={v.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-semibold text-sm">{name}</span>
                      <Badge label={v.status||'pending'} color={SC[v.status]||'#888'}/>
                    </div>
                    <div className="text-xs mb-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(v.profiles?.email)} · {v.institution_name||'N/A'}</div>
                    <div className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>
                      {v.matric_number?<>Matric: <span className="text-white font-mono">{v.matric_number}</span></>:v.jamb_reg_number?<>JAMB: <span className="text-white font-mono">{v.jamb_reg_number}</span> <Badge label="Fresher" color="#5B8DEF"/></>:v.application_number?<>App: <span className="text-white font-mono">{v.application_number}</span></>:'N/A'}
                    </div>
                    <div className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.3)'}}>{ago(v.created_at)}</div>
                    {v.rejection_reason&&<div className="mt-2 text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(200,95,45,0.08)',color:'#C85F2D'}}>Reason: {v.rejection_reason}</div>}
                  </div>
                  {v.id_image_signed&&<button onClick={()=>setLightbox({src:v.id_image_signed,label:`${name} - Student ID`})} className="flex-shrink-0 relative overflow-hidden rounded-xl border" style={{width:80,height:56,borderColor:'rgba(255,255,255,0.1)'}}>
                    <img src={v.id_image_signed} alt="Student ID" className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 flex items-center justify-center" style={{backgroundColor:'rgba(0,0,0,0.35)'}}><ExternalLink size={14} style={{color:'#fff'}}/></div>
                  </button>}
                </div>
                {v.status==='pending'&&(
                  <div className="flex gap-2 mt-3">
                    <button onClick={()=>setConfirm({title:'Approve student?',body:`${name} will be verified and can view hostel contacts.`,onConfirm:()=>approve(v.id,v.user_id,name)})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.3)'}}><Check size={12}/> Approve</button>
                    <button onClick={()=>setReject({id:v.id,userId:v.user_id,name})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D',border:'1px solid rgba(200,95,45,0.2)'}}><X size={12}/> Reject</button>
                  </div>
                )}
              </div>
            )
          })}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No {filter==='all'?'':filter} verifications</div>}
        </div>
      )}
      <AnimatePresence>
        {reject&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-sm rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <X size={22} style={{color:'#C85F2D'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Reject Verification</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Tell <strong className="text-white">{reject.name}</strong> why their ID was rejected.</p>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. ID photo is blurry, please upload a clearer image" className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
              <div className="flex gap-3">
                <button onClick={()=>{setReject(null);setReason('')}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C85F2D',color:'#17211B'}}>Send Rejection</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
      <AnimatePresence>
        {lightbox&&<ImageLightbox src={lightbox.src} label={lightbox.label} onClose={()=>setLightbox(null)}/>}
      </AnimatePresence>
    </div>
  )
}

// ── ANNOUNCEMENTS ──────────────────────────────────────────────────────────────
function AnnouncementsTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [showForm,setShowForm]=useState(false)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({title:'',body:'',type:'info',target:'all'})
  const TC={info:'#5B8DEF',warning:'#D4A853',success:'#7A9E7E',critical:'#C85F2D'}

  const load=async()=>{
    setLoading(true)
    const {data}=await supabase.from('admin_announcements').select('*').order('created_at',{ascending:false}).limit(50)
    setItems(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])

  const publish=async()=>{
    if(!form.title.trim()||!form.body.trim()){toast.error('Fill in title and message');return}
    setSaving(true)
    const {error}=await supabase.from('admin_announcements').insert({title:form.title.trim(),body:form.body.trim(),type:form.type,target:form.target,created_by:admin?.id,created_at:new Date().toISOString()})
    if(error){
      if(error.code==='42P01') toast.error('Run sections 11–13 of run-once-live-db.sql in Supabase first')
      else toast.error('Failed: '+error.message)
      setSaving(false); return
    }
    await auditLog('announcement_published',{title:form.title,by:admin?.id})
    toast.success('Announcement published')
    setForm({title:'',body:'',type:'info',target:'all'}); setShowForm(false); load(); setSaving(false)
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-white font-bold">Announcements</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Platform-wide notices shown to users</p></div>
        <button onClick={()=>setShowForm(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}><Plus size={14}/> New</button>
      </div>
      {showForm&&(
        <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} className="rounded-2xl p-5 space-y-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Title</label>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Scheduled maintenance Saturday" className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Message</label>
            <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={3} placeholder="Write your announcement here…" className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                <option value="info" style={{backgroundColor:'#17211B'}}>ℹ️ Info</option>
                <option value="warning" style={{backgroundColor:'#17211B'}}>Warning</option>
                <option value="success" style={{backgroundColor:'#17211B'}}>Success</option>
                <option value="critical" style={{backgroundColor:'#17211B'}}>Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Target</label>
              <select value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                {[['all','All Users'],['buyer','Buyers'],['seller','Sellers'],['landlord','Landlords'],['professional','Professionals'],['student','Students']].map(([k,l])=>(
                  <option key={k} value={k} style={{backgroundColor:'#17211B'}}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={()=>setShowForm(false)} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
            <button onClick={publish} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{saving?'Publishing…':'Publish Now'}</button>
          </div>
        </motion.div>
      )}
      {loading?<Spinner/>:(
        <div className="space-y-2">
          {items.map(a=>(
            <div key={a.id} className="rounded-2xl px-5 py-4 flex items-start gap-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:`${TC[a.type]||'#888'}15`}}>
                <Bell size={14} style={{color:TC[a.type]||'#888'}}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-white font-semibold text-sm">{a.title}</span>
                  <Badge label={a.type||'info'} color={TC[a.type]||'#888'}/>
                  <Badge label={a.target||'all'} color="#888"/>
                </div>
                <p className="text-xs mb-1" style={{color:'rgba(255,255,255,0.5)'}}>{a.body}</p>
                <p className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>{ago(a.created_at)}</p>
              </div>
            </div>
          ))}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No announcements yet. Create one above.</div>}
        </div>
      )}
    </div>
  )
}

// ── TESTIMONIALS ──────────────────────────────────────────────────────────────
function TestimonialsTab() {
  const [items,setItems]=useState([])
  const [statusFilter,setStatusFilter]=useState('pending')
  const [loading,setLoading]=useState(true)
  const [actingOn,setActingOn]=useState(null)

  const load=async()=>{
    setLoading(true)
    try {
      const { testimonials } = await adminFetch(`testimonials?status=${statusFilter}`)
      setItems(testimonials||[])
    } catch(err) {
      toast.error('Failed to load: '+err.message)
    }
    setLoading(false)
  }
  useEffect(()=>{load()},[statusFilter])

  const act=async(id,action)=>{
    setActingOn(id)
    try {
      await adminFetch('testimonials',{method:'POST',body:JSON.stringify({id,action})})
      toast.success(action==='approve'?'Testimonial approved - now live':'Testimonial rejected')
      setItems(prev=>prev.filter(t=>t.id!==id))
    } catch(err) {
      toast.error('Failed: '+err.message)
    }
    setActingOn(null)
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Testimonials</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Review user-submitted stories before they go live on the homepage</p></div>
        <div className="flex gap-2">
          {['pending','approved','rejected'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold capitalize"
              style={{backgroundColor:statusFilter===s?'#D4A853':'rgba(255,255,255,0.06)',color:statusFilter===s?'#17211B':'rgba(255,255,255,0.5)'}}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {loading?<Spinner/>:(
        <div className="space-y-3">
          {items.map(t=>(
            <div key={t.id} className="rounded-2xl p-5" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white font-semibold text-sm">{t.name}</span>
                {t.role_label && <span className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>· {t.role_label}</span>}
                <span className="flex items-center gap-0.5 ml-auto">
                  {[1,2,3,4,5].map(n=>(
                    <Star key={n} size={12} fill={n<=t.rating?'#D4A853':'transparent'} style={{color:'#D4A853'}}/>
                  ))}
                </span>
              </div>
              <p className="text-sm mb-3" style={{color:'rgba(255,255,255,0.7)'}}>"{t.content}"</p>
              <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.25)'}}>{ago(t.created_at)}</p>
              {statusFilter==='pending' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>act(t.id,'reject')} disabled={actingOn===t.id}
                    className="py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>
                    <ThumbsDown size={12} className="inline mr-1"/> Reject
                  </button>
                  <button onClick={()=>act(t.id,'approve')} disabled={actingOn===t.id}
                    className="py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{backgroundColor:'rgba(122,158,126,0.12)',color:'#7A9E7E'}}>
                    <ThumbsUp size={12} className="inline mr-1"/> Approve
                  </button>
                </div>
              )}
            </div>
          ))}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No {statusFilter} testimonials.</div>}
        </div>
      )}
    </div>
  )
}

// ── STAFF ──────────────────────────────────────────────────────────────────────
function StaffTab({isSuperAdmin}) {
  const {user:admin}=useAuth()
  const [staff,setStaff]=useState([])
  const [invites,setInvites]=useState([])
  const [loading,setLoading]=useState(true)
  const [showCreate,setShowCreate]=useState(false)
  const [confirm,setConfirm]=useState(null)
  const [form,setForm]=useState({email:'',fullName:'',role:'agent'})
  const [creating,setCreating]=useState(false)

  const loadStaff=async()=>{
    setLoading(true)
    const [{data:staffData},{data:inviteData}]=await Promise.all([
      supabase.from('profiles').select('id,full_name,email,role,created_at').in('role',['agent','verifier','admin']).order('created_at',{ascending:false}),
      isSuperAdmin?supabase.from('staff_invites').select('id,email,full_name,role,status,created_at,expires_at').eq('status','pending').order('created_at',{ascending:false}):Promise.resolve({data:[]}),
    ])
    setStaff(staffData||[]); setInvites(inviteData||[]); setLoading(false)
  }
  useEffect(()=>{loadStaff()},[])

  // Invite-based creation only: the superadmin never sets or sees a
  // password. Supabase emails the invite link, the invitee sets their own
  // password, and accept_staff_invite() grants exactly the role recorded
  // here - never whatever the invitee's own signup request might contain.
  const sendInvite=async()=>{
    if(!form.email||!form.fullName){toast.error('Fill in all fields');return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){toast.error('Invalid email');return}
    setCreating(true)
    try{
      await adminFetch('staff-invite',{method:'POST',body:JSON.stringify({email:form.email.trim().toLowerCase(),fullName:form.fullName.trim(),role:form.role})})
      toast.success(`Invite sent to ${form.fullName}`)
      setForm({email:'',fullName:'',role:'agent'}); setShowCreate(false); loadStaff()
    }catch(err){toast.error(err.message||'Could not send invite')}
    setCreating(false)
  }

  const revokeInvite=async(invite)=>{
    const {error}=await supabase.rpc('revoke_staff_invite',{p_invite_id:invite.id})
    if(error){toast.error(error.message||'Could not revoke invite');return}
    toast.success(`Invite to ${invite.email} revoked`); loadStaff()
  }

  const deactivate=async(id,name)=>{
    // FIX: was overwriting role to 'suspended', destroying the staff
    // member's real role (agent/verifier/admin) with no way back short of
    // a superadmin manually re-assigning it. account_status is the
    // correct place for this - role stays intact.
    const {error}=await supabase.from('profiles').update({account_status:'suspended'}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('staff_deactivated',{target_id:id,by:admin?.id})
    toast.success(`${name} deactivated`); loadStaff(); setConfirm(null)
  }

  const changeRole=async(id,newRole,name)=>{
    if(newRole==='admin'&&!isSuperAdmin){toast.error('Only the superadmin can grant the admin role');return}
    const {error}=await supabase.from('profiles').update({role:newRole}).eq('id',id)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('staff_role_changed',{target_id:id,new_role:newRole,by:admin?.id})
    toast.success(`${name} -> ${ROLE_LABELS[newRole]}`); loadStaff()
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold">Staff Accounts</h3>
          <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{isSuperAdmin?'Invite and manage all staff accounts':'Staff list - contact superadmin to add or remove'}</p>
        </div>
        {isSuperAdmin&&<button onClick={()=>setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}><Plus size={14}/> Invite Staff</button>}
      </div>
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          <strong className="text-white">Agent</strong> - on-site property verification. <strong className="text-white">Verifier</strong> - reviews and approves identity documents. <strong className="text-white">Admin</strong> - full dashboard access, grantable by the superadmin only. Deactivation revokes access immediately. Staff sign in with their own password and must complete two-factor setup before reaching this dashboard.
        </p>
      </div>
      {isSuperAdmin&&invites.length>0&&(
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'rgba(255,255,255,0.35)'}}>Pending invites</p>
          {invites.map(inv=>(
            <div key={inv.id} className="rounded-2xl px-5 py-3.5 flex items-center justify-between flex-wrap gap-3" style={{backgroundColor:'rgba(212,168,83,0.05)',border:'1px dashed rgba(212,168,83,0.25)'}}>
              <div>
                <div className="text-white font-semibold text-sm">{inv.full_name}</div>
                <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(inv.email)} - invited {ago(inv.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge label={ROLE_LABELS[inv.role]||inv.role} color={ROLE_COLORS[inv.role]||'#888'}/>
                <ActionBtn icon={UserX} color="#C85F2D" tip="Revoke invite" onClick={()=>revokeInvite(inv)}/>
              </div>
            </div>
          ))}
        </div>
      )}
      {loading?<Spinner/>:(
        <div className="space-y-2">
          {staff.map(s=>(
            <div key={s.id} className="rounded-2xl px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{backgroundColor:`${ROLE_COLORS[s.role]||'#888'}18`,color:ROLE_COLORS[s.role]||'#888'}}>
                  {(s.full_name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{s.full_name||'N/A'}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(s.email)} · {ago(s.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge label={ROLE_LABELS[s.role]||s.role} color={ROLE_COLORS[s.role]||'#888'}/>
                {isSuperAdmin&&!SUPERADMIN_EMAILS.includes(s.email)&&<>
                  <select value={s.role} onChange={e=>changeRole(s.id,e.target.value,s.full_name)} className="text-xs rounded-xl px-2 py-1.5 outline-none" style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                    {['agent','verifier','admin'].map(r=><option key={r} value={r} style={{backgroundColor:'#17211B'}}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <ActionBtn icon={UserX} color="#C85F2D" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate staff?',body:`${s.full_name}'s access will be revoked immediately.`,danger:true,onConfirm:()=>deactivate(s.id,s.full_name)})}/>
                </>}
                {SUPERADMIN_EMAILS.includes(s.email)&&<span className="text-xs px-2 py-1 rounded-lg" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}> Owner</span>}
              </div>
            </div>
          ))}
          {staff.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No staff accounts yet</div>}
        </div>
      )}
      <AnimatePresence>
        {showCreate&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-md rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:'rgba(212,168,83,0.12)'}}><UserCheck size={18} style={{color:'#D4A853'}}/></div>
                <div><h3 className="text-white font-bold">Invite Staff Member</h3><p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Superadmin only - they set their own password</p></div>
              </div>
              <div className="space-y-3">
                {[{label:'Full Name',key:'fullName',type:'text',placeholder:'e.g. Amaka Okonkwo'},{label:'Email Address',key:'email',type:'email',placeholder:'staff@dealmatch.com.ng'}].map(f=>(
                  <div key={f.key}>
                    <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>{f.label}</label>
                    <input value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.placeholder} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
                  </div>
                ))}
                <div>
                  <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Role</label>
                  <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                    <option value="agent" style={{backgroundColor:'#17211B'}}>Agent - verifies listings on-site</option>
                    <option value="verifier" style={{backgroundColor:'#17211B'}}>Verifier - approves identity documents</option>
                    <option value="admin" style={{backgroundColor:'#17211B'}}>Admin - full dashboard access</option>
                  </select>
                </div>
                <div className="rounded-xl p-3 flex items-start gap-2" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                  <Mail size={14} style={{color:'rgba(255,255,255,0.4)',flexShrink:0,marginTop:2}}/>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>An invite link is emailed to this address. They choose their own password and must set up two-factor authentication before their first admin session.</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>{setShowCreate(false);setForm({email:'',fullName:'',role:'agent'})}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={sendInvite} disabled={creating} className="flex-1 py-3 rounded-2xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{creating?'Sending...':'Send Invite'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ── SETTINGS (superadmin-editable platform settings) ────────────────────────────
function SettingsTab({isSuperAdmin}) {
  const [section,setSection]=useState('general')
  return(
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-bold flex items-center gap-2"><Settings size={16}/> Platform Settings</h3>
        <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>
          {isSuperAdmin?'Edit live values shown across the site - changes apply immediately, no code deploy needed.':'View only - contact superadmin to change these settings'}
        </p>
      </div>

      {!isSuperAdmin&&(
        <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
          <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
          <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>You can view current settings, but only the superadmin account can save changes.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
        {[
          {id:'general', label:'General'},
          {id:'bank',    label:'Bank Details'},
        ].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={{backgroundColor:section===s.id?'#D4A853':'rgba(255,255,255,0.06)',color:section===s.id?'#17211B':'rgba(255,255,255,0.5)'}}>
            {s.label}
          </button>
        ))}
      </div>

      {section==='general'&&<GeneralSettingsSection isSuperAdmin={isSuperAdmin}/>}
      {section==='bank'   &&<BankDetailsSection      isSuperAdmin={isSuperAdmin}/>}
    </div>
  )
}

// ── Settings: General (social links, contact) ───────────────────────────────────
function GeneralSettingsSection({isSuperAdmin}) {
  const [settings,setSettings]=useState({})
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState({})
  const {user:admin}=useAuth()

  const FIELDS=[
    {key:'social_facebook',  label:'Facebook URL',  placeholder:'https://facebook.com/dealmatch',  category:'Social Media'},
    {key:'social_instagram', label:'Instagram URL',  placeholder:'https://instagram.com/dealmatch', category:'Social Media'},
    {key:'social_twitter',   label:'X (Twitter) URL',placeholder:'https://x.com/dealmatch',          category:'Social Media'},
    {key:'social_linkedin',  label:'LinkedIn URL',   placeholder:'https://linkedin.com/company/dealmatch', category:'Social Media'},
    {key:'whatsapp_number',  label:'WhatsApp Business Number', placeholder:'2347057392060', category:'Contact'},
    {key:'support_email',    label:'Support Email',  placeholder:'support@dealmatch.com.ng',     category:'Contact'},
  ]

  const load=async()=>{
    setLoading(true)
    const {data}=await supabase.from('platform_settings').select('key,value')
    const map={}
    for(const row of data||[]) map[row.key]=row.value||''
    setSettings(map)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const saveField=async(key)=>{
    if(!isSuperAdmin){toast.error('Only the superadmin can edit settings');return}
    setSaving(s=>({...s,[key]:true}))
    const {error}=await supabase.from('platform_settings').upsert({
      key, value:settings[key]||'', updated_by:admin?.id, updated_at:new Date().toISOString(),
    },{onConflict:'key'})
    setSaving(s=>({...s,[key]:false}))
    if(error){toast.error('Could not save: '+error.message);return}
    await auditLog('platform_setting_updated',{key,by:admin?.id})
    toast.success('Saved')
  }

  const categories=[...new Set(FIELDS.map(f=>f.category))]

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      {categories.map(cat=>(
        <div key={cat} className="rounded-2xl p-5" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{color:'rgba(255,255,255,0.3)'}}>{cat}</p>
          <div className="space-y-4">
            {FIELDS.filter(f=>f.category===cat).map(f=>(
              <div key={f.key}>
                <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>{f.label}</label>
                <div className="flex gap-2">
                  <input
                    value={settings[f.key]||''}
                    onChange={e=>setSettings(s=>({...s,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    disabled={!isSuperAdmin}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                    style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}
                  />
                  {isSuperAdmin&&(
                    <button onClick={()=>saveField(f.key)} disabled={saving[f.key]}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
                      style={{backgroundColor:'#D4A853',color:'#17211B'}}>
                      <Save size={12}/> {saving[f.key]?'Saving…':'Save'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Settings: Bank Details ───────────────────────────────────────────────────────
// DealMatch's own business bank account(s) - where large/manual settlements
// land. Sensitive - restricted to admin/staff read, superadmin write only
// (enforced server-side via RLS in db/platform-settings-schema.sql).
function BankDetailsSection({isSuperAdmin}) {
  const [accounts,setAccounts]=useState([])
  const [loading,setLoading]=useState(true)
  const [editing,setEditing]=useState(null) // account being edited, or 'new'
  const [form,setForm]=useState({bank_name:'',account_name:'',account_number:'',account_type:'business',currency:'NGN',notes:''})
  const [saving,setSaving]=useState(false)
  const {user:admin}=useAuth()
  const {requireReauth,ReauthModalEl}=useReauthGate(admin?.email)

  const load=async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('bank_details').select('*').order('is_primary',{ascending:false}).order('created_at',{ascending:false})
    if(error){console.error(error.message);setAccounts([]);setLoading(false);return}
    setAccounts(data||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const startNew=()=>{
    setForm({bank_name:'',account_name:'',account_number:'',account_type:'business',currency:'NGN',notes:''})
    setEditing('new')
  }
  const startEdit=(acc)=>{
    setForm({bank_name:acc.bank_name,account_name:acc.account_name,account_number:acc.account_number,account_type:acc.account_type,currency:acc.currency,notes:acc.notes||''})
    setEditing(acc.id)
  }

  const save=async()=>{
    if(!isSuperAdmin){toast.error('Only the superadmin can edit bank details');return}
    if(!form.bank_name||!form.account_name||!/^\d{10}$/.test(form.account_number)){
      toast.error('Bank name, account name and a valid 10-digit account number are required')
      return
    }
    if(!(await requireReauth()))return
    setSaving(true)
    const payload={...form,updated_by:admin?.id,updated_at:new Date().toISOString()}
    const {error}=editing==='new'
      ? await supabase.from('bank_details').insert(payload)
      : await supabase.from('bank_details').update(payload).eq('id',editing)
    setSaving(false)
    if(error){toast.error('Could not save: '+error.message);return}
    await auditLog('bank_details_'+(editing==='new'?'added':'updated'),{by:admin?.id})
    toast.success('Saved')
    setEditing(null)
    load()
  }

  const toggleActive=async(acc)=>{
    if(!isSuperAdmin)return
    if(!(await requireReauth()))return
    await supabase.from('bank_details').update({is_active:!acc.is_active}).eq('id',acc.id)
    await auditLog('bank_details_'+(acc.is_active?'deactivated':'activated'),{id:acc.id,by:admin?.id})
    load()
  }
  const setPrimary=async(acc)=>{
    if(!isSuperAdmin)return
    if(!(await requireReauth()))return
    // Only one primary at a time - clear others first
    await supabase.from('bank_details').update({is_primary:false}).neq('id',acc.id)
    await supabase.from('bank_details').update({is_primary:true}).eq('id',acc.id)
    await auditLog('bank_details_primary_set',{id:acc.id,by:admin?.id})
    toast.success(acc.bank_name+' set as primary account')
    load()
  }
  const remove=async(acc)=>{
    if(!isSuperAdmin)return
    if(!window.confirm('Delete this bank account? This cannot be undone.'))return
    if(!(await requireReauth()))return
    await supabase.from('bank_details').delete().eq('id',acc.id)
    await auditLog('bank_details_deleted',{id:acc.id,by:admin?.id})
    toast.success('Deleted')
    load()
  }

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(200,95,45,0.06)',border:'1px solid rgba(200,95,45,0.15)'}}>
        <Shield size={14} style={{color:'#C85F2D',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          These are DealMatch's own business accounts for receiving large or manually-confirmed payments.
          This is separate from a user's personal bank account used for referral payouts.
        </p>
      </div>

      {isSuperAdmin&&editing!=='new'&&(
        <button onClick={startNew}
          className="w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
          style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853',border:'1px dashed rgba(212,168,83,0.3)'}}>
          <Plus size={14}/> Add Bank Account
        </button>
      )}

      {editing&&(
        <div className="rounded-2xl p-5 space-y-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,168,83,0.25)'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#D4A853'}}>
            {editing==='new'?'New Bank Account':'Edit Bank Account'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Bank Name *</label>
              <input value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))}
                placeholder="e.g. GTBank" className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Type</label>
              <select value={form.account_type} onChange={e=>setForm(f=>({...f,account_type:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}>
                <option value="business">Business</option>
                <option value="domiciliary">Domiciliary (USD)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Name *</label>
            <input value={form.account_name} onChange={e=>setForm(f=>({...f,account_name:e.target.value}))}
              placeholder="DEALMATCH TECHNOLOGY LIMITED" className="w-full px-4 py-2.5 rounded-xl text-sm"
              style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Number *</label>
              <input value={form.account_number} onChange={e=>setForm(f=>({...f,account_number:e.target.value.replace(/\D/g,'').slice(0,10)}))}
                placeholder="10 digits" className="w-full px-4 py-2.5 rounded-xl text-sm font-mono"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Currency</label>
              <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}>
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Notes (optional)</label>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              placeholder="e.g. Used for escrow settlements above N5M" className="w-full px-4 py-2.5 rounded-xl text-sm"
              style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
              style={{backgroundColor:'#D4A853',color:'#17211B'}}>
              <Save size={12}/> {saving?'Saving…':'Save Account'}
            </button>
            <button onClick={()=>setEditing(null)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {accounts.length===0&&!editing&&(
        <div className="rounded-2xl p-6 text-center" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.1)'}}>
          <p className="text-sm" style={{color:'rgba(255,255,255,0.4)'}}>No bank accounts added yet</p>
        </div>
      )}

      {accounts.map(acc=>(
        <div key={acc.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid '+(acc.is_primary?'rgba(212,168,83,0.3)':'rgba(255,255,255,0.06)')}}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">{acc.bank_name}</p>
                {acc.is_primary&&<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:'rgba(212,168,83,0.15)',color:'#D4A853'}}>PRIMARY</span>}
                {!acc.is_active&&<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)'}}>INACTIVE</span>}
              </div>
              <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.5)'}}>{acc.account_name}</p>
              <p className="text-sm font-mono mt-1" style={{color:'rgba(255,255,255,0.7)'}}>{acc.account_number} · {acc.currency}</p>
              {acc.notes&&<p className="text-xs mt-1.5" style={{color:'rgba(255,255,255,0.3)'}}>{acc.notes}</p>}
            </div>
          </div>
          {isSuperAdmin&&(
            <div className="flex gap-2 mt-3">
              <button onClick={()=>startEdit(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Edit</button>
              {!acc.is_primary&&<button onClick={()=>setPrimary(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}>Set Primary</button>}
              <button onClick={()=>toggleActive(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>{acc.is_active?'Deactivate':'Activate'}</button>
              <button onClick={()=>remove(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D'}}>Delete</button>
            </div>
          )}
        </div>
      ))}
      {ReauthModalEl}
    </div>
  )
}

// ── ANALYTICS ──────────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const d=await adminFetch('stats'); setData(d)
    }catch{
      try{
        const [{count:tu},{count:tp},{count:ap},{count:pp},{count:tpr},{count:apr},{count:ma},{count:et},{data:pd},{count:re},{count:pi}]=await Promise.all([
          supabase.from('profiles').select('*',{count:'exact',head:true}),
          supabase.from('properties').select('*',{count:'exact',head:true}),
          supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','active'),
          supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
          supabase.from('professional_applications').select('*',{count:'exact',head:true}),
          supabase.from('professional_applications').select('*',{count:'exact',head:true}).eq('status','approved'),
          supabase.from('mortgage_applications').select('*',{count:'exact',head:true}),
          supabase.from('escrow_transactions').select('*',{count:'exact',head:true}),
          supabase.from('payments').select('amount').eq('status','success'),
          supabase.from('rental_enquiries').select('*',{count:'exact',head:true}),
          supabase.from('profiles').select('*',{count:'exact',head:true}).eq('identity_verification_status','submitted'),
        ])
        setData({totalUsers:tu,totalProps:tp,activeListings:ap,pendingListings:pp,totalPros:tpr,activePros:apr,mortgageApps:ma,escrowTxns:et,totalRevenue:(pd||[]).reduce((s,p)=>s+(p.amount||0),0),rentalEnquiries:re,pendingIdentity:pi})
      }catch(e){console.error(e)}
    }
    setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  if(loading) return <Spinner/>

  const listingRate=data?.totalProps>0?Math.round((data.activeListings/data.totalProps)*100):0
  const proRate=data?.totalPros>0?Math.round((data.activePros/data.totalPros)*100):0

  const metrics=[
    {label:'Total Users',value:fmtNum(data?.totalUsers),icon:Users,color:'#5B8DEF'},
    {label:'All Properties',value:fmtNum(data?.totalProps),icon:Home,color:'#7A9E7E'},
    {label:'Live Properties',value:fmtNum(data?.activeListings),icon:CheckCircle,color:'#7A9E7E'},
    {label:'Pending Review',value:fmtNum(data?.pendingListings),icon:Clock,color:'#D4A853'},
    {label:'Total Pros',value:fmtNum(data?.totalPros),icon:Briefcase,color:'#C85F2D'},
    {label:'Active Pros',value:fmtNum(data?.activePros),icon:Star,color:'#C85F2D'},
    {label:'Mortgage Apps',value:fmtNum(data?.mortgageApps),icon:Building,color:'#D4A853'},
    {label:'Escrow Txns',value:fmtNum(data?.escrowTxns),icon:Wallet,color:'#5B8DEF'},
    {label:'Total Revenue',value:fmt(data?.totalRevenue||0),icon:TrendingUp,color:'#D4A853'},
    {label:'Rental Enquiries',value:fmtNum(data?.rentalEnquiries),icon:MessageSquare,color:'#888'},
    {label:'ID Pending',value:fmtNum(data?.pendingIdentity),icon:Shield,color:'#C85F2D'},
    {label:'Student Pending',value:fmtNum(data?.studentVerifs||0),icon:GraduationCap,color:'#5B8DEF'},
  ]

  const RatioBar=({label,rate,color,subA,subB})=>(
    <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xl font-black" style={{color}}>{rate}%</span>
      </div>
      <div className="w-full h-2 rounded-full mb-2" style={{backgroundColor:'rgba(255,255,255,0.08)'}}>
        <div className="h-full rounded-full transition-all" style={{width:`${rate}%`,backgroundColor:color}}/>
      </div>
      <div className="flex justify-between text-xs" style={{color:'rgba(255,255,255,0.35)'}}>
        <span>{subA}</span><span>{subB}</span>
      </div>
    </div>
  )

  return(
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">Platform Analytics</h3>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}><RefreshCw size={12}/> Refresh</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(m=><StatCard key={m.label} icon={m.icon} label={m.label} value={m.value} color={m.color}/>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RatioBar label="Listing Approval Rate" rate={listingRate} color="#7A9E7E" subA={`${fmtNum(data?.activeListings)} live`} subB={`${fmtNum(data?.pendingListings)} pending`}/>
        <RatioBar label="Professional Activation" rate={proRate} color="#C85F2D" subA={`${fmtNum(data?.activePros)} active`} subB={`${fmtNum((data?.totalPros||0)-(data?.activePros||0))} inactive`}/>
      </div>
    </div>
  )
}

// ── NAV + MAIN SHELL ───────────────────────────────────────────────────────────

// ─── Agent Scores Tab ────────────────────────────────────────────────────────
function AgentScoresTab({ admin }) {
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

// ─── Complaints Tab ───────────────────────────────────────────────────────────
function ComplaintsTab({ admin }) {
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

const NAV_ITEMS=[
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
  {path:'staff',    label:'Staff',           icon:UserCog},
  {path:'settings', label:'Settings',        icon:Settings},
  {path:'analytics',label:'Analytics',       icon:BarChart2},
]

export default function AdminPage() {
  const {user,profile}=useAuth()
  const navigate=useNavigate()
  const location=useLocation()
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [badges,setBadges]=useState({})

  const isSuperAdmin=SUPERADMIN_EMAILS.includes(user?.email)
  const adminName=profile?.full_name||user?.email?.split('@')[0]||'Admin'
  const activeTab=location.pathname.replace('/admin','').replace(/^\//,'')

  useEffect(()=>{
    const loadBadges=async()=>{
      try{
        const [{count:identity},{count:properties},{count:students}]=await Promise.all([
          supabase.from('profiles').select('*',{count:'exact',head:true}).eq('identity_verification_status','submitted'),
          supabase.from('properties').select('*',{count:'exact',head:true}).eq('status','pending_review'),
          supabase.from('student_verifications').select('*',{count:'exact',head:true}).eq('status','pending'),
        ])
        setBadges({identity,properties,'student-verifications':students})
      }catch{}
    }
    loadBadges()
  },[location.pathname])

  const handleSignOut=async()=>{
    await supabase.auth.signOut()
    navigate('/staff-gate-7f3k',{replace:true})
  }

  return(
    <div className="min-h-screen flex" style={{backgroundColor:'#120D0A',fontFamily:"'DM Sans',sans-serif"}}>
      {sidebarOpen&&<div className="fixed inset-0 z-30 lg:hidden" style={{backgroundColor:'rgba(0,0,0,0.5)'}} onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-64 transition-transform duration-300 ${sidebarOpen?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}
        style={{backgroundColor:'#17211B',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="px-5 py-4 flex items-center gap-2.5" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{backgroundColor:'rgba(212,168,83,0.15)'}}><Shield size={16} style={{color:'#D4A853'}}/></div>
          <div><div className="font-black text-white text-sm leading-tight">DealMatch</div><div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>Control Panel</div></div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item=>{
            const isActive=activeTab===(item.path||'')
            const badge=badges[item.path]||0
            return(
              <NavLink key={item.path} to={`/admin${item.path?'/'+item.path:''}`} onClick={()=>setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{backgroundColor:isActive?'rgba(212,168,83,0.12)':'transparent',color:isActive?'#D4A853':'rgba(255,255,255,0.45)'}}>
                <item.icon size={16} style={{flexShrink:0}}/>
                <span className="flex-1">{item.label}</span>
                {badge>0&&<span className="text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style={{backgroundColor:'#C85F2D',color:'#fff',fontSize:10}}>{badge>99?'99+':badge}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="px-4 py-4" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs" style={{backgroundColor:isSuperAdmin?'rgba(212,168,83,0.2)':'rgba(255,255,255,0.08)',color:isSuperAdmin?'#D4A853':'rgba(255,255,255,0.6)'}}>
              {adminName[0]?.toUpperCase()||'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{adminName}</div>
              <div className="text-xs truncate" style={{color:'rgba(255,255,255,0.3)'}}>{isSuperAdmin?' Superadmin':ROLE_LABELS[profile?.role]||'Staff'}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D'}}>
            <LogOut size={13}/> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-4 px-5 py-3" style={{backgroundColor:'rgba(18,13,10,0.95)',borderBottom:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(8px)'}}>
          <button onClick={()=>setSidebarOpen(v=>!v)} className="lg:hidden p-2 rounded-xl hover:bg-white/5 transition-all" style={{color:'rgba(255,255,255,0.5)'}}><Menu size={20}/></button>
          <h1 className="text-white font-bold text-base flex-1">{NAV_ITEMS.find(n=>n.path===activeTab)?.label||'Overview'}</h1>
          {isSuperAdmin&&<span className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}> Superadmin</span>}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <Routes>
            <Route index                          element={<OverviewTab/>}/>
            <Route path="properties"              element={<PropertiesTab/>}/>
            <Route path="users"                   element={<UsersTab/>}/>
            <Route path="identity"                element={<IdentityTab/>}/>
            <Route path="skill-verify"            element={<SkillVerifyTab/>}/>
            <Route path="pipeline"                element={<PipelineTab/>}/>
            <Route path="transactions"            element={<TransactionsTab/>}/>
            <Route path="payouts"                 element={<PayoutsTab/>}/>
            <Route path="monetisation"            element={<MonetisationTab/>}/>
            <Route path="fees"                    element={<PlatformFeesTab/>}/>
            <Route path="mortgage"                element={<MortgageTab/>}/>
            <Route path="enquiries"               element={<EnquiriesTab/>}/>
            <Route path="professionals"           element={<ProfessionalsTab/>}/>
            <Route path="hostels"                 element={<StudentHostelsAdminTab/>}/>
            <Route path="student-verifications"   element={<StudentVerificationsTab/>}/>
            <Route path="announcements"           element={<AnnouncementsTab/>}/>
            <Route path="testimonials"            element={<TestimonialsTab/>}/>
            <Route path="staff"                   element={<StaffTab isSuperAdmin={isSuperAdmin}/>}/>
            <Route path="settings"                element={<SettingsTab isSuperAdmin={isSuperAdmin}/>}/>
            <Route path="analytics"               element={<AnalyticsTab/>}/>
          </Routes>
        </div>
      </main>
    </div>
  )
}

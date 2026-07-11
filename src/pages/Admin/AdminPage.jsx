/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GraduationCap, Home, LayoutDashboard, LogOut, Menu, MessageSquare, Pause, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { processReferralPayouts, AGENT_FIELD_FEE, AGENT_SENIOR_FEE } from '@/lib/referral'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const SUPERADMIN_EMAILS = ['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com']
const STAFF_ROLES       = ['agent', 'verifier', 'admin']
const ROLE_LABELS       = {
  admin:'Admin', agent:'Agent', verifier:'Verifier', buyer:'Buyer',
  seller:'Seller', landlord:'Landlord', investor:'Investor',
  renter:'Renter', student:'Student', suspended:'Suspended', deleted:'Deleted',
}
const ROLE_COLORS = { admin:'#D4A853', agent:'#5B8DEF', verifier:'#7A9E7E' }

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

// auditLog is now handled entirely by DB triggers on admin_audit_log.
// Frontend must NOT insert directly (per RLS — immutable, trigger-only).
// This stub remains for gradual migration; calls are no-ops.
async function auditLog(_action, _meta={}) {
  // Intentional no-op: audit entries are written by Postgres triggers only.
  // See db/fixes-v2.sql for trigger definition.
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
        style={{ color:trend>=0?'#7A9E7E':'#C96A3A' }}>
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
        style={{ backgroundColor:danger?'rgba(201,106,58,0.12)':'rgba(212,168,83,0.1)' }}>
        {danger?<AlertTriangle size={22} style={{ color:'#C96A3A' }}/>:<Shield size={22} style={{ color:'#D4A853' }}/>}
      </div>
      <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm mb-6" style={{ color:'rgba(255,255,255,0.5)' }}>{body}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-sm font-semibold"
          style={{ backgroundColor:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.6)' }}>Cancel</button>
        <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl text-sm font-bold"
          style={{ backgroundColor:danger?'#C96A3A':'#D4A853', color:'#1A1210' }}>Confirm</button>
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
        style={{ backgroundColor:value===k?'#D4A853':'rgba(255,255,255,0.06)', color:value===k?'#1A1210':'rgba(255,255,255,0.5)' }}>
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
  const [loading,setLoading]=useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
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
    setLoading(false)
  },[])

  useEffect(()=>{load()},[load])

  const SC={pending_review:'#D4A853',active:'#7A9E7E',rejected:'#C96A3A',paused:'#888',sold:'#888'}
  if(loading) return <Spinner/>
  return(
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-black text-xl">Overview</h2>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all"
          style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>
          <RefreshCw size={12}/> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users}         label="Total Users"       value={fmtNum(stats?.totalUsers)}      color="#5B8DEF" onClick={()=>navigate('/admin/users')}/>
        <StatCard icon={Home}          label="Active Listings"   value={fmtNum(stats?.activeListings)}  color="#7A9E7E" onClick={()=>navigate('/admin/properties')}/>
        <StatCard icon={Clock}         label="Pending Review"    value={fmtNum(stats?.pendingListings)} color="#D4A853" onClick={()=>navigate('/admin/properties')}/>
        <StatCard icon={Wallet}        label="Total Revenue"     value={fmt(stats?.totalRevenue||0)}    color="#D4A853"/>
        <StatCard icon={Shield}        label="ID Pending"        value={fmtNum(stats?.pendingIdentity)} color="#C96A3A" onClick={()=>navigate('/admin/identity')}/>
        <StatCard icon={Briefcase}     label="Professionals"     value={fmtNum(stats?.totalPros)}       color="#5B8DEF" onClick={()=>navigate('/admin/professionals')}/>
        <StatCard icon={FileText}      label="Mortgage Apps"     value={fmtNum(stats?.mortgageApps||0)} color="#888"   onClick={()=>navigate('/admin/mortgage')}/>
        <StatCard icon={MessageSquare} label="Enquiries"         value={fmtNum(stats?.rentalEnquiries||0)} color="#888" onClick={()=>navigate('/admin/enquiries')}/>
      </div>
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{backgroundColor:'rgba(122,158,126,0.06)',border:'1px solid rgba(122,158,126,0.15)'}}>
        <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:'#7A9E7E',boxShadow:'0 0 0 3px rgba(122,158,126,0.2)'}}/>
        <span className="text-white font-bold text-sm">Operational</span>
        <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>All systems normal</span>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.07)'}}>
        <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <h3 className="font-bold text-white text-sm">Recent Property Submissions</h3>
          <NavLink to="/admin/properties" className="text-xs font-semibold flex items-center gap-1" style={{color:'#D4A853'}}>
            View all <ChevronRight size={12}/>
          </NavLink>
        </div>
        {recent.length>0?recent.map(p=>(
          <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <div>
              <div className="text-sm font-semibold text-white truncate max-w-[200px]">{p.title}</div>
              <div className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{p.profiles?.full_name||'Unknown'} · {ago(p.created_at)}</div>
            </div>
            <Badge label={p.status?.replace('_',' ')||'N/A'} color={SC[p.status]||'#888'}/>
          </div>
        )):<div className="px-5 py-8 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No submissions yet</div>}
      </div>
      {recentUsers.length>0&&(
        <div className="rounded-2xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.07)'}}>
          <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            <h3 className="font-bold text-white text-sm">Recent Signups</h3>
            <NavLink to="/admin/users" className="text-xs font-semibold flex items-center gap-1" style={{color:'#D4A853'}}>View all <ChevronRight size={12}/></NavLink>
          </div>
          {recentUsers.map(u=>(
            <div key={u.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div>
                <div className="text-sm font-semibold text-white">{u.full_name||'N/A'}</div>
                <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(u.email)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={ROLE_LABELS[u.role]||u.role||'buyer'} color={ROLE_COLORS[u.role]||'#888'}/>
                <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{ago(u.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const SM={pending_review:{label:'Pending',color:'#D4A853'},active:{label:'Live',color:'#7A9E7E'},rejected:{label:'Rejected',color:'#C96A3A'},paused:{label:'Paused',color:'#888'},sold:{label:'Sold',color:'#888'}}

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
                  {p.status!=='rejected'&&<ActionBtn icon={X} color="#C96A3A" tip="Reject" onClick={()=>setConfirm({title:'Reject listing?',body:`"${p.title}" will be rejected.`,danger:true,onConfirm:()=>setStatus(p.id,'rejected',p.title)})}/>}
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
  const [confirm,setConfirm]=useState(null)
  const [roleTarget,setRoleTarget]=useState(null)
  const PAGE=50

  const [apiError,setApiError]=useState('')

  const load=useCallback(async(pg=0,q=search,role=roleFilter)=>{
    setLoading(true)
    setApiError('')
    try{
      // First try: API route using service role key
      const params=new URLSearchParams({page:pg,limit:PAGE})
      if(q) params.set('search',q)
      if(role) params.set('role',role)
      const res=await adminFetch(`users?${params}`)
      setItems(res.users||[]); setTotal(res.total||0); setPage(pg)
      setLoading(false); return
    }catch(apiErr){
      console.warn('API route failed, trying direct query:', apiErr.message)
    }
    // Second try: direct Supabase query (works if admin RLS policy is applied)
    try{
      let q2=supabase.from('profiles')
        .select('id,full_name,email,phone,role,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated',{count:'exact'})
        .order('created_at',{ascending:false})
        .range(pg*PAGE, pg*PAGE+PAGE-1)
      if(q) q2=q2.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      if(role) q2=q2.eq('role',role)
      const {data,count,error}=await q2
      if(error) throw error
      setItems(data||[]); setTotal(count||data?.length||0); setPage(pg)
    }catch(dbErr){
      console.error('Direct query also failed:', dbErr.message)
      setApiError(dbErr.message)
    }
    setLoading(false)
  },[search,roleFilter])

  useEffect(()=>{load(0,'','')},[])


  const action=async(act,userId,name,role='')=>{
    try{
      await adminFetch('users',{method:'POST',body:JSON.stringify({action:act,userId,role})})
      const msgs={suspend:`${name} suspended`,unsuspend:`${name} unsuspended`,deactivate:`${name} deactivated`,set_role:`Role → ${ROLE_LABELS[role]||role}`}
      toast.success(msgs[act]||'Done')
      setConfirm(null); setRoleTarget(null); load(page)
    }catch(e){toast.error(e.message)}
  }

  const IDC={approved:'#7A9E7E',submitted:'#D4A853',rejected:'#C96A3A'}

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={v=>{setSearch(v);load(0,v,roleFilter)}} onSearch={v=>load(0,v,roleFilter)} placeholder="Search name or email…"/>
        <select value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);load(0,search,e.target.value)}}
          className="px-3 py-2.5 rounded-xl text-xs outline-none font-semibold"
          style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:roleFilter?'#D4A853':'rgba(255,255,255,0.5)',minWidth:120}}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k} style={{backgroundColor:'#1A1210'}}>{v}</option>)}
        </select>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{total} user{total!==1?'s':''} total</div>
      {apiError&&(
        <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(201,106,58,0.08)',border:'1px solid rgba(201,106,58,0.2)'}}>
          <p className="text-xs font-bold mb-1" style={{color:'#C96A3A'}}>Could not load users from database</p>
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
          <TableWrap cols={['User','Contact','Role','ID Status','Joined','Actions']}>
            {items.map(u=>(
              <TR key={u.id}>
                <td className="px-4 py-3" style={{opacity:u.is_deactivated?0.45:1}}>
                  <div className="font-semibold text-white text-sm">{u.full_name||'N/A'}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{u.onboarding_completed ? 'Yes' : 'No'}{u.is_deactivated?' · ':''}</div>
                </td>
                <td className="px-4 py-3"><div className="text-white text-xs">{maskEmail(u.email)}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskPhone(u.phone)}</div></td>
                <td className="px-4 py-3"><Badge label={ROLE_LABELS[u.role]||u.role||'buyer'} color={ROLE_COLORS[u.role]||'#888'}/></td>
                <td className="px-4 py-3">
                  {u.identity_verification_status==='approved'&&<Badge label="Verified" color="#7A9E7E"/>}
                  {u.identity_verification_status==='submitted'&&<Badge label="Pending" color="#D4A853"/>}
                  {u.identity_verification_status==='rejected'&&<Badge label="Rejected" color="#C96A3A"/>}
                  {(!u.identity_verification_status||u.identity_verification_status==='unverified')&&<span className="text-xs" style={{color:'rgba(255,255,255,0.2)'}}>None</span>}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <ActionBtn icon={UserCog} color="#D4A853" tip="Change role" onClick={()=>setRoleTarget({id:u.id,current:u.role,name:u.full_name||u.email})}/>
                    {u.role!=='suspended'&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Ban} color="#C96A3A" tip="Suspend" onClick={()=>setConfirm({title:'Suspend user?',body:`${u.full_name||'User'} will lose access immediately.`,danger:true,onConfirm:()=>action('suspend',u.id,u.full_name||u.email)})}/>}
                    {u.role==='suspended'&&<ActionBtn icon={Play} color="#7A9E7E" tip="Unsuspend" onClick={()=>action('unsuspend',u.id,u.full_name||u.email)}/>}
                    {!u.is_deactivated&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Trash2} color="#888" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate account?',body:`${u.full_name||'User'}'s account will be permanently deactivated.`,danger:true,onConfirm:()=>action('deactivate',u.id,u.full_name||u.email)})}/>}
                  </div>
                </td>
              </TR>
            ))}
            {items.length===0&&<EmptyRow cols={6} msg="No users found"/>}
          </TableWrap>
          {total>PAGE&&(
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{page*PAGE+1}–{Math.min((page+1)*PAGE,total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={()=>load(page-1)} disabled={page===0} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>← Prev</button>
                <button onClick={()=>load(page+1)} disabled={(page+1)*PAGE>=total} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Next →</button>
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
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {Object.entries(ROLE_LABELS).filter(([k])=>k!=='deleted').map(([r,l])=>(
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
  const SC={submitted:'#D4A853',approved:'#7A9E7E',rejected:'#C96A3A'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('profiles').select('id,full_name,email,phone,role,identity_photo_url,identity_selfie_url,identity_doc_type,identity_verification_status,identity_verified_at,identity_rejection_note,created_at').order('created_at',{ascending:false}).limit(200)
    if(filter==='all') q=q.in('identity_verification_status',['submitted','approved','rejected'])
    else q=q.eq('identity_verification_status',filter)
    const {data,error}=await q
    if(error){toast.error('Could not load - run fixes-v2.sql in Supabase'); setLoading(false); return}
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
    if(error){toast.error('Failed');return}
    await auditLog('identity_approved',{user_id:id,by:admin?.id})
    toast.success(`${name} - verified`); setConfirm(null); load()
  }

  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter rejection reason');return}
    const {error}=await supabase.from('profiles').update({identity_verification_status:'rejected',is_photo_verified:false,is_live_verified:false,identity_rejection_note:reason.trim(),identity_verified_by:admin?.id}).eq('id',reject.id)
    if(error){toast.error('Failed');return}
    await auditLog('identity_rejected',{user_id:reject.id,reason,by:admin?.id})
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
                    <Badge label={ROLE_LABELS[u.role]||u.role||'N/A'} color={ROLE_COLORS[u.role]||'#888'}/>
                  </div>
                  <div className="text-xs mb-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(u.email)} · {maskPhone(u.phone)}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{ago(u.created_at)}</div>
                  {u.identity_rejection_note&&<div className="mt-2 text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(201,106,58,0.08)',color:'#C96A3A'}}>Prev rejection: {u.identity_rejection_note}</div>}
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
                  <button onClick={()=>setConfirm({title:'Approve identity?',body:`${u.full_name} will be fully verified and unlock all transactions.`,onConfirm:()=>approve(u.id,u.full_name||u.email)})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.3)'}}>
                    <Check size={13}/> Approve & Verify
                  </button>
                  <button onClick={()=>setReject({id:u.id,name:u.full_name||u.email})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(201,106,58,0.1)',color:'#C96A3A',border:'1px solid rgba(201,106,58,0.2)'}}>
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
              <X size={22} style={{color:'#C96A3A'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Reject Identity</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Tell <strong className="text-white">{reject.name}</strong> why their ID was rejected.</p>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. Photo is blurry. Please upload a clearer image." className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
              <div className="flex gap-3">
                <button onClick={()=>{setReject(null);setReason('')}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C96A3A',color:'#1A1210'}}>Send Rejection</button>
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

// ── TRANSACTIONS ───────────────────────────────────────────────────────────────
function TransactionsTab() {
  const [tab,setTab]=useState('payments')
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const SC={success:'#7A9E7E',paid:'#7A9E7E',confirmed:'#7A9E7E',released:'#7A9E7E',pending:'#D4A853',funded:'#5B8DEF',failed:'#C96A3A',rejected:'#C96A3A',disputed:'#C96A3A',refunded:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      if(tab==='payments'){const{data}=await supabase.from('payments').select('id,reference,amount,payment_type,email,status,created_at').order('created_at',{ascending:false}).limit(200);setItems(data||[])}
      else if(tab==='escrow'){const{data}=await supabase.from('escrow_transactions').select('id,amount,platform_fee,status,payment_ref,created_at,properties(title),profiles(full_name)').order('created_at',{ascending:false}).limit(200);setItems(data||[])}
      else{const{data}=await supabase.from('crypto_payments').select('id,reference,description,coin,usdt_amount,network_label,status,created_at,user_name').order('created_at',{ascending:false}).limit(200);setItems(data||[])}
    }catch(e){console.error(e)}
    setLoading(false)
  },[tab])
  useEffect(()=>{load()},[load])

  const filtered=items.filter(i=>!search||i.reference?.toLowerCase().includes(search.toLowerCase())||i.email?.toLowerCase().includes(search.toLowerCase())||i.description?.toLowerCase().includes(search.toLowerCase())||i.user_name?.toLowerCase().includes(search.toLowerCase())||i.properties?.title?.toLowerCase().includes(search.toLowerCase()))
  const total=items.reduce((s,i)=>s+(i.amount||i.usdt_amount||0),0)

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          {[['payments','Paystack'],['escrow','Escrow'],['crypto','Crypto']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className="px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{backgroundColor:tab===k?'#D4A853':'rgba(255,255,255,0.06)',color:tab===k?'#1A1210':'rgba(255,255,255,0.5)'}}>{l}</button>
          ))}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search reference, email…"/>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} records · Total: {tab==='crypto'?`$${total.toFixed(2)} USDT`:fmt(total)}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={tab==='payments'?['Reference','Amount','Type','Email','Status','Date']:tab==='escrow'?['Property','User','Amount','Fee','Status','Date']:['Reference','Description','USDT','Network','Status','Date']}>
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
              {tab==='crypto'&&<>
                <td className="px-4 py-3 font-mono text-xs text-white">{(item.reference||'N/A').slice(0,16)}…</td>
                <td className="px-4 py-3 text-xs text-white truncate max-w-[140px]">{item.description||'N/A'}</td>
                <td className="px-4 py-3 font-semibold text-white">${item.usdt_amount||0}</td>
                <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{item.network_label||'N/A'}</td>
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

// ── PROFESSIONALS ──────────────────────────────────────────────────────────────
function ProfessionalsTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [search,setSearch]=useState('')
  const [confirm,setConfirm]=useState(null)
  const SC={approved:'#7A9E7E',pending:'#D4A853',inactive:'#888',rejected:'#C96A3A'}

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
                  {p.status!=='active'&&<ActionBtn icon={Check} color="#7A9E7E" tip="Activate" onClick={()=>setConfirm({title:'Activate professional?',body:`${p.full_name} will appear in the directory.`,onConfirm:()=>setStatus(p.id,'active',p.full_name)})}/>}
                  {p.status==='active'&&<ActionBtn icon={Pause} color="#D4A853" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate?',body:`${p.full_name} will be hidden.`,danger:true,onConfirm:()=>setStatus(p.id,'inactive',p.full_name)})}/>}
                  {p.status!=='rejected'&&<ActionBtn icon={X} color="#C96A3A" tip="Reject" onClick={()=>setConfirm({title:'Reject?',body:`Reject ${p.full_name}'s application?`,danger:true,onConfirm:()=>setStatus(p.id,'rejected',p.full_name)})}/>}
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
  const SC={pending:'#D4A853',under_review:'#5B8DEF',approved:'#7A9E7E',rejected:'#C96A3A',disbursed:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('mortgage_applications').select('*,profiles(full_name,email,phone)').order('created_at',{ascending:false}).limit(200)
    if(filter!=='all') q=q.eq('status',filter)
    const {data,error}=await q
    if(error) toast.error(error.code==='42501'?'Permission denied — run fixes-v2.sql in Supabase':'Failed to load mortgage applications')
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
                    <ActionBtn icon={X} color="#C96A3A" tip="Reject" onClick={()=>setConfirm({title:'Reject?',body:`Reject ${m.profiles?.full_name}'s application?`,danger:true,onConfirm:()=>setStatus(m.id,'rejected',m.profiles?.full_name||'Applicant')})}/>
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
  const SM={pending_review:{label:'Pending',color:'#D4A853'},active:{label:'Live',color:'#7A9E7E'},paused:{label:'Paused',color:'#888'},rejected:{label:'Rejected',color:'#C96A3A'},filled:{label:'Filled',color:'#5B8DEF'}}
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
              <td className="px-4 py-3">{h.listing_paid?<Badge label="Paid" color="#7A9E7E"/>:<Badge label="Unpaid" color="#C96A3A"/>}</td>
              <td className="px-4 py-3"><Badge label={meta.label} color={meta.color}/></td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {h.status!=='active'&&h.listing_paid&&<ActionBtn icon={Check} color="#7A9E7E" tip="Approve" onClick={()=>setConfirm({title:'Approve hostel?',body:`"${h.title}" will go live for students.`,onConfirm:()=>setStatus(h.id,'active',h.title)})}/>}
                  {h.status==='active'&&<ActionBtn icon={Pause} color="#D4A853" tip="Pause" onClick={()=>setConfirm({title:'Pause hostel?',body:`"${h.title}" will be hidden.`,onConfirm:()=>setStatus(h.id,'paused',h.title)})}/>}
                  {h.status==='paused'&&<ActionBtn icon={Play} color="#5B8DEF" tip="Restore" onClick={()=>setStatus(h.id,'active',h.title)}/>}
                  {h.status!=='rejected'&&<ActionBtn icon={X} color="#C96A3A" tip="Reject" onClick={()=>setConfirm({title:'Reject hostel?',body:`"${h.title}" will be rejected.`,danger:true,onConfirm:()=>setStatus(h.id,'rejected',h.title)})}/>}
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
  const SC={pending:'#D4A853',approved:'#7A9E7E',rejected:'#C96A3A'}

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
                    {v.rejection_reason&&<div className="mt-2 text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(201,106,58,0.08)',color:'#C96A3A'}}>Reason: {v.rejection_reason}</div>}
                  </div>
                  {v.id_image_signed&&<button onClick={()=>setLightbox({src:v.id_image_signed,label:`${name} - Student ID`})} className="flex-shrink-0 relative overflow-hidden rounded-xl border" style={{width:80,height:56,borderColor:'rgba(255,255,255,0.1)'}}>
                    <img src={v.id_image_signed} alt="Student ID" className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 flex items-center justify-center" style={{backgroundColor:'rgba(0,0,0,0.35)'}}><ExternalLink size={14} style={{color:'#fff'}}/></div>
                  </button>}
                </div>
                {v.status==='pending'&&(
                  <div className="flex gap-2 mt-3">
                    <button onClick={()=>setConfirm({title:'Approve student?',body:`${name} will be verified and can view hostel contacts.`,onConfirm:()=>approve(v.id,v.user_id,name)})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.3)'}}><Check size={12}/> Approve</button>
                    <button onClick={()=>setReject({id:v.id,userId:v.user_id,name})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(201,106,58,0.1)',color:'#C96A3A',border:'1px solid rgba(201,106,58,0.2)'}}><X size={12}/> Reject</button>
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
              <X size={22} style={{color:'#C96A3A'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Reject Verification</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Tell <strong className="text-white">{reject.name}</strong> why their ID was rejected.</p>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. ID photo is blurry, please upload a clearer image" className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
              <div className="flex gap-3">
                <button onClick={()=>{setReject(null);setReason('')}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C96A3A',color:'#1A1210'}}>Send Rejection</button>
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
  const TC={info:'#5B8DEF',warning:'#D4A853',success:'#7A9E7E',critical:'#C96A3A'}

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
        <button onClick={()=>setShowForm(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#1A1210'}}><Plus size={14}/> New</button>
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
                <option value="info" style={{backgroundColor:'#1A1210'}}>ℹ️ Info</option>
                <option value="warning" style={{backgroundColor:'#1A1210'}}>Warning</option>
                <option value="success" style={{backgroundColor:'#1A1210'}}>Success</option>
                <option value="critical" style={{backgroundColor:'#1A1210'}}>Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Target</label>
              <select value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                {[['all','All Users'],['buyer','Buyers'],['seller','Sellers'],['landlord','Landlords'],['professional','Professionals'],['student','Students']].map(([k,l])=>(
                  <option key={k} value={k} style={{backgroundColor:'#1A1210'}}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={()=>setShowForm(false)} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
            <button onClick={publish} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#1A1210'}}>{saving?'Publishing…':'Publish Now'}</button>
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
              style={{backgroundColor:statusFilter===s?'#D4A853':'rgba(255,255,255,0.06)',color:statusFilter===s?'#1A1210':'rgba(255,255,255,0.5)'}}>
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
  const [loading,setLoading]=useState(true)
  const [showCreate,setShowCreate]=useState(false)
  const [confirm,setConfirm]=useState(null)
  const [form,setForm]=useState({email:'',fullName:'',role:'agent',tempPassword:''})
  const [creating,setCreating]=useState(false)
  const [showPass,setShowPass]=useState(false)

  const loadStaff=async()=>{
    setLoading(true)
    const {data}=await supabase.from('profiles').select('id,full_name,email,role,created_at').in('role',['agent','verifier','admin']).order('created_at',{ascending:false})
    setStaff(data||[]); setLoading(false)
  }
  useEffect(()=>{loadStaff()},[])

  const createStaff=async()=>{
    if(!form.email||!form.fullName||!form.tempPassword){toast.error('Fill in all fields');return}
    if(form.tempPassword.length<12){toast.error('Password must be 12+ characters');return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){toast.error('Invalid email');return}
    setCreating(true)
    try{
      const {data,error}=await supabase.auth.signUp({email:form.email.trim().toLowerCase(),password:form.tempPassword,options:{data:{full_name:form.fullName.trim()}}})
      if(error){toast.error(error.message?.includes('already registered')?'Email already registered':error.message||'Failed');setCreating(false);return}
      if(data?.user){
        await supabase.from('profiles').upsert({id:data.user.id,email:form.email.trim().toLowerCase(),full_name:form.fullName.trim(),role:form.role,onboarding_completed:true,updated_at:new Date().toISOString()},{onConflict:'id'})
        await auditLog('staff_created',{email:form.email,role:form.role,by:admin?.id})
        toast.success(`Staff account created for ${form.fullName}`)
        setForm({email:'',fullName:'',role:'agent',tempPassword:''}); setShowCreate(false); loadStaff()
      }
    }catch(err){toast.error(err.message||'Failed')}
    setCreating(false)
  }

  const deactivate=async(id,name)=>{
    const {error}=await supabase.from('profiles').update({role:'suspended'}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('staff_deactivated',{target_id:id,by:admin?.id})
    toast.success(`${name} deactivated`); loadStaff(); setConfirm(null)
  }

  const changeRole=async(id,newRole,name)=>{
    const {error}=await supabase.from('profiles').update({role:newRole}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('staff_role_changed',{target_id:id,new_role:newRole,by:admin?.id})
    toast.success(`${name} → ${ROLE_LABELS[newRole]}`); loadStaff()
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold">Staff Accounts</h3>
          <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{isSuperAdmin?'Create and manage all staff accounts':'Staff list - contact superadmin to add or remove'}</p>
        </div>
        {isSuperAdmin&&<button onClick={()=>setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#1A1210'}}><Plus size={14}/> New Staff</button>}
      </div>
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          <strong className="text-white">Agent</strong> - on-site property verification. <strong className="text-white">Verifier</strong> - reviews and approves identity documents. <strong className="text-white">Admin</strong> - full dashboard access. Deactivation revokes access immediately.
        </p>
      </div>
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
                    {['agent','verifier','admin'].map(r=><option key={r} value={r} style={{backgroundColor:'#1A1210'}}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <ActionBtn icon={UserX} color="#C96A3A" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate staff?',body:`${s.full_name}'s access will be revoked immediately.`,danger:true,onConfirm:()=>deactivate(s.id,s.full_name)})}/>
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
                <div><h3 className="text-white font-bold">Create Staff Account</h3><p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Superadmin only</p></div>
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
                    <option value="agent" style={{backgroundColor:'#1A1210'}}>Agent - verifies listings on-site</option>
                    <option value="verifier" style={{backgroundColor:'#1A1210'}}>Verifier - approves identity documents</option>
                    <option value="admin" style={{backgroundColor:'#1A1210'}}>Admin - full dashboard access</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Temporary Password <span style={{color:'#C96A3A'}}>(min 12 chars)</span></label>
                  <div className="relative">
                    <input value={form.tempPassword} onChange={e=>setForm(f=>({...f,tempPassword:e.target.value}))} type={showPass?'text':'password'} placeholder="Strong temporary password" className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
                    <button type="button" onClick={()=>setShowPass(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:'rgba(255,255,255,0.4)'}}>{showPass?<EyeOff size={16}/>:<Eye size={16}/>}</button>
                  </div>
                  <p className="text-xs mt-1.5" style={{color:'rgba(255,255,255,0.3)'}}>Share privately. Staff must change it on first login.</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>{setShowCreate(false);setForm({email:'',fullName:'',role:'agent',tempPassword:''})}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={createStaff} disabled={creating} className="flex-1 py-3 rounded-2xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all" style={{backgroundColor:'#D4A853',color:'#1A1210'}}>{creating?'Creating…':'Create Account'}</button>
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
          {id:'crypto',  label:'Crypto Wallets'},
        ].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={{backgroundColor:section===s.id?'#D4A853':'rgba(255,255,255,0.06)',color:section===s.id?'#1A1210':'rgba(255,255,255,0.5)'}}>
            {s.label}
          </button>
        ))}
      </div>

      {section==='general'&&<GeneralSettingsSection isSuperAdmin={isSuperAdmin}/>}
      {section==='bank'   &&<BankDetailsSection      isSuperAdmin={isSuperAdmin}/>}
      {section==='crypto' &&<CryptoWalletsSection     isSuperAdmin={isSuperAdmin}/>}
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
                      style={{backgroundColor:'#D4A853',color:'#1A1210'}}>
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
    await supabase.from('bank_details').update({is_active:!acc.is_active}).eq('id',acc.id)
    await auditLog('bank_details_'+(acc.is_active?'deactivated':'activated'),{id:acc.id,by:admin?.id})
    load()
  }
  const setPrimary=async(acc)=>{
    if(!isSuperAdmin)return
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
    await supabase.from('bank_details').delete().eq('id',acc.id)
    await auditLog('bank_details_deleted',{id:acc.id,by:admin?.id})
    toast.success('Deleted')
    load()
  }

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(201,106,58,0.06)',border:'1px solid rgba(201,106,58,0.15)'}}>
        <Shield size={14} style={{color:'#C96A3A',flexShrink:0,marginTop:2}}/>
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
              style={{backgroundColor:'#D4A853',color:'#1A1210'}}>
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
              <button onClick={()=>remove(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto" style={{backgroundColor:'rgba(201,106,58,0.1)',color:'#C96A3A'}}>Delete</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Settings: Crypto Wallets ─────────────────────────────────────────────────────
function CryptoWalletsSection({isSuperAdmin}) {
  const [wallets,setWallets]=useState([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState({})
  const [edits,setEdits]=useState({}) // id -> address being typed
  const {user:admin}=useAuth()

  const load=async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('crypto_wallets').select('*').order('sort_order',{ascending:true})
    if(error){console.error(error.message);setWallets([]);setLoading(false);return}
    setWallets(data||[])
    const map={}
    for(const w of data||[]) map[w.id]=w.address||''
    setEdits(map)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const saveAddress=async(walletId)=>{
    if(!isSuperAdmin){toast.error('Only the superadmin can edit wallet addresses');return}
    setSaving(s=>({...s,[walletId]:true}))
    const {error}=await supabase.from('crypto_wallets').update({
      address:(edits[walletId]||'').trim(), updated_by:admin?.id, updated_at:new Date().toISOString(),
    }).eq('id',walletId)
    setSaving(s=>({...s,[walletId]:false}))
    if(error){toast.error('Could not save: '+error.message);return}
    await auditLog('crypto_wallet_updated',{walletId,by:admin?.id})
    toast.success('Saved')
    load()
  }

  const toggleActive=async(w)=>{
    if(!isSuperAdmin)return
    await supabase.from('crypto_wallets').update({is_active:!w.is_active}).eq('id',w.id)
    await auditLog('crypto_wallet_'+(w.is_active?'deactivated':'activated'),{id:w.id,by:admin?.id})
    load()
  }

  // Group by network so TRC20/BEP20/etc share one address field
  // (USDT and USDC on the same network use the same wallet address)
  const byNetwork={}
  for(const w of wallets){
    if(!byNetwork[w.network]) byNetwork[w.network]=[]
    byNetwork[w.network].push(w)
  }

  const configuredCount=wallets.filter(w=>w.address).length

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:configuredCount>0?'rgba(122,158,126,0.06)':'rgba(201,106,58,0.06)',border:'1px solid '+(configuredCount>0?'rgba(122,158,126,0.15)':'rgba(201,106,58,0.15)')}}>
        <Shield size={14} style={{color:configuredCount>0?'#7A9E7E':'#C96A3A',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          {configuredCount>0
            ? configuredCount+' of '+wallets.length+' wallet addresses configured. Crypto payment is visible to users.'
            : 'No wallet addresses configured yet. The crypto payment option is hidden from users until at least one address is set.'}
        </p>
      </div>

      {Object.entries(byNetwork).map(([network,nets])=>(
        <div key={network} className="rounded-2xl p-5" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{nets[0].icon}</span>
            <p className="text-sm font-bold text-white">{network}</p>
          </div>
          <p className="text-xs mb-4" style={{color:'rgba(255,255,255,0.35)'}}>
            Used for: {nets.map(n=>n.coin).join(' & ')} · {nets[0].fee_label}
          </p>
          <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Wallet Address</label>
          <div className="flex gap-2">
            <input
              value={edits[nets[0].id]||''}
              onChange={e=>{
                const v=e.target.value
                setEdits(ed=>{
                  const next={...ed}
                  // Same address applies to all coins on this network (USDT + USDC share one wallet)
                  for(const n of nets) next[n.id]=v
                  return next
                })
              }}
              placeholder="Paste wallet address"
              disabled={!isSuperAdmin}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-mono"
              style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}
            />
            {isSuperAdmin&&(
              <button onClick={async()=>{for(const n of nets) await saveAddress(n.id)}} disabled={saving[nets[0].id]}
                className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
                style={{backgroundColor:'#D4A853',color:'#1A1210'}}>
                <Save size={12}/> {saving[nets[0].id]?'Saving…':'Save'}
              </button>
            )}
          </div>
          {isSuperAdmin&&(
            <div className="flex items-center gap-2 mt-3">
              {nets.map(n=>(
                <button key={n.id} onClick={()=>toggleActive(n)}
                  className="text-[10px] font-bold px-2 py-1 rounded-full transition-all"
                  style={{backgroundColor:n.is_active?'rgba(122,158,126,0.12)':'rgba(255,255,255,0.06)',color:n.is_active?'#7A9E7E':'rgba(255,255,255,0.4)'}}>
                  {n.coin}: {n.is_active?'Active':'Disabled'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
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
          supabase.from('professional_applications').select('*',{count:'exact',head:true}).eq('status','active'),
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
    {label:'Total Pros',value:fmtNum(data?.totalPros),icon:Briefcase,color:'#C96A3A'},
    {label:'Active Pros',value:fmtNum(data?.activePros),icon:Star,color:'#C96A3A'},
    {label:'Mortgage Apps',value:fmtNum(data?.mortgageApps),icon:Building,color:'#D4A853'},
    {label:'Escrow Txns',value:fmtNum(data?.escrowTxns),icon:Wallet,color:'#5B8DEF'},
    {label:'Total Revenue',value:fmt(data?.totalRevenue||0),icon:TrendingUp,color:'#D4A853'},
    {label:'Rental Enquiries',value:fmtNum(data?.rentalEnquiries),icon:MessageSquare,color:'#888'},
    {label:'ID Pending',value:fmtNum(data?.pendingIdentity),icon:Shield,color:'#C96A3A'},
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
        <RatioBar label="Professional Activation" rate={proRate} color="#C96A3A" subA={`${fmtNum(data?.activePros)} active`} subB={`${fmtNum((data?.totalPros||0)-(data?.activePros||0))} inactive`}/>
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
    await supabase.from('profiles').update({ role:'agent' }).eq('id', agentId)
    toast.success('Agent reinstated'); load()
  }

  const suspendAgent = async (agentId) => {
    await supabase.from('agent_scores').update({ status:'suspended', updated_at:new Date().toISOString() }).eq('agent_id', agentId)
    await supabase.from('profiles').update({ role:'suspended' }).eq('id', agentId)
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
                  {label:'Complaints', value:`${a.complaints_upheld}/${a.complaints_received}`, color:a.complaints_upheld>0?'#C96A3A':'rgba(255,255,255,0.5)'},
                  {label:'Strikes', value:`${a.strike_count}/3`, color:a.strike_count>=2?'#C94A3A':a.strike_count===1?'#C96A3A':'rgba(255,255,255,0.5)'},
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
                    backgroundColor:a.strike_count>=2?'#C94A3A':a.strike_count>=1?'#C96A3A':'#7A9E7E'
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
    else { toast.success(newStatus === 'upheld' ? 'Complaint upheld — strike issued to agent' : 'Complaint dismissed'); load() }
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
                      <p className="text-xs font-bold" style={{color:'#C96A3A'}}>{c.agent.full_name}</p>
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
  {path:'transactions',label:'Transactions', icon:CreditCard},
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
    navigate('/admin-login',{replace:true})
  }

  return(
    <div className="min-h-screen flex" style={{backgroundColor:'#120D0A',fontFamily:"'DM Sans',sans-serif"}}>
      {sidebarOpen&&<div className="fixed inset-0 z-30 lg:hidden" style={{backgroundColor:'rgba(0,0,0,0.5)'}} onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-64 transition-transform duration-300 ${sidebarOpen?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}
        style={{backgroundColor:'#1A1210',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
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
                {badge>0&&<span className="text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style={{backgroundColor:'#C96A3A',color:'#fff',fontSize:10}}>{badge>99?'99+':badge}</span>}
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
          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80" style={{backgroundColor:'rgba(201,106,58,0.1)',color:'#C96A3A'}}>
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
            <Route path="transactions"            element={<TransactionsTab/>}/>
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

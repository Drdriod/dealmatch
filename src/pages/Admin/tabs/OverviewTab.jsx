/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchCommandCentre, fetchOverviewFallback } from '@/data/adminOverviewRepository'
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

// ── OVERVIEW ───────────────────────────────────────────────────────────────────
export function OverviewTab() {
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
    const commandP = fetchCommandCentre(since) // starts now, alongside the stats call

    try {
      const d = await adminFetch('stats')
      setStats(d); setRecent(d.recentProps||[]); setRecentUsers(d.recentUsers||[])
    } catch(apiErr) {
      console.warn('Stats API failed:', apiErr.message)
      try {
        const {stats:fb, recent:rp} = await fetchOverviewFallback()
        setStats(fb)
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

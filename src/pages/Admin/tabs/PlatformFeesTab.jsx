/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchCommissions, fetchCategoriesForFees, insertCommission, setCommissionStatus } from '@/data/adminCommissionsRepository'
import { processReferralPayoutsForTransaction, AGENT_FIELD_FEE, AGENT_SENIOR_FEE } from '@/lib/referral'
import { notifyIdentityApproved, notifyIdentityRejected } from '@/lib/notifications'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { friendlyDbError } from '@/lib/dbErrors'
import { usePlatformFees, formatPlatformFee } from '@/lib/platformFees'
import { fetchFeeHistory, fetchPendingRefunds, markRefundReturned, setPlatformFee, createPlatformFee } from '@/data/monetisationRepository'
import { Sparkline, AreaChart, Donut, Panel, fmtNum as compactNum } from '@/components/charts/ChartKit'
import { SUPERADMIN_EMAILS, STAFF_ROLES, ROLE_LABELS, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS, fmt, fmtNum, ago, maskEmail, maskPhone, adminFetch, auditLog, useReauthGate, Spinner, Badge, ActionBtn, SearchBar, StatCard, ConfirmModal, ImageLightbox, FilterBar, TH, TableWrap, TR, EmptyRow, PIPELINE_STAGES, FEE_INPUT_STYLE, FEE_LABEL_STYLE, AREA_LABEL, EMPTY_NEW_FEE, NAV_ITEMS } from '../shared'

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
export function PlatformFeesTab() {
  const [items,setItems]=useState([])
  const [categories,setCategories]=useState([])
  const [loading,setLoading]=useState(true)
  const [form,setForm]=useState(null) // null = closed, {} = new schedule

  const load=async()=>{
    setLoading(true)
    const [{data:comm},cats]=await Promise.all([
      fetchCommissions(),
      // Inactive categories too: a schedule can still point at one.
      fetchCategoriesForFees(),
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
    const {error} = await insertCommission({
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
    const {error}=await setCommissionStatus(row.id,{status:'EXPIRED',expiry_date:new Date().toISOString()})
    if(error) return toast.error(error.message)
    toast.success('Expired'); load()
  }
  const archive=async(row)=>{
    const {error}=await setCommissionStatus(row.id,{status:'ARCHIVED'})
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

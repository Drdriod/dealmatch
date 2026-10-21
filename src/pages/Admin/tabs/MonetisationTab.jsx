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

export function MonetisationTab() {
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
        <p className="text-[11px] mb-3" style={{color:'rgba(255,255,255,0.4)'}}>Overpayments, short payments and payments that could not be applied to a job. Send the money back from your bank, then record the bank reference here.</p>
        {refunds.length===0&&<p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Nothing to return.</p>}
        <div className="space-y-2">
          {refunds.map(r=>(
            <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap text-xs" style={{color:'rgba(255,255,255,0.7)'}}>
              <span>
                <span className="text-white">{String(r.dedupe_key||'').startsWith('unapplied:')?'Not applied':r.reason==='overpaid'?'Overpaid':'Short payment'}</span>
                {' '}· {r.payer_email||'no email'} · {r.reference}
                {' '}· <span className="text-white">{naira(r.amount_kobo)}</span>
                {r.note&&<span className="block text-[11px]" style={{color:'rgba(255,255,255,0.4)'}}>{r.note}</span>}
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

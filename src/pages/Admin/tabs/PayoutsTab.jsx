/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import {
  fetchPayoutAccounts, fetchPayoutQueue, fetchWithdrawalRequests, fetchProfileSummaries,
  verifyPayoutAccount, rejectPayoutAccount, requeuePayout, fulfillWithdrawal, rejectWithdrawal,
} from '@/data/adminPayoutsRepository'
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

// ── PAYOUTS (item 8) ────────────────────────────────────────────────────
// Three sections in one tab: payout accounts awaiting verification (gate
// for accept_bid/request_withdrawal), the automated payout queue (so a
// failed/stuck automated payout is visible instead of silently vanishing),
// and withdrawal_requests as the manual backstop channel.
export function PayoutsTab() {
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
        const {data}=await fetchPayoutAccounts()
        rows=data||[]
      }else if(section==='queue'){
        const {data}=await fetchPayoutQueue()
        rows=data||[]
      }else{
        const {data}=await fetchWithdrawalRequests()
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
        const {data:profs}=await fetchProfileSummaries(ids)
        byId=Object.fromEntries((profs||[]).map(p=>[p.id,p]))
      }
      setItems(rows.map(r=>({...r,profiles:byId[r.profile_id]||null})))
    }catch(e){console.error(e); setItems([])}
    setLoading(false)
  },[section])

  useEffect(()=>{load()},[load])

  const verifyAccount=async(id)=>{
    const {error}=await verifyPayoutAccount(id)
    if(error) return toast.error(error.message)
    toast.success('Payout account verified'); load()
  }
  const rejectAccount=async()=>{
    if(!rejectReason.trim()) return toast.error('A reason is required')
    const {error}=await rejectPayoutAccount(rejectTarget,rejectReason.trim())
    if(error) return toast.error(error.message)
    toast.success('Payout account rejected'); setRejectTarget(null); setRejectReason(''); load()
  }
  const retryQueueRow=async(id)=>{
    // Resets the row back to 'pending' with attempts kept as-is (the cron
    // processor's own 5-attempt ceiling still applies) so the next
    // scheduled tick picks it up again - no separate retry endpoint
    // needed since the queue itself is the source of truth.
    const {error}=await requeuePayout(id)
    if(error) return toast.error(error.message)
    toast.success('Queued for retry on the next cron run'); load()
  }

  const fulfillWithdrawal=async(id)=>{
    const {error}=await fulfillWithdrawal(id)
    if(error) return toast.error(error.message)
    toast.success('Marked as paid'); load()
  }
  const rejectWithdrawal=async(id)=>{
    const {error}=await rejectWithdrawal(id)
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

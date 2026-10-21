/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchMortgageApplications, setMortgageStatus } from '@/data/adminRecordsRepository'
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

// ── MORTGAGE ───────────────────────────────────────────────────────────────────
export function MortgageTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [confirm,setConfirm]=useState(null)
  const SC={pending:'#D4A853',under_review:'#5B8DEF',approved:'#7A9E7E',rejected:'#C85F2D',disbursed:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await fetchMortgageApplications(filter)
    if(error){ console.error('[Mortgage load]', error.message); toast.error('Could not load mortgage applications. Please retry, or contact support if this keeps happening.') }
    setItems(data||[]); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,name)=>{
    const {error}=await setMortgageStatus(id,s)
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

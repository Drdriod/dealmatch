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

// ── PROFESSIONALS ──────────────────────────────────────────────────────────────
export function ProfessionalsTab() {
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

/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchStudentHostels, updateStudentHostel } from '@/data/adminRecordsRepository'
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

// ── STUDENT HOSTELS ────────────────────────────────────────────────────────────
export function StudentHostelsAdminTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('all')
  const [confirm,setConfirm]=useState(null)
  const SM={pending_review:{label:'Pending',color:'#D4A853'},active:{label:'Live',color:'#7A9E7E'},paused:{label:'Paused',color:'#888'},rejected:{label:'Rejected',color:'#C85F2D'},filled:{label:'Filled',color:'#5B8DEF'}}
  const ROOM={single:'Single',shared_2:'Shared×2',shared_4:'Shared×4',shared_6:'Shared×6',self_contain:'Self Contain',mini_flat:'Mini Flat','2_bedroom':'2 Bed'}

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await fetchStudentHostels(filter)
    if(error) toast.error('Failed')
    setItems(data||[]); setLoading(false)
  },[filter])
  useEffect(()=>{load()},[load])

  const setStatus=async(id,s,title)=>{
    const updates={status:s,updated_at:new Date().toISOString()}
    if(s==='active'){updates.verified=true;updates.verified_by=admin?.id;updates.verified_at=new Date().toISOString()}
    const {error}=await updateStudentHostel(id,updates)
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

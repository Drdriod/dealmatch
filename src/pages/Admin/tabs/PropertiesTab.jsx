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

// ── PROPERTIES ─────────────────────────────────────────────────────────────────
export function PropertiesTab() {
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

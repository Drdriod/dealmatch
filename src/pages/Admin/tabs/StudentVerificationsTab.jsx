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

// ── STUDENT VERIFICATIONS ──────────────────────────────────────────────────────
export function StudentVerificationsTab() {
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

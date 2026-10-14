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

// ── IDENTITY VERIFICATION ──────────────────────────────────────────────────────
export function IdentityTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('submitted')
  const [confirm,setConfirm]=useState(null)
  const [reject,setReject]=useState(null)
  const [reason,setReason]=useState('')
  const [lightbox,setLightbox]=useState(null)
  const DOC={nin:'NIN Slip',voters:"Voter's Card",passport:'Passport',drivers:"Driver's License"}
  const SC={submitted:'#D4A853',approved:'#7A9E7E',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    let q=supabase.from('profiles').select('id,full_name,email,phone,role,identity_photo_url,identity_selfie_url,identity_doc_type,identity_verification_status,identity_verified_at,identity_rejection_note,identity_nin_submitted_at,created_at').order('created_at',{ascending:false}).limit(200)
    if(filter==='all') q=q.in('identity_verification_status',['submitted','approved','rejected'])
    else q=q.eq('identity_verification_status',filter)
    const {data,error}=await q
    if(error){console.error('[Identity verify load]', error.message); toast.error('Could not load identity submissions. Please retry, or contact support if this keeps happening.'); setLoading(false); return}
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
    if(error){toast.error(friendlyDbError(error,'Could not approve. Please try again.'));return}
    await auditLog('identity_approved',{user_id:id,by:admin?.id})
    // Let the user know in-app (bell + email) and via a status they'll see
    // next time they load their profile/dashboard - the update above is
    // what actually flips that view, this just tells them it happened.
    notifyIdentityApproved(id)
    toast.success(`${name} - verified`); setConfirm(null); load()
  }

  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter rejection reason');return}
    const {error}=await supabase.from('profiles').update({identity_verification_status:'rejected',is_photo_verified:false,is_live_verified:false,identity_rejection_note:reason.trim(),identity_verified_by:admin?.id}).eq('id',reject.id)
    if(error){toast.error('Failed');return}
    await auditLog('identity_rejected',{user_id:reject.id,reason,by:admin?.id})
    notifyIdentityRejected(reject.id, reason.trim())
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
                    <Badge label={u.identity_nin_submitted_at?'NIN/BVN submitted':'NIN/BVN not submitted'} color={u.identity_nin_submitted_at?'#7A9E7E':'#C85F2D'}/>
                    <Badge label={ROLE_LABELS[u.role]||u.role||'N/A'} color={ROLE_COLORS[u.role]||'#888'}/>
                  </div>
                  <div className="text-xs mb-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(u.email)} · {maskPhone(u.phone)}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{ago(u.created_at)}</div>
                  <div className="text-xs mt-0.5" style={{color:u.identity_nin_submitted_at?'rgba(255,255,255,0.4)':'#C85F2D'}}>
                    {u.identity_nin_submitted_at?`NIN/BVN submitted ${ago(u.identity_nin_submitted_at)}`:'NIN/BVN not submitted yet. Approval is blocked until it is.'}
                  </div>
                  {u.identity_rejection_note&&<div className="mt-2 text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(200,95,45,0.08)',color:'#C85F2D'}}>Prev rejection: {u.identity_rejection_note}</div>}
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
                  <button disabled={!u.identity_nin_submitted_at} onClick={()=>setConfirm({title:'Approve identity?',body:`${u.full_name} will be fully verified and unlock all transactions.`,onConfirm:()=>approve(u.id,u.full_name||u.email)})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E',border:'1px solid rgba(122,158,126,0.3)'}}>
                    <Check size={13}/> Approve & Verify
                  </button>
                  <button onClick={()=>setReject({id:u.id,name:u.full_name||u.email})} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-all" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D',border:'1px solid rgba(200,95,45,0.2)'}}>
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
              <X size={22} style={{color:'#C85F2D'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Reject Identity</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Tell <strong className="text-white">{reject.name}</strong> why their ID was rejected.</p>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. Photo is blurry. Please upload a clearer image." className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none mb-4" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
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

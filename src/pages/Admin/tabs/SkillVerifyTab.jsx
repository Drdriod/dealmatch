/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import {
  fetchSkillSubmissions, fetchContactProfiles, reviewSkillSubmission, signedDocumentUrl,
} from '@/data/adminVerificationRepository'
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

// ── SKILL VERIFICATION QUEUE ─────────────────────────────────────────────────
// ADR-008's Level 2 review surface. Submissions come from
// verification_submissions (written by the provider via submit_verification()
// -- see SkillVerificationPage.jsx); approving/rejecting here calls
// review_verification_submission(), a SECURITY DEFINER RPC that is the ONLY
// path that can move verified_providers.level. This tab never writes to
// verified_providers directly, matching the "no client write" RLS policy on
// that table (see 20260812000000_production_hardening.sql).
export function SkillVerifyTab() {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('pending')
  const [lightbox,setLightbox]=useState(null)
  const [reject,setReject]=useState(null)
  const [reason,setReason]=useState('')
  const [busyId,setBusyId]=useState(null)
  const SC={pending:'#D4A853',approved:'#7A9E7E',rejected:'#C85F2D'}

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await fetchSkillSubmissions(filter)
    if(error){toast.error('Could not load submissions');setLoading(false);return}
    const userIds=[...new Set((data||[]).map(s=>s.user_id))]
    const {data:profiles}=userIds.length?await fetchContactProfiles(userIds):{data:[]}
    const enriched=await Promise.all((data||[]).map(async s=>{
      const paths=s.submission_data?.portfolio_paths||[]
      const signedUrls=await Promise.all(paths.slice(0,6).map(p=>signedDocumentUrl('provider-portfolio',p)))
      return {...s, profile:profiles?.find(p=>p.id===s.user_id), signedUrls:signedUrls.filter(Boolean)}
    }))
    setItems(enriched); setLoading(false)
  },[filter])

  useEffect(()=>{load()},[load])

  const approve=async(item)=>{
    setBusyId(item.id)
    const {error}=await reviewSkillSubmission(item.id,true,null)
    setBusyId(null)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('skill_verification_approved',{submission_id:item.id,user_id:item.user_id})
    toast.success(`${item.profile?.full_name||'Provider'} - Skill Verified`); load()
  }
  const doReject=async()=>{
    if(!reason.trim()){toast.error('Enter a reason');return}
    setBusyId(reject.id)
    const {error}=await reviewSkillSubmission(reject.id,false,reason.trim())
    setBusyId(null)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('skill_verification_rejected',{submission_id:reject.id,reason})
    toast.success('Submission rejected'); setReject(null); setReason(''); load()
  }

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Award size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.45)'}}>Portfolio-first review, per the handoff spec: photos of real work matter more than certificates. Approving moves the provider to Level 2 and they start appearing in Find a Provider search.</p>
      </div>
      <FilterBar value={filter} onChange={setFilter} options={[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['all','All']]}/>
      {loading?<Spinner/>:items.length===0?(
        <div className="text-center py-12 text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No submissions in this filter</div>
      ):(
        <div className="space-y-3">
          {items.map(s=>(
            <div key={s.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-white font-semibold text-sm">{s.profile?.full_name||'N/A'}</span>
                <Badge label={s.status} color={SC[s.status]||'#888'}/>
                {s.submission_data?.category&&<Badge label={s.submission_data.category} color="#5B8DEF"/>}
              </div>
              <div className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>{maskEmail(s.profile?.email)} · {maskPhone(s.profile?.phone)} · {ago(s.created_at)}</div>
              <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.55)'}}>{s.submission_data?.description}</p>
              {s.submission_data?.years_experience&&<div className="text-xs mb-1" style={{color:'rgba(255,255,255,0.4)'}}>{s.submission_data.years_experience} years experience</div>}
              {s.submission_data?.references&&<div className="text-xs mb-2" style={{color:'rgba(255,255,255,0.4)'}}>References: {s.submission_data.references}</div>}
              {s.signedUrls.length>0&&(
                <div className="flex gap-2 flex-wrap mb-3">
                  {s.signedUrls.map((url,i)=>(
                    <button key={i} onClick={()=>setLightbox({src:url,label:s.profile?.full_name})} className="w-16 h-16 rounded-xl overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover"/>
                    </button>
                  ))}
                </div>
              )}
              {s.status==='pending'&&(
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>setReject(s)} disabled={busyId===s.id} className="py-2.5 rounded-2xl text-xs font-bold disabled:opacity-40" style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>Reject</button>
                  <button onClick={()=>approve(s)} disabled={busyId===s.id} className="py-2.5 rounded-2xl text-xs font-bold disabled:opacity-40" style={{backgroundColor:'rgba(122,158,126,0.15)',color:'#7A9E7E'}}>{busyId===s.id?'Processing...':'Approve - Skill Verified'}</button>
                </div>
              )}
              {s.status==='rejected'&&s.admin_note&&<div className="text-xs px-3 py-2 rounded-xl" style={{backgroundColor:'rgba(200,95,45,0.08)',color:'#C85F2D'}}>Reason: {s.admin_note}</div>}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {reject&&(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.6)'}}>
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="w-full sm:max-w-sm rounded-2xl p-5" style={{backgroundColor:'#17211B'}}>
              <h3 className="text-white font-bold text-sm mb-3">Reject submission</h3>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Reason (shown to the provider)"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-3" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'#fff'}}/>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>{setReject(null);setReason('')}} className="py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={doReject} disabled={!reason.trim()} className="py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{backgroundColor:'#C85F2D',color:'#17211B'}}>Send Rejection</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {lightbox&&<ImageLightbox src={lightbox.src} label={lightbox.label} onClose={()=>setLightbox(null)}/>}
      </AnimatePresence>
    </div>
  )
}

// ── DEAL PIPELINE ─────────────────────────────────────────────────────────────
// Reads admin_deal_pipeline, the view unifying the legacy escrow world and
// the ADR-009 category-transactions world into one Enquiry -> Negotiation ->
// Paid (Escrow) -> Completed -> Commissioned/Lost pipeline (see
// 20260812000000_production_hardening.sql). Read-only -- this tab is a
// dashboard, not an editor; stage transitions still happen through their
// normal flows (payment webhooks, RPCs), not by dragging cards here.

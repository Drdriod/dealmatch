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

// ── STAFF ──────────────────────────────────────────────────────────────────────
export function StaffTab({isSuperAdmin}) {
  const {user:admin}=useAuth()
  const [staff,setStaff]=useState([])
  const [invites,setInvites]=useState([])
  const [loading,setLoading]=useState(true)
  const [showCreate,setShowCreate]=useState(false)
  const [confirm,setConfirm]=useState(null)
  const [form,setForm]=useState({email:'',fullName:'',role:'agent'})
  const [creating,setCreating]=useState(false)

  const loadStaff=async()=>{
    setLoading(true)
    const [{data:staffData},{data:inviteData}]=await Promise.all([
      supabase.from('profiles').select('id,full_name,email,role,created_at').in('role',['agent','verifier','admin']).order('created_at',{ascending:false}),
      isSuperAdmin?supabase.from('staff_invites').select('id,email,full_name,role,status,created_at,expires_at').eq('status','pending').order('created_at',{ascending:false}):Promise.resolve({data:[]}),
    ])
    setStaff(staffData||[]); setInvites(inviteData||[]); setLoading(false)
  }
  useEffect(()=>{loadStaff()},[])

  // Invite-based creation only: the superadmin never sets or sees a
  // password. Supabase emails the invite link, the invitee sets their own
  // password, and accept_staff_invite() grants exactly the role recorded
  // here - never whatever the invitee's own signup request might contain.
  const sendInvite=async()=>{
    if(!form.email||!form.fullName){toast.error('Fill in all fields');return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){toast.error('Invalid email');return}
    setCreating(true)
    try{
      await adminFetch('staff-invite',{method:'POST',body:JSON.stringify({email:form.email.trim().toLowerCase(),fullName:form.fullName.trim(),role:form.role})})
      toast.success(`Invite sent to ${form.fullName}`)
      setForm({email:'',fullName:'',role:'agent'}); setShowCreate(false); loadStaff()
    }catch(err){toast.error(err.message||'Could not send invite')}
    setCreating(false)
  }

  const revokeInvite=async(invite)=>{
    const {error}=await supabase.rpc('revoke_staff_invite',{p_invite_id:invite.id})
    if(error){toast.error(error.message||'Could not revoke invite');return}
    toast.success(`Invite to ${invite.email} revoked`); loadStaff()
  }

  const deactivate=async(id,name)=>{
    // FIX: was overwriting role to 'suspended', destroying the staff
    // member's real role (agent/verifier/admin) with no way back short of
    // a superadmin manually re-assigning it. account_status is the
    // correct place for this - role stays intact.
    const {error}=await supabase.from('profiles').update({account_status:'suspended'}).eq('id',id)
    if(error){toast.error('Failed');return}
    await auditLog('staff_deactivated',{target_id:id,by:admin?.id})
    toast.success(`${name} deactivated`); loadStaff(); setConfirm(null)
  }

  const changeRole=async(id,newRole,name)=>{
    if(newRole==='admin'&&!isSuperAdmin){toast.error('Only the superadmin can grant the admin role');return}
    const {error}=await supabase.from('profiles').update({role:newRole}).eq('id',id)
    if(error){toast.error(error.message||'Failed');return}
    await auditLog('staff_role_changed',{target_id:id,new_role:newRole,by:admin?.id})
    toast.success(`${name} -> ${ROLE_LABELS[newRole]}`); loadStaff()
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold">Staff Accounts</h3>
          <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>{isSuperAdmin?'Invite and manage all staff accounts':'Staff list - contact superadmin to add or remove'}</p>
        </div>
        {isSuperAdmin&&<button onClick={()=>setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}><Plus size={14}/> Invite Staff</button>}
      </div>
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
        <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          <strong className="text-white">Agent</strong> - on-site property verification. <strong className="text-white">Verifier</strong> - reviews and approves identity documents. <strong className="text-white">Admin</strong> - full dashboard access, grantable by the superadmin only. Deactivation revokes access immediately. Staff sign in with their own password and must complete two-factor setup before reaching this dashboard.
        </p>
      </div>
      {isSuperAdmin&&invites.length>0&&(
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'rgba(255,255,255,0.35)'}}>Pending invites</p>
          {invites.map(inv=>(
            <div key={inv.id} className="rounded-2xl px-5 py-3.5 flex items-center justify-between flex-wrap gap-3" style={{backgroundColor:'rgba(212,168,83,0.05)',border:'1px dashed rgba(212,168,83,0.25)'}}>
              <div>
                <div className="text-white font-semibold text-sm">{inv.full_name}</div>
                <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(inv.email)} - invited {ago(inv.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge label={ROLE_LABELS[inv.role]||inv.role} color={ROLE_COLORS[inv.role]||'#888'}/>
                <ActionBtn icon={UserX} color="#C85F2D" tip="Revoke invite" onClick={()=>revokeInvite(inv)}/>
              </div>
            </div>
          ))}
        </div>
      )}
      {loading?<Spinner/>:(
        <div className="space-y-2">
          {staff.map(s=>(
            <div key={s.id} className="rounded-2xl px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{backgroundColor:`${ROLE_COLORS[s.role]||'#888'}18`,color:ROLE_COLORS[s.role]||'#888'}}>
                  {(s.full_name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{s.full_name||'N/A'}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskEmail(s.email)} · {ago(s.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge label={ROLE_LABELS[s.role]||s.role} color={ROLE_COLORS[s.role]||'#888'}/>
                {isSuperAdmin&&!SUPERADMIN_EMAILS.includes(s.email)&&<>
                  <select value={s.role} onChange={e=>changeRole(s.id,e.target.value,s.full_name)} className="text-xs rounded-xl px-2 py-1.5 outline-none" style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                    {['agent','verifier','admin'].map(r=><option key={r} value={r} style={{backgroundColor:'#17211B'}}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <ActionBtn icon={UserX} color="#C85F2D" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate staff?',body:`${s.full_name}'s access will be revoked immediately.`,danger:true,onConfirm:()=>deactivate(s.id,s.full_name)})}/>
                </>}
                {SUPERADMIN_EMAILS.includes(s.email)&&<span className="text-xs px-2 py-1 rounded-lg" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}> Owner</span>}
              </div>
            </div>
          ))}
          {staff.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No staff accounts yet</div>}
        </div>
      )}
      <AnimatePresence>
        {showCreate&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-md rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:'rgba(212,168,83,0.12)'}}><UserCheck size={18} style={{color:'#D4A853'}}/></div>
                <div><h3 className="text-white font-bold">Invite Staff Member</h3><p className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>Superadmin only - they set their own password</p></div>
              </div>
              <div className="space-y-3">
                {[{label:'Full Name',key:'fullName',type:'text',placeholder:'e.g. Amaka Okonkwo'},{label:'Email Address',key:'email',type:'email',placeholder:'staff@dealmatch.com.ng'}].map(f=>(
                  <div key={f.key}>
                    <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>{f.label}</label>
                    <input value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.placeholder} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
                  </div>
                ))}
                <div>
                  <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Role</label>
                  <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                    <option value="agent" style={{backgroundColor:'#17211B'}}>Agent - verifies listings on-site</option>
                    <option value="verifier" style={{backgroundColor:'#17211B'}}>Verifier - approves identity documents</option>
                    <option value="admin" style={{backgroundColor:'#17211B'}}>Admin - full dashboard access</option>
                  </select>
                </div>
                <div className="rounded-xl p-3 flex items-start gap-2" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                  <Mail size={14} style={{color:'rgba(255,255,255,0.4)',flexShrink:0,marginTop:2}}/>
                  <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>An invite link is emailed to this address. They choose their own password and must set up two-factor authentication before their first admin session.</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={()=>{setShowCreate(false);setForm({email:'',fullName:'',role:'agent'})}} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
                <button onClick={sendInvite} disabled={creating} className="flex-1 py-3 rounded-2xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{creating?'Sending...':'Send Invite'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

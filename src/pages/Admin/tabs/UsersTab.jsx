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

// ── USERS ──────────────────────────────────────────────────────────────────────
export function UsersTab() {
  const [items,setItems]=useState([])
  const [total,setTotal]=useState(0)
  const [page,setPage]=useState(0)
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [roleFilter,setRoleFilter]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [confirm,setConfirm]=useState(null)
  const [roleTarget,setRoleTarget]=useState(null)
  const PAGE=50

  const [apiError,setApiError]=useState('')

  const load=useCallback(async(pg=0,q=search,role=roleFilter,status=statusFilter)=>{
    setLoading(true)
    setApiError('')
    try{
      // First try: API route using service role key
      const params=new URLSearchParams({page:pg,limit:PAGE})
      if(q) params.set('search',q)
      if(role) params.set('role',role)
      if(status) params.set('status',status)
      const res=await adminFetch(`users?${params}`)
      setItems(res.users||[]); setTotal(res.total||0); setPage(pg)
      setLoading(false); return
    }catch(apiErr){
      console.warn('API route failed, trying direct query:', apiErr.message)
    }
    // Second try: direct Supabase query (works if admin RLS policy is applied)
    try{
      let q2=supabase.from('profiles')
        .select('id,full_name,email,phone,role,account_status,is_photo_verified,is_live_verified,onboarding_completed,created_at,identity_verification_status,is_deactivated',{count:'exact'})
        .order('created_at',{ascending:false})
        .range(pg*PAGE, pg*PAGE+PAGE-1)
      if(q) q2=q2.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      if(role) q2=q2.eq('role',role)
      if(status) q2=q2.eq('account_status',status)
      const {data,count,error}=await q2
      if(error) throw error
      setItems(data||[]); setTotal(count||data?.length||0); setPage(pg)
    }catch(dbErr){
      console.error('Direct query also failed:', dbErr.message)
      setApiError(dbErr.message)
    }
    setLoading(false)
  },[search,roleFilter,statusFilter])

  useEffect(()=>{load(0,'','','')},[])


  const action=async(act,userId,name,role='')=>{
    try{
      await adminFetch('users',{method:'POST',body:JSON.stringify({action:act,userId,role})})
      const msgs={suspend:`${name} suspended`,unsuspend:`${name} unsuspended`,deactivate:`${name} deactivated`,set_role:`Role -> ${ROLE_LABELS[role]||role}`}
      toast.success(msgs[act]||'Done')
      setConfirm(null); setRoleTarget(null); load(page)
    }catch(e){toast.error(e.message)}
  }

  const IDC={approved:'#7A9E7E',submitted:'#D4A853',rejected:'#C85F2D'}

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchBar value={search} onChange={v=>{setSearch(v);load(0,v,roleFilter,statusFilter)}} onSearch={v=>load(0,v,roleFilter,statusFilter)} placeholder="Search name or email…"/>
        {/* Role is staff-only now (Admin/Agent/Verifier) - a regular
            member simply has no role value. Status (active/suspended/
            deleted) is its own filter, completely separate from role. */}
        <select value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);load(0,search,e.target.value,statusFilter)}}
          className="px-3 py-2.5 rounded-xl text-xs outline-none font-semibold"
          style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:roleFilter?'#D4A853':'rgba(255,255,255,0.5)',minWidth:120}}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k} style={{backgroundColor:'#17211B'}}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);load(0,search,roleFilter,e.target.value)}}
          className="px-3 py-2.5 rounded-xl text-xs outline-none font-semibold"
          style={{backgroundColor:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:statusFilter?'#D4A853':'rgba(255,255,255,0.5)',minWidth:120}}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k} style={{backgroundColor:'#17211B'}}>{v}</option>)}
        </select>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{total} user{total!==1?'s':''} total</div>
      {apiError&&(
        <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(200,95,45,0.08)',border:'1px solid rgba(200,95,45,0.2)'}}>
          <p className="text-xs font-bold mb-1" style={{color:'#C85F2D'}}>Could not load users from database</p>
          <p className="text-xs mb-2" style={{color:'rgba(255,255,255,0.5)'}}>Error: {apiError}</p>
          <p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>Fix: Run the SQL below in Supabase SQL Editor, then refresh this page.</p>
          <pre className="text-xs mt-2 p-3 rounded-xl overflow-x-auto" style={{backgroundColor:'rgba(0,0,0,0.3)',color:'#7A9E7E',fontFamily:'monospace'}}>
{`DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.id = auth.uid()
    AND p2.role IN ('admin','agent','verifier')
  )
);`}
          </pre>
        </div>
      )}
      {loading?<Spinner/>:(
        <>
          <TableWrap cols={['User','Contact','Role','Status','ID Status','Joined','Actions']}>
            {items.map(u=>(
              <TR key={u.id}>
                <td className="px-4 py-3" style={{opacity:u.is_deactivated?0.45:1}}>
                  <div className="font-semibold text-white text-sm">{u.full_name||'N/A'}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{u.onboarding_completed ? 'Yes' : 'No'}{u.is_deactivated?' Deactivated':''}</div>
                </td>
                <td className="px-4 py-3"><div className="text-white text-xs">{maskEmail(u.email)}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskPhone(u.phone)}</div></td>
                <td className="px-4 py-3"><Badge label={ROLE_LABELS[u.role]||u.role||'Member'} color={ROLE_COLORS[u.role]||'#888'}/></td>
                <td className="px-4 py-3"><Badge label={STATUS_LABELS[u.account_status]||'Active'} color={STATUS_COLORS[u.account_status]||STATUS_COLORS.active}/></td>
                <td className="px-4 py-3">
                  {u.identity_verification_status==='approved'&&<Badge label="Verified" color="#7A9E7E"/>}
                  {u.identity_verification_status==='submitted'&&<Badge label="Pending" color="#D4A853"/>}
                  {u.identity_verification_status==='rejected'&&<Badge label="Rejected" color="#C85F2D"/>}
                  {(!u.identity_verification_status||u.identity_verification_status==='unverified')&&<span className="text-xs" style={{color:'rgba(255,255,255,0.2)'}}>None</span>}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <ActionBtn icon={UserCog} color="#D4A853" tip="Change role" onClick={()=>setRoleTarget({id:u.id,current:u.role,name:u.full_name||u.email})}/>
                    {u.account_status!=='suspended'&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Ban} color="#C85F2D" tip="Suspend" onClick={()=>setConfirm({title:'Suspend user?',body:`${u.full_name||'User'} will lose access immediately. Their role is not affected and is restored automatically on unsuspend.`,danger:true,onConfirm:()=>action('suspend',u.id,u.full_name||u.email)})}/>}
                    {u.account_status==='suspended'&&<ActionBtn icon={Play} color="#7A9E7E" tip="Unsuspend" onClick={()=>action('unsuspend',u.id,u.full_name||u.email)}/>}
                    {!u.is_deactivated&&!SUPERADMIN_EMAILS.includes(u.email)&&<ActionBtn icon={Trash2} color="#888" tip="Deactivate" onClick={()=>setConfirm({title:'Deactivate account?',body:`${u.full_name||'User'}'s account will be permanently deactivated.`,danger:true,onConfirm:()=>action('deactivate',u.id,u.full_name||u.email)})}/>}
                  </div>
                </td>
              </TR>
            ))}
            {items.length===0&&<EmptyRow cols={7} msg="No users found"/>}
          </TableWrap>
          {total>PAGE&&(
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{page*PAGE+1} to {Math.min((page+1)*PAGE,total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={()=>load(page-1)} disabled={page===0} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Prev</button>
                <button onClick={()=>load(page+1)} disabled={(page+1)*PAGE>=total} className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
      <AnimatePresence>
        {roleTarget&&(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{backgroundColor:'rgba(0,0,0,0.8)',backdropFilter:'blur(6px)'}}>
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}} className="w-full max-w-sm rounded-3xl p-6" style={{backgroundColor:'#1E1510',border:'1px solid rgba(255,255,255,0.08)'}}>
              <UserCog size={22} style={{color:'#D4A853'}} className="mb-3"/>
              <h3 className="text-white font-bold text-lg mb-1">Assign Role</h3>
              <p className="text-sm mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Changing role for <strong className="text-white">{roleTarget.name}</strong></p>
              {/* Full role list, matching original admin capability - an
                  admin can reassign a persona (buyer/landlord/etc.) or
                  grant a staff role from the same modal. Only 'suspended'
                  is gone from here for good; that's a Status action now,
                  not a role. */}
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {Object.entries(ROLE_LABELS).map(([r,l])=>(
                  <button key={r} onClick={()=>action('set_role',roleTarget.id,roleTarget.name,r)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                    style={{backgroundColor:roleTarget.current===r?`${ROLE_COLORS[r]||'#888888'}18`:'rgba(255,255,255,0.04)',border:`1px solid ${roleTarget.current===r?(ROLE_COLORS[r]||'#888')+'44':'rgba(255,255,255,0.06)'}`}}>
                    <span className="text-sm font-semibold text-white">{l}</span>
                    {roleTarget.current===r&&<Check size={14} style={{color:ROLE_COLORS[r]||'#D4A853'}}/>}
                  </button>
                ))}
              </div>
              <button onClick={()=>setRoleTarget(null)} className="w-full py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchAnnouncements, insertAnnouncement } from '@/data/adminRecordsRepository'
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

// ── ANNOUNCEMENTS ──────────────────────────────────────────────────────────────
export function AnnouncementsTab() {
  const {user:admin}=useAuth()
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [showForm,setShowForm]=useState(false)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({title:'',body:'',type:'info',target:'all'})
  const TC={info:'#5B8DEF',warning:'#D4A853',success:'#7A9E7E',critical:'#C85F2D'}

  const load=async()=>{
    setLoading(true)
    const {data}=await fetchAnnouncements()
    setItems(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])

  const publish=async()=>{
    if(!form.title.trim()||!form.body.trim()){toast.error('Fill in title and message');return}
    setSaving(true)
    const {error}=await insertAnnouncement({title:form.title.trim(),body:form.body.trim(),type:form.type,target:form.target,adminId:admin?.id})
    if(error){
      if(error.code==='42P01') toast.error('Run sections 11–13 of run-once-live-db.sql in Supabase first')
      else toast.error('Failed: '+error.message)
      setSaving(false); return
    }
    await auditLog('announcement_published',{title:form.title,by:admin?.id})
    toast.success('Announcement published')
    setForm({title:'',body:'',type:'info',target:'all'}); setShowForm(false); load(); setSaving(false)
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-white font-bold">Announcements</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Platform-wide notices shown to users</p></div>
        <button onClick={()=>setShowForm(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}><Plus size={14}/> New</button>
      </div>
      {showForm&&(
        <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} className="rounded-2xl p-5 space-y-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Title</label>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Scheduled maintenance Saturday" className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
          </div>
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Message</label>
            <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={3} placeholder="Write your announcement here…" className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                <option value="info" style={{backgroundColor:'#17211B'}}>ℹ️ Info</option>
                <option value="warning" style={{backgroundColor:'#17211B'}}>Warning</option>
                <option value="success" style={{backgroundColor:'#17211B'}}>Success</option>
                <option value="critical" style={{backgroundColor:'#17211B'}}>Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{color:'rgba(255,255,255,0.5)'}}>Target</label>
              <select value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff'}}>
                {[['all','All Users'],['buyer','Buyers'],['seller','Sellers'],['landlord','Landlords'],['professional','Professionals'],['student','Students']].map(([k,l])=>(
                  <option key={k} value={k} style={{backgroundColor:'#17211B'}}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={()=>setShowForm(false)} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}>Cancel</button>
            <button onClick={publish} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-all" style={{backgroundColor:'#D4A853',color:'#17211B'}}>{saving?'Publishing…':'Publish Now'}</button>
          </div>
        </motion.div>
      )}
      {loading?<Spinner/>:(
        <div className="space-y-2">
          {items.map(a=>(
            <div key={a.id} className="rounded-2xl px-5 py-4 flex items-start gap-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:`${TC[a.type]||'#888'}15`}}>
                <Bell size={14} style={{color:TC[a.type]||'#888'}}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-white font-semibold text-sm">{a.title}</span>
                  <Badge label={a.type||'info'} color={TC[a.type]||'#888'}/>
                  <Badge label={a.target||'all'} color="#888"/>
                </div>
                <p className="text-xs mb-1" style={{color:'rgba(255,255,255,0.5)'}}>{a.body}</p>
                <p className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}>{ago(a.created_at)}</p>
              </div>
            </div>
          ))}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No announcements yet. Create one above.</div>}
        </div>
      )}
    </div>
  )
}

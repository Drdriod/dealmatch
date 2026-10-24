/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '@/lib/supabase'
import { fetchSidebarBadgeCounts } from '@/data/adminOverviewRepository'
import { processReferralPayoutsForTransaction, AGENT_FIELD_FEE, AGENT_SENIOR_FEE } from '@/lib/referral'
import { notifyIdentityApproved, notifyIdentityRejected } from '@/lib/notifications'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import { friendlyDbError } from '@/lib/dbErrors'
import { usePlatformFees, formatPlatformFee } from '@/lib/platformFees'
import { listCategories } from '@/modules/catalog/catalogService'
import { fetchFeeHistory, fetchPendingRefunds, markRefundReturned, setPlatformFee, createPlatformFee } from '@/data/monetisationRepository'
import { Sparkline, AreaChart, Donut, Panel, fmtNum as compactNum } from '@/components/charts/ChartKit'
import { SUPERADMIN_EMAILS, STAFF_ROLES, ROLE_LABELS, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS, fmt, fmtNum, ago, maskEmail, maskPhone, adminFetch, auditLog, useReauthGate, Spinner, Badge, ActionBtn, SearchBar, StatCard, ConfirmModal, ImageLightbox, FilterBar, TH, TableWrap, TR, EmptyRow, PIPELINE_STAGES, FEE_INPUT_STYLE, FEE_LABEL_STYLE, AREA_LABEL, EMPTY_NEW_FEE, NAV_ITEMS } from './shared'
import { OverviewTab } from './tabs/OverviewTab'
import { PropertiesTab } from './tabs/PropertiesTab'
import { UsersTab } from './tabs/UsersTab'
import { IdentityTab } from './tabs/IdentityTab'
import { SkillVerifyTab } from './tabs/SkillVerifyTab'
import { PipelineTab } from './tabs/PipelineTab'
import { TransactionsTab } from './tabs/TransactionsTab'
import { PayoutsTab } from './tabs/PayoutsTab'
import { PlatformFeesTab } from './tabs/PlatformFeesTab'
import { MonetisationTab } from './tabs/MonetisationTab'
import { ProfessionalsTab } from './tabs/ProfessionalsTab'
import { MortgageTab } from './tabs/MortgageTab'
import { EnquiriesTab } from './tabs/EnquiriesTab'
import { StudentHostelsAdminTab } from './tabs/StudentHostelsAdminTab'
import { StudentVerificationsTab } from './tabs/StudentVerificationsTab'
import { AnnouncementsTab } from './tabs/AnnouncementsTab'
import { TestimonialsTab } from './tabs/TestimonialsTab'
import { StaffTab } from './tabs/StaffTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { AgentScoresTab } from './tabs/AgentScoresTab'
import { ComplaintsTab } from './tabs/ComplaintsTab'
import { DisputesTab } from './tabs/DisputesTab'
import { SettingsTab } from './tabs/SettingsTab'

export default function AdminPage() {
  const {user,profile}=useAuth()
  const navigate=useNavigate()
  const location=useLocation()
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [badges,setBadges]=useState({})

  const isSuperAdmin=SUPERADMIN_EMAILS.includes(user?.email)
  const adminName=profile?.full_name||user?.email?.split('@')[0]||'Admin'
  const activeTab=location.pathname.replace('/admin','').replace(/^\//,'')

  useEffect(()=>{
    const loadBadges=async()=>{
      try{
        setBadges(await fetchSidebarBadgeCounts())
      }catch{}
    }
    loadBadges()
  },[location.pathname])

  const handleSignOut=async()=>{
    await supabase.auth.signOut()
    navigate('/staff-gate-7f3k',{replace:true})
  }

  return(
    <div className="min-h-screen flex" style={{backgroundColor:'#120D0A',fontFamily:"'DM Sans',sans-serif"}}>
      {sidebarOpen&&<div className="fixed inset-0 z-30 lg:hidden" style={{backgroundColor:'rgba(0,0,0,0.5)'}} onClick={()=>setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-64 transition-transform duration-300 ${sidebarOpen?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}
        style={{backgroundColor:'#17211B',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="px-5 py-4 flex items-center gap-2.5" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{backgroundColor:'rgba(212,168,83,0.15)'}}><Shield size={16} style={{color:'#D4A853'}}/></div>
          <div><div className="font-black text-white text-sm leading-tight">DealMatch</div><div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>Control Panel</div></div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item=>{
            const isActive=activeTab===(item.path||'')
            const badge=badges[item.path]||0
            return(
              <NavLink key={item.path} to={`/admin${item.path?'/'+item.path:''}`} onClick={()=>setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{backgroundColor:isActive?'rgba(212,168,83,0.12)':'transparent',color:isActive?'#D4A853':'rgba(255,255,255,0.45)'}}>
                <item.icon size={16} style={{flexShrink:0}}/>
                <span className="flex-1">{item.label}</span>
                {badge>0&&<span className="text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center" style={{backgroundColor:'#C85F2D',color:'#fff',fontSize:10}}>{badge>99?'99+':badge}</span>}
              </NavLink>
            )
          })}
        </nav>
        <div className="px-4 py-4" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs" style={{backgroundColor:isSuperAdmin?'rgba(212,168,83,0.2)':'rgba(255,255,255,0.08)',color:isSuperAdmin?'#D4A853':'rgba(255,255,255,0.6)'}}>
              {adminName[0]?.toUpperCase()||'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{adminName}</div>
              <div className="text-xs truncate" style={{color:'rgba(255,255,255,0.3)'}}>{isSuperAdmin?' Superadmin':ROLE_LABELS[profile?.role]||'Staff'}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D'}}>
            <LogOut size={13}/> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-20 flex items-center gap-4 px-5 py-3" style={{backgroundColor:'rgba(18,13,10,0.95)',borderBottom:'1px solid rgba(255,255,255,0.06)',backdropFilter:'blur(8px)'}}>
          <button onClick={()=>setSidebarOpen(v=>!v)} className="lg:hidden p-2 rounded-xl hover:bg-white/5 transition-all" style={{color:'rgba(255,255,255,0.5)'}}><Menu size={20}/></button>
          <h1 className="text-white font-bold text-base flex-1">{NAV_ITEMS.find(n=>n.path===activeTab)?.label||'Overview'}</h1>
          {isSuperAdmin&&<span className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}> Superadmin</span>}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <Routes>
            <Route index                          element={<OverviewTab/>}/>
            <Route path="properties"              element={<PropertiesTab/>}/>
            <Route path="users"                   element={<UsersTab/>}/>
            <Route path="identity"                element={<IdentityTab/>}/>
            <Route path="skill-verify"            element={<SkillVerifyTab/>}/>
            <Route path="pipeline"                element={<PipelineTab/>}/>
            <Route path="transactions"            element={<TransactionsTab/>}/>
            <Route path="payouts"                 element={<PayoutsTab/>}/>
            <Route path="monetisation"            element={<MonetisationTab/>}/>
            <Route path="fees"                    element={<PlatformFeesTab/>}/>
            <Route path="mortgage"                element={<MortgageTab/>}/>
            <Route path="enquiries"               element={<EnquiriesTab/>}/>
            <Route path="professionals"           element={<ProfessionalsTab/>}/>
            <Route path="hostels"                 element={<StudentHostelsAdminTab/>}/>
            <Route path="student-verifications"   element={<StudentVerificationsTab/>}/>
            <Route path="announcements"           element={<AnnouncementsTab/>}/>
            <Route path="testimonials"            element={<TestimonialsTab/>}/>
            <Route path="staff"                   element={<StaffTab isSuperAdmin={isSuperAdmin}/>}/>
            <Route path="settings"                element={<SettingsTab isSuperAdmin={isSuperAdmin}/>}/>
            <Route path="disputes"                element={<DisputesTab isAdmin userId={user?.id}/>}/>
            <Route path="analytics"               element={<AnalyticsTab/>}/>
          </Routes>
        </div>
      </main>
    </div>
  )
}

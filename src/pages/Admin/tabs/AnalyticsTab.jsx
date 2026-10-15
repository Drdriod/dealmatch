/**
 * DealMatch Admin Dashboard - Full Production Version
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertOctagon, AlertTriangle, Award, Ban, BarChart2, Bell, BookOpen, Briefcase, Building, Check, CheckCircle, ChevronRight, Clock, CreditCard, ExternalLink, Eye, EyeOff, FileText, Gavel, GitBranch, GraduationCap, Home, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Pause, Percent, Play, Plus, Quote, RefreshCw, Save, Search, Settings, Shield, ShieldAlert, Star, ThumbsDown, ThumbsUp, Trash2, TrendingDown, TrendingUp, User, UserCheck, UserCog, UserX, Users, Wallet, X, XCircle as XCircleIcon, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { fetchAnalyticsFallback } from '@/data/adminOverviewRepository'
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

// ── ANALYTICS ──────────────────────────────────────────────────────────────────
export function AnalyticsTab() {
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const d=await adminFetch('stats'); setData(d)
    }catch{
      try{
        setData(await fetchAnalyticsFallback())
      }catch(e){console.error(e)}
    }
    setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  if(loading) return <Spinner/>

  const listingRate=data?.totalProps>0?Math.round((data.activeListings/data.totalProps)*100):0
  const proRate=data?.totalPros>0?Math.round((data.activePros/data.totalPros)*100):0

  const metrics=[
    {label:'Total Users',value:fmtNum(data?.totalUsers),icon:Users,color:'#5B8DEF'},
    {label:'All Properties',value:fmtNum(data?.totalProps),icon:Home,color:'#7A9E7E'},
    {label:'Live Properties',value:fmtNum(data?.activeListings),icon:CheckCircle,color:'#7A9E7E'},
    {label:'Pending Review',value:fmtNum(data?.pendingListings),icon:Clock,color:'#D4A853'},
    {label:'Total Pros',value:fmtNum(data?.totalPros),icon:Briefcase,color:'#C85F2D'},
    {label:'Active Pros',value:fmtNum(data?.activePros),icon:Star,color:'#C85F2D'},
    {label:'Mortgage Apps',value:fmtNum(data?.mortgageApps),icon:Building,color:'#D4A853'},
    {label:'Escrow Txns',value:fmtNum(data?.escrowTxns),icon:Wallet,color:'#5B8DEF'},
    {label:'Total Revenue',value:fmt(data?.totalRevenue||0),icon:TrendingUp,color:'#D4A853'},
    {label:'Rental Enquiries',value:fmtNum(data?.rentalEnquiries),icon:MessageSquare,color:'#888'},
    {label:'ID Pending',value:fmtNum(data?.pendingIdentity),icon:Shield,color:'#C85F2D'},
    {label:'Student Pending',value:fmtNum(data?.studentVerifs||0),icon:GraduationCap,color:'#5B8DEF'},
  ]

  const RatioBar=({label,rate,color,subA,subB})=>(
    <div className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xl font-black" style={{color}}>{rate}%</span>
      </div>
      <div className="w-full h-2 rounded-full mb-2" style={{backgroundColor:'rgba(255,255,255,0.08)'}}>
        <div className="h-full rounded-full transition-all" style={{width:`${rate}%`,backgroundColor:color}}/>
      </div>
      <div className="flex justify-between text-xs" style={{color:'rgba(255,255,255,0.35)'}}>
        <span>{subA}</span><span>{subB}</span>
      </div>
    </div>
  )

  return(
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">Platform Analytics</h3>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}><RefreshCw size={12}/> Refresh</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(m=><StatCard key={m.label} icon={m.icon} label={m.label} value={m.value} color={m.color}/>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RatioBar label="Listing Approval Rate" rate={listingRate} color="#7A9E7E" subA={`${fmtNum(data?.activeListings)} live`} subB={`${fmtNum(data?.pendingListings)} pending`}/>
        <RatioBar label="Professional Activation" rate={proRate} color="#C85F2D" subA={`${fmtNum(data?.activePros)} active`} subB={`${fmtNum((data?.totalPros||0)-(data?.activePros||0))} inactive`}/>
      </div>
    </div>
  )
}

// ── NAV + MAIN SHELL ───────────────────────────────────────────────────────────

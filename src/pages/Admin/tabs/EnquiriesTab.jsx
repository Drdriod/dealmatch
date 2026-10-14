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

// ── ENQUIRIES ──────────────────────────────────────────────────────────────────
export function EnquiriesTab() {
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')

  const load=async()=>{
    setLoading(true)
    const {data}=await supabase.from('rental_enquiries').select('*,properties(title,state,city,listing_type)').order('created_at',{ascending:false}).limit(200)
    setItems(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])

  const filtered=items.filter(i=>!search||i.tenant_name?.toLowerCase().includes(search.toLowerCase())||i.properties?.title?.toLowerCase().includes(search.toLowerCase()))

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Rental Enquiries</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Tenant interest submissions sent to landlords</p></div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-70 transition-all" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}><RefreshCw size={12}/> Refresh</button>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search tenant or property…"/>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} enquir{filtered.length!==1?'ies':'y'}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={['Tenant','Property','Type','Move-in','Duration','Message','Date']}>
          {filtered.map(e=>(
            <TR key={e.id}>
              <td className="px-4 py-3"><div className="text-white text-sm font-semibold">{e.tenant_name||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{maskPhone(e.tenant_phone)}</div></td>
              <td className="px-4 py-3"><div className="text-white text-xs truncate max-w-[150px]">{e.properties?.title||'N/A'}</div><div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{e.properties?.city}, {e.properties?.state}</div></td>
              <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.5)'}}>{(e.properties?.listing_type||'rental').replace(/_/g,' ')}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.6)'}}>{e.move_in_date||'N/A'}</td>
              <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{e.duration||'N/A'}</td>
              <td className="px-4 py-3 text-xs max-w-[160px] truncate" style={{color:'rgba(255,255,255,0.5)'}}>{e.message||'N/A'}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(e.created_at)}</td>
            </TR>
          ))}
          {filtered.length===0&&<EmptyRow cols={7} msg="No enquiries yet"/>}
        </TableWrap>
      )}
    </div>
  )
}

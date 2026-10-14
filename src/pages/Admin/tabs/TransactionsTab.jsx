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

// ── TRANSACTIONS ───────────────────────────────────────────────────────────────
export function TransactionsTab() {
  const [tab,setTab]=useState('payments')
  const [items,setItems]=useState([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const SC={success:'#7A9E7E',paid:'#7A9E7E',confirmed:'#7A9E7E',released:'#7A9E7E',pending:'#D4A853',funded:'#5B8DEF',failed:'#C85F2D',rejected:'#C85F2D',disputed:'#C85F2D',refunded:'#888'}

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      if(tab==='payments'){const{data}=await supabase.from('payments').select('id,reference,amount,payment_type,email,status,created_at').order('created_at',{ascending:false}).limit(200);setItems(data||[])}
      else if(tab==='escrow'){
        // ✅ SCHEMA FIX (Aug 2026 hardening pass): was selecting amount/
        // platform_fee, which don't exist on escrow_transactions (the real
        // columns are gross_amount/platform_amount) -- aliased back to
        // amount/platform_fee here so the rest of this component (the
        // `total` calc and the render below) doesn't need to change. Also
        // disambiguates the profiles embed: escrow_transactions has FOUR
        // FKs to profiles (buyer/seller/agent/referrer), so a bare
        // `profiles(full_name)` is ambiguous and PostgREST rejects it --
        // pinned to seller_id (the landlord/seller, most relevant party
        // for an admin transactions list).
        const{data}=await supabase.from('escrow_transactions').select('id,amount:gross_amount,platform_fee:platform_amount,status,payment_ref,created_at,properties(title),profiles:profiles!escrow_transactions_seller_id_fkey(full_name)').order('created_at',{ascending:false}).limit(200);setItems(data||[])
      }
    }catch(e){console.error(e)}
    setLoading(false)
  },[tab])
  useEffect(()=>{load()},[load])

  const filtered=items.filter(i=>!search||i.reference?.toLowerCase().includes(search.toLowerCase())||i.email?.toLowerCase().includes(search.toLowerCase())||i.description?.toLowerCase().includes(search.toLowerCase())||i.user_name?.toLowerCase().includes(search.toLowerCase())||i.properties?.title?.toLowerCase().includes(search.toLowerCase()))
  const total=items.reduce((s,i)=>s+(i.amount||0),0)

  return(
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2">
          {[['payments','Flutterwave'],['escrow','Escrow']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className="px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{backgroundColor:tab===k?'#D4A853':'rgba(255,255,255,0.06)',color:tab===k?'#17211B':'rgba(255,255,255,0.5)'}}>{l}</button>
          ))}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search reference, email…"/>
      </div>
      <div className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>{filtered.length} records · Total: {fmt(total)}</div>
      {loading?<Spinner/>:(
        <TableWrap cols={tab==='payments'?['Reference','Amount','Type','Email','Status','Date']:['Property','User','Amount','Fee','Status','Date']}>
          {filtered.map(item=>(
            <TR key={item.id}>
              {tab==='payments'&&<>
                <td className="px-4 py-3 font-mono text-xs text-white">{(item.reference||'N/A').slice(0,16)}…</td>
                <td className="px-4 py-3 font-semibold text-white">{fmt(item.amount||0)}</td>
                <td className="px-4 py-3 text-xs capitalize" style={{color:'rgba(255,255,255,0.5)'}}>{(item.payment_type||'N/A').replace(/_/g,' ')}</td>
                <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{maskEmail(item.email)}</td>
                <td className="px-4 py-3"><Badge label={item.status||'N/A'} color={SC[item.status]||'#888'}/></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</td>
              </>}
              {tab==='escrow'&&<>
                <td className="px-4 py-3 text-white text-xs truncate max-w-[140px]">{item.properties?.title||'N/A'}</td>
                <td className="px-4 py-3 text-white text-xs">{item.profiles?.full_name||'N/A'}</td>
                <td className="px-4 py-3 font-semibold text-white">{fmt(item.amount||0)}</td>
                <td className="px-4 py-3 text-xs" style={{color:'rgba(255,255,255,0.5)'}}>{fmt(item.platform_fee||0)}</td>
                <td className="px-4 py-3"><Badge label={item.status||'N/A'} color={SC[item.status]||'#888'}/></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</td>
              </>}
            </TR>
          ))}
          {filtered.length===0&&<EmptyRow cols={6} msg="No transactions found"/>}
        </TableWrap>
      )}
    </div>
  )
}

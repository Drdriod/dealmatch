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

// ── TESTIMONIALS ──────────────────────────────────────────────────────────────
export function TestimonialsTab() {
  const [items,setItems]=useState([])
  const [statusFilter,setStatusFilter]=useState('pending')
  const [loading,setLoading]=useState(true)
  const [actingOn,setActingOn]=useState(null)

  const load=async()=>{
    setLoading(true)
    try {
      const { testimonials } = await adminFetch(`testimonials?status=${statusFilter}`)
      setItems(testimonials||[])
    } catch(err) {
      toast.error('Failed to load: '+err.message)
    }
    setLoading(false)
  }
  useEffect(()=>{load()},[statusFilter])

  const act=async(id,action)=>{
    setActingOn(id)
    try {
      await adminFetch('testimonials',{method:'POST',body:JSON.stringify({id,action})})
      toast.success(action==='approve'?'Testimonial approved - now live':'Testimonial rejected')
      setItems(prev=>prev.filter(t=>t.id!==id))
    } catch(err) {
      toast.error('Failed: '+err.message)
    }
    setActingOn(null)
  }

  return(
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Testimonials</h3><p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>Review user-submitted stories before they go live on the homepage</p></div>
        <div className="flex gap-2">
          {['pending','approved','rejected'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold capitalize"
              style={{backgroundColor:statusFilter===s?'#D4A853':'rgba(255,255,255,0.06)',color:statusFilter===s?'#17211B':'rgba(255,255,255,0.5)'}}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {loading?<Spinner/>:(
        <div className="space-y-3">
          {items.map(t=>(
            <div key={t.id} className="rounded-2xl p-5" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white font-semibold text-sm">{t.name}</span>
                {t.role_label && <span className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>· {t.role_label}</span>}
                <span className="flex items-center gap-0.5 ml-auto">
                  {[1,2,3,4,5].map(n=>(
                    <Star key={n} size={12} fill={n<=t.rating?'#D4A853':'transparent'} style={{color:'#D4A853'}}/>
                  ))}
                </span>
              </div>
              <p className="text-sm mb-3" style={{color:'rgba(255,255,255,0.7)'}}>"{t.content}"</p>
              <p className="text-xs mb-3" style={{color:'rgba(255,255,255,0.25)'}}>{ago(t.created_at)}</p>
              {statusFilter==='pending' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>act(t.id,'reject')} disabled={actingOn===t.id}
                    className="py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>
                    <ThumbsDown size={12} className="inline mr-1"/> Reject
                  </button>
                  <button onClick={()=>act(t.id,'approve')} disabled={actingOn===t.id}
                    className="py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{backgroundColor:'rgba(122,158,126,0.12)',color:'#7A9E7E'}}>
                    <ThumbsUp size={12} className="inline mr-1"/> Approve
                  </button>
                </div>
              )}
            </div>
          ))}
          {items.length===0&&<div className="py-12 text-center text-sm" style={{color:'rgba(255,255,255,0.3)'}}>No {statusFilter} testimonials.</div>}
        </div>
      )}
    </div>
  )
}

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

export function PipelineTab() {
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [source,setSource]=useState('all')
  const [cancellingId,setCancellingId]=useState(null)
  const [payingOutId,setPayingOutId]=useState(null)

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('admin_deal_pipeline').select('*').order('created_at',{ascending:false}).limit(300)
    if(error){toast.error('Could not load pipeline');setLoading(false);return}
    setRows(data||[]); setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  // Only 'category' deals map 1:1 onto public.transactions.id, which is
  // what cancel_transaction() operates on - 'legacy' real-estate deals are
  // backed by escrow_transactions and need their own equivalent, so the
  // button only appears where it can actually do something.
  const cancelDeal = async (item) => {
    if (!window.confirm(`Cancel "${item.listing_title||'this job'}"? This cannot be undone.`)) return
    setCancellingId(item.deal_id)
    const { error } = await supabase.rpc('cancel_transaction', {
      p_transaction_id: Number(item.deal_id),
      p_reason: 'Cancelled by admin via Pipeline',
    })
    setCancellingId(null)
    if (error) { toast.error(error.message || 'Could not cancel this deal'); return }
    toast.success('Deal cancelled')
    load()
  }

  // Only appears on completed category deals, and only once - the RPC
  // itself also refuses a second run for the same transaction, this just
  // avoids a wasted round-trip and a confusing duplicate-error toast.
  const payoutReferrals = async (item) => {
    if (!window.confirm(`Process referral payouts for "${item.listing_title||'this job'}"? This cannot be undone.`)) return
    setPayingOutId(item.deal_id)
    const result = await processReferralPayoutsForTransaction(Number(item.deal_id))
    setPayingOutId(null)
    if (!result.success) { toast.error(result.error || 'Could not process referral payouts'); return }
    toast.success(result.payoutsMade > 0 ? `${result.payoutsMade} referral payout(s) credited` : 'No referrers in this chain - nothing to pay out')
    load()
  }

  const filtered = source==='all' ? rows : rows.filter(r=>r.source===source)
  const byStage = PIPELINE_STAGES.map(stage=>({
    ...stage,
    items: filtered.filter(r=>r.pipeline_stage===stage.id),
  }))
  const totalValue = filtered.filter(r=>r.pipeline_stage==='completed').reduce((s,r)=>s+Number(r.amount||0),0)
  const commissioned = filtered.filter(r=>r.commissioned).length

  return(
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Total deals</p>
          <p className="text-white font-bold text-lg">{filtered.length}</p>
        </div>
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Completed value</p>
          <p className="text-white font-bold text-lg">₦{totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <p className="text-[10px] font-semibold mb-1" style={{color:'rgba(255,255,255,0.4)'}}>Commissioned</p>
          <p className="text-white font-bold text-lg">{commissioned}</p>
        </div>
      </div>
      <FilterBar value={source} onChange={setSource} options={[['all','All'],['legacy','Real Estate'],['category','Categories']]}/>
      {loading?<Spinner/>:(
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {byStage.map(stage=>(
            <div key={stage.id} className="rounded-2xl p-3" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold" style={{color:stage.color}}>{stage.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{backgroundColor:stage.color+'22',color:stage.color}}>{stage.items.length}</span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {stage.items.slice(0,30).map(item=>{
                  const canCancel = item.source==='category' && (stage.id==='enquiry'||stage.id==='negotiation')
                  const canPayoutReferrals = item.source==='category' && stage.id==='completed'
                  return (
                  <div key={item.source+item.deal_id} className="rounded-xl p-2.5" style={{backgroundColor:'rgba(255,255,255,0.04)'}}>
                    <p className="text-xs font-semibold text-white truncate">{item.listing_title||'Untitled'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px]" style={{color:'rgba(255,255,255,0.35)'}}>{ago(item.created_at)}</span>
                      {item.amount>0&&<span className="text-[10px] font-bold" style={{color:'rgba(255,255,255,0.6)'}}>₦{Number(item.amount).toLocaleString()}</span>}
                    </div>
                    {canCancel && (
                      <button onClick={()=>cancelDeal(item)} disabled={cancellingId===item.deal_id}
                        className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        style={{backgroundColor:'rgba(201,74,58,0.12)',color:'#C94A3A'}}>
                        {cancellingId===item.deal_id?'Cancelling...':'Cancel'}
                      </button>
                    )}
                    {canPayoutReferrals && (
                      <button onClick={()=>payoutReferrals(item)} disabled={payingOutId===item.deal_id}
                        className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        style={{backgroundColor:'rgba(212,168,83,0.12)',color:'#D4A853'}}>
                        {payingOutId===item.deal_id?'Processing...':'Pay Out Referrals'}
                      </button>
                    )}
                  </div>
                  )
                })}
                {stage.items.length===0&&<p className="text-[11px] text-center py-4" style={{color:'rgba(255,255,255,0.25)'}}>Empty</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

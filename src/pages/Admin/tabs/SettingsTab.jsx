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

// ── SETTINGS (superadmin-editable platform settings) ────────────────────────────
export function SettingsTab({isSuperAdmin}) {
  const [section,setSection]=useState('general')
  return(
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-bold flex items-center gap-2"><Settings size={16}/> Platform Settings</h3>
        <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.35)'}}>
          {isSuperAdmin?'Edit live values shown across the site - changes apply immediately, no code deploy needed.':'View only - contact superadmin to change these settings'}
        </p>
      </div>

      {!isSuperAdmin&&(
        <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)'}}>
          <Shield size={14} style={{color:'#D4A853',flexShrink:0,marginTop:2}}/>
          <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>You can view current settings, but only the superadmin account can save changes.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
        {[
          {id:'general', label:'General'},
          {id:'bank',    label:'Bank Details'},
        ].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={{backgroundColor:section===s.id?'#D4A853':'rgba(255,255,255,0.06)',color:section===s.id?'#17211B':'rgba(255,255,255,0.5)'}}>
            {s.label}
          </button>
        ))}
      </div>

      {section==='general'&&<GeneralSettingsSection isSuperAdmin={isSuperAdmin}/>}
      {section==='bank'   &&<BankDetailsSection      isSuperAdmin={isSuperAdmin}/>}
    </div>
  )
}

// ── Settings: General (social links, contact) ───────────────────────────────────
function GeneralSettingsSection({isSuperAdmin}) {
  const [settings,setSettings]=useState({})
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState({})
  const {user:admin}=useAuth()

  const FIELDS=[
    {key:'social_facebook',  label:'Facebook URL',  placeholder:'https://facebook.com/dealmatch',  category:'Social Media'},
    {key:'social_instagram', label:'Instagram URL',  placeholder:'https://instagram.com/dealmatch', category:'Social Media'},
    {key:'social_twitter',   label:'X (Twitter) URL',placeholder:'https://x.com/dealmatch',          category:'Social Media'},
    {key:'social_linkedin',  label:'LinkedIn URL',   placeholder:'https://linkedin.com/company/dealmatch', category:'Social Media'},
    {key:'whatsapp_number',  label:'WhatsApp Business Number', placeholder:'2347057392060', category:'Contact'},
    {key:'support_email',    label:'Support Email',  placeholder:'support@dealmatch.com.ng',     category:'Contact'},
  ]

  const load=async()=>{
    setLoading(true)
    const {data}=await supabase.from('platform_settings').select('key,value')
    const map={}
    for(const row of data||[]) map[row.key]=row.value||''
    setSettings(map)
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const saveField=async(key)=>{
    if(!isSuperAdmin){toast.error('Only the superadmin can edit settings');return}
    setSaving(s=>({...s,[key]:true}))
    const {error}=await supabase.from('platform_settings').upsert({
      key, value:settings[key]||'', updated_by:admin?.id, updated_at:new Date().toISOString(),
    },{onConflict:'key'})
    setSaving(s=>({...s,[key]:false}))
    if(error){toast.error('Could not save: '+error.message);return}
    await auditLog('platform_setting_updated',{key,by:admin?.id})
    toast.success('Saved')
  }

  const categories=[...new Set(FIELDS.map(f=>f.category))]

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      {categories.map(cat=>(
        <div key={cat} className="rounded-2xl p-5" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{color:'rgba(255,255,255,0.3)'}}>{cat}</p>
          <div className="space-y-4">
            {FIELDS.filter(f=>f.category===cat).map(f=>(
              <div key={f.key}>
                <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>{f.label}</label>
                <div className="flex gap-2">
                  <input
                    value={settings[f.key]||''}
                    onChange={e=>setSettings(s=>({...s,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    disabled={!isSuperAdmin}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                    style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}
                  />
                  {isSuperAdmin&&(
                    <button onClick={()=>saveField(f.key)} disabled={saving[f.key]}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
                      style={{backgroundColor:'#D4A853',color:'#17211B'}}>
                      <Save size={12}/> {saving[f.key]?'Saving…':'Save'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Settings: Bank Details ───────────────────────────────────────────────────────
// DealMatch's own business bank account(s) - where large/manual settlements
// land. Sensitive - restricted to admin/staff read, superadmin write only
// (enforced server-side via RLS in db/platform-settings-schema.sql).
function BankDetailsSection({isSuperAdmin}) {
  const [accounts,setAccounts]=useState([])
  const [loading,setLoading]=useState(true)
  const [editing,setEditing]=useState(null) // account being edited, or 'new'
  const [form,setForm]=useState({bank_name:'',account_name:'',account_number:'',account_type:'business',currency:'NGN',notes:''})
  const [saving,setSaving]=useState(false)
  const {user:admin}=useAuth()
  const {requireReauth,ReauthModalEl}=useReauthGate(admin?.email)

  const load=async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('bank_details').select('*').order('is_primary',{ascending:false}).order('created_at',{ascending:false})
    if(error){console.error(error.message);setAccounts([]);setLoading(false);return}
    setAccounts(data||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const startNew=()=>{
    setForm({bank_name:'',account_name:'',account_number:'',account_type:'business',currency:'NGN',notes:''})
    setEditing('new')
  }
  const startEdit=(acc)=>{
    setForm({bank_name:acc.bank_name,account_name:acc.account_name,account_number:acc.account_number,account_type:acc.account_type,currency:acc.currency,notes:acc.notes||''})
    setEditing(acc.id)
  }

  const save=async()=>{
    if(!isSuperAdmin){toast.error('Only the superadmin can edit bank details');return}
    if(!form.bank_name||!form.account_name||!/^\d{10}$/.test(form.account_number)){
      toast.error('Bank name, account name and a valid 10-digit account number are required')
      return
    }
    if(!(await requireReauth()))return
    setSaving(true)
    const payload={...form,updated_by:admin?.id,updated_at:new Date().toISOString()}
    const {error}=editing==='new'
      ? await supabase.from('bank_details').insert(payload)
      : await supabase.from('bank_details').update(payload).eq('id',editing)
    setSaving(false)
    if(error){toast.error('Could not save: '+error.message);return}
    await auditLog('bank_details_'+(editing==='new'?'added':'updated'),{by:admin?.id})
    toast.success('Saved')
    setEditing(null)
    load()
  }

  const toggleActive=async(acc)=>{
    if(!isSuperAdmin)return
    if(!(await requireReauth()))return
    await supabase.from('bank_details').update({is_active:!acc.is_active}).eq('id',acc.id)
    await auditLog('bank_details_'+(acc.is_active?'deactivated':'activated'),{id:acc.id,by:admin?.id})
    load()
  }
  const setPrimary=async(acc)=>{
    if(!isSuperAdmin)return
    if(!(await requireReauth()))return
    // Only one primary at a time - clear others first
    await supabase.from('bank_details').update({is_primary:false}).neq('id',acc.id)
    await supabase.from('bank_details').update({is_primary:true}).eq('id',acc.id)
    await auditLog('bank_details_primary_set',{id:acc.id,by:admin?.id})
    toast.success(acc.bank_name+' set as primary account')
    load()
  }
  const remove=async(acc)=>{
    if(!isSuperAdmin)return
    if(!window.confirm('Delete this bank account? This cannot be undone.'))return
    if(!(await requireReauth()))return
    await supabase.from('bank_details').delete().eq('id',acc.id)
    await auditLog('bank_details_deleted',{id:acc.id,by:admin?.id})
    toast.success('Deleted')
    load()
  }

  if(loading) return <Spinner/>

  return(
    <div className="space-y-4">
      <div className="rounded-2xl p-3 flex items-start gap-2.5" style={{backgroundColor:'rgba(200,95,45,0.06)',border:'1px solid rgba(200,95,45,0.15)'}}>
        <Shield size={14} style={{color:'#C85F2D',flexShrink:0,marginTop:2}}/>
        <p className="text-xs" style={{color:'rgba(255,255,255,0.5)'}}>
          These are DealMatch's own business accounts for receiving large or manually-confirmed payments.
          This is separate from a user's personal bank account used for referral payouts.
        </p>
      </div>

      {isSuperAdmin&&editing!=='new'&&(
        <button onClick={startNew}
          className="w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
          style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853',border:'1px dashed rgba(212,168,83,0.3)'}}>
          <Plus size={14}/> Add Bank Account
        </button>
      )}

      {editing&&(
        <div className="rounded-2xl p-5 space-y-3" style={{backgroundColor:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,168,83,0.25)'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#D4A853'}}>
            {editing==='new'?'New Bank Account':'Edit Bank Account'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Bank Name *</label>
              <input value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))}
                placeholder="e.g. GTBank" className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Type</label>
              <select value={form.account_type} onChange={e=>setForm(f=>({...f,account_type:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}>
                <option value="business">Business</option>
                <option value="domiciliary">Domiciliary (USD)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Name *</label>
            <input value={form.account_name} onChange={e=>setForm(f=>({...f,account_name:e.target.value}))}
              placeholder="DEALMATCH TECHNOLOGY LIMITED" className="w-full px-4 py-2.5 rounded-xl text-sm"
              style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Account Number *</label>
              <input value={form.account_number} onChange={e=>setForm(f=>({...f,account_number:e.target.value.replace(/\D/g,'').slice(0,10)}))}
                placeholder="10 digits" className="w-full px-4 py-2.5 rounded-xl text-sm font-mono"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Currency</label>
              <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl text-sm"
                style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}>
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{color:'rgba(255,255,255,0.6)'}}>Notes (optional)</label>
            <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              placeholder="e.g. Used for escrow settlements above N5M" className="w-full px-4 py-2.5 rounded-xl text-sm"
              style={{backgroundColor:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'white'}}/>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
              style={{backgroundColor:'#D4A853',color:'#17211B'}}>
              <Save size={12}/> {saving?'Saving…':'Save Account'}
            </button>
            <button onClick={()=>setEditing(null)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {accounts.length===0&&!editing&&(
        <div className="rounded-2xl p-6 text-center" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.1)'}}>
          <p className="text-sm" style={{color:'rgba(255,255,255,0.4)'}}>No bank accounts added yet</p>
        </div>
      )}

      {accounts.map(acc=>(
        <div key={acc.id} className="rounded-2xl p-4" style={{backgroundColor:'rgba(255,255,255,0.03)',border:'1px solid '+(acc.is_primary?'rgba(212,168,83,0.3)':'rgba(255,255,255,0.06)')}}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">{acc.bank_name}</p>
                {acc.is_primary&&<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:'rgba(212,168,83,0.15)',color:'#D4A853'}}>PRIMARY</span>}
                {!acc.is_active&&<span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)'}}>INACTIVE</span>}
              </div>
              <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.5)'}}>{acc.account_name}</p>
              <p className="text-sm font-mono mt-1" style={{color:'rgba(255,255,255,0.7)'}}>{acc.account_number} · {acc.currency}</p>
              {acc.notes&&<p className="text-xs mt-1.5" style={{color:'rgba(255,255,255,0.3)'}}>{acc.notes}</p>}
            </div>
          </div>
          {isSuperAdmin&&(
            <div className="flex gap-2 mt-3">
              <button onClick={()=>startEdit(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>Edit</button>
              {!acc.is_primary&&<button onClick={()=>setPrimary(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(212,168,83,0.1)',color:'#D4A853'}}>Set Primary</button>}
              <button onClick={()=>toggleActive(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{backgroundColor:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.6)'}}>{acc.is_active?'Deactivate':'Activate'}</button>
              <button onClick={()=>remove(acc)} className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto" style={{backgroundColor:'rgba(200,95,45,0.1)',color:'#C85F2D'}}>Delete</button>
            </div>
          )}
        </div>
      ))}
      {ReauthModalEl}
    </div>
  )
}

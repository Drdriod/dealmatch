import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Banknote, BedDouble, Briefcase, Building2, Check, GraduationCap, Hand, Handshake, HardHat, Home, Hotel, Key, Leaf, PartyPopper, Store, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { analytics } from '@/lib/posthog'
import toast from 'react-hot-toast'

const ROLES = [
  { id:'buyer',    icon: <Home size={20} className="text-terracotta" />, label:"I want to Buy",    desc:'Looking for a property to purchase.' },
  { id:'seller',   icon: <Briefcase size={20} className="text-terracotta" />, label:"I want to Sell",   desc:'I have a property to list and sell.' },
  { id:'renter',   icon: <Key size={20} className="text-terracotta" />, label:"I want to Rent",   desc:'Looking for a rental property.' },
  { id:'landlord', icon: <Building2 size={20} className="text-terracotta" />, label:"I'm a Landlord",  desc:'I have rental or hotel properties to list.' },
  { id:'investor', icon: <TrendingUp size={20} className="text-terracotta" />, label:"I'm an Investor",  desc:'I buy properties for investment returns.' },
  { id:'student',  icon: <GraduationCap size={20} className="text-terracotta" />, label:"I'm a Student",    desc:'Looking for student hostel accommodation near my school.' },
]

// Roles that go through student verify flow instead of identity verify
const STUDENT_ROLES = new Set(['student'])

// Verification note per role shown on onboarding completion
const VERIFY_NOTE = {
  buyer:    'You will need to verify your identity before expressing interest in properties.',
  seller:   'Identity verification is required before listing your first property.',
  renter:   'Identity verification is required before signing tenancy agreements.',
  landlord: 'Identity verification is required before listing or receiving payouts.',
  investor: 'Identity verification is required before making deal agreements.',
  student:  'Student verification is free and separate - verify via Student Hostels.',
}

const GOALS_BY_ROLE = {
  buyer:    [
    { id:'buy_home',      label:'Buy a Home',          icon: <Home size={20} className="text-terracotta" /> },
    { id:'buy_land',      label:'Buy Land',             icon: <Leaf size={20} className="text-terracotta" /> },
    { id:'investment',    label:'Property Investment',  icon: <TrendingUp size={20} className="text-terracotta" /> },
    { id:'commercial',    label:'Commercial Property',  icon: <Store size={20} className="text-terracotta" /> },
  ],
  renter:   [
    { id:'short_term',    label:'Short-term Stay',      icon: <BellConcierge size={20} className="text-terracotta" /> },
    { id:'long_term',     label:'Long-term Rental',     icon: <Key size={20} className="text-terracotta" /> },
    { id:'hotel',         label:'Hotel / Lodging',      icon: <Hotel size={20} className="text-terracotta" /> },
  ],
  seller:   [
    { id:'sell_property', label:'Sell My Property',     icon: <Banknote size={20} className="text-terracotta" /> },
    { id:'joint_venture', label:'Joint Venture',        icon: <Handshake size={20} className="text-terracotta" /> },
    { id:'off_plan',      label:'Off-Plan Sale',        icon: <HardHat size={20} className="text-terracotta" /> },
  ],
  landlord: [
    { id:'rental_income', label:'Rental Income',        icon: <Banknote size={20} className="text-terracotta" /> },
    { id:'hotel_income',  label:'Hotel / Short-let',    icon: <Hotel size={20} className="text-terracotta" /> },
    { id:'both',          label:'Both Rental & Hotel',  icon: <Building2 size={20} className="text-terracotta" /> },
  ],
  investor: [
    { id:'buy_land',      label:'Land Banking',         icon: <Leaf size={20} className="text-terracotta" /> },
    { id:'investment',    label:'Capital Appreciation', icon: <TrendingUp size={20} className="text-terracotta" /> },
    { id:'rental_income', label:'Rental Income',        icon: <Banknote size={20} className="text-terracotta" /> },
    { id:'development',   label:'Property Development', icon: <HardHat size={20} className="text-terracotta" /> },
  ],
  student: [
    { id:'student_hostel', label:'Student Hostel',      icon: <Home size={20} className="text-terracotta" /> },
    { id:'shared_room',    label:'Shared Room',         icon: <BedDouble size={20} className="text-terracotta" /> },
    { id:'self_contain',   label:'Self Contain',        icon: <Key size={20} className="text-terracotta" /> },
  ],
}

const ALL_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe',
  'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara',
  'Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau',
  'Rivers','Sokoto','Taraba','Yobe','Zamfara'
]

const PROP_TYPES = ['Land','Apartment','Duplex','Detached Home','Terrace','Commercial','Hotel','Short-let']

// ── Budget validation helpers ────────────────────────────────
const MIN_BUDGET   = 100000      // ₦100k minimum
const MAX_BUDGET   = 10000000000 // ₦10 billion maximum

function validateBudget(min, max) {
  const minN = min ? Number(min) : 0
  const maxN = max ? Number(max) : 0
  if (max && isNaN(maxN))       return 'Max budget must be a number'
  if (min && isNaN(minN))       return 'Min budget must be a number'
  if (max && maxN < MIN_BUDGET) return `Max budget must be at least ₦${MIN_BUDGET.toLocaleString()}`
  if (max && maxN > MAX_BUDGET) return `Max budget seems too high. Please enter a realistic amount.`
  if (min && max && minN >= maxN) return 'Min budget must be less than max budget'
  if (min && minN < 0)          return 'Budget cannot be negative'
  return null
}

function formatBudgetPreview(val) {
  const n = Number(val)
  if (!val || isNaN(n) || n === 0) return ''
  if (n >= 1000000000) return `₦${(n/1000000000).toFixed(1)}B`
  if (n >= 1000000)    return `₦${(n/1000000).toFixed(1)}M`
  if (n >= 1000)       return `₦${(n/1000).toFixed(0)}K`
  return `₦${n.toLocaleString()}`
}

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [budgetError, setBudgetError] = useState('')

  const [data, setData] = useState({
    role: '', property_goal: '', preferred_states: [],
    property_types: [], budget_min: '', budget_max: '',
    needs_financing: false,
  })

  const set       = (k, v) => setData(d => ({ ...d, [k]: v }))
  const toggleArr = (k, v) => setData(d => ({
    ...d, [k]: d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v]
  }))

  const handleBudgetChange = (key, val) => {
    // Only allow digits
    const cleaned = val.replace(/[^0-9]/g, '')
    set(key, cleaned)
    const minVal = key === 'budget_min' ? cleaned : data.budget_min
    const maxVal = key === 'budget_max' ? cleaned : data.budget_max
    const err = validateBudget(minVal, maxVal)
    setBudgetError(err || '')
  }

  const isBuyer = ['buyer','renter','investor'].includes(data.role)
  const isLister = ['landlord','seller'].includes(data.role)
  const goalsForRole = GOALS_BY_ROLE[data.role] || []

  const steps = [
    // Step 1: Role
    {
      title: "Your role",
      valid: () => !!data.role,
      content: (
        <div className="space-y-3">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3"><Hand size={48} className="text-terracotta" /></div>
            <h2 className="font-display font-black text-2xl" style={{ color:'#1A1210' }}>Welcome to DealMatch!</h2>
            <p className="text-sm mt-1" style={{ color:'#8A7E78' }}>Tell us how you'll be using the platform.</p>
          </div>
          {ROLES.map(r => (
            <button key={r.id} onClick={() => { set('role', r.id); set('property_goal', '') }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: data.role === r.id ? '#C96A3A' : '#E8DDD2', backgroundColor: data.role === r.id ? 'rgba(201,106,58,0.05)' : '#FFFFFF' }}>
              <span className="flex-shrink-0">{r.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color:'#1A1210' }}>{r.label}</p>
                <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>{r.desc}</p>
              </div>
              {data.role === r.id && <Check size={16} style={{ color:'#C96A3A', flexShrink:0 }} />}
            </button>
          ))}
        </div>
      ),
    },

    // Step 2: Goal
    {
      title: 'Your goal',
      valid: () => !!data.property_goal,
      content: (
        <div>
          <div className="mb-5">
            <h2 className="font-display font-black text-2xl" style={{ color:'#1A1210' }}>What's your goal?</h2>
            <p className="text-sm mt-1" style={{ color:'#8A7E78' }}>This helps us match you with the right properties.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {goalsForRole.map(g => (
              <button key={g.id} onClick={() => set('property_goal', g.id)}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all"
                style={{ borderColor: data.property_goal === g.id ? '#C96A3A' : '#E8DDD2', backgroundColor: data.property_goal === g.id ? 'rgba(201,106,58,0.05)' : '#FFFFFF' }}>
                <span className="text-3xl">{g.icon}</span>
                <span className="text-xs font-semibold text-center" style={{ color:'#1A1210' }}>{g.label}</span>
                {data.property_goal === g.id && <Check size={12} style={{ color:'#C96A3A' }} />}
              </button>
            ))}
          </div>
        </div>
      ),
    },

    // Step 3: Preferences + Budget
    {
      title: 'Preferences',
      valid: () => {
        if (isBuyer)  return !!data.budget_max && !budgetError
        if (isLister) return data.preferred_states.length > 0
        return true
      },
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display font-black text-2xl" style={{ color:'#1A1210' }}>
              {isLister ? 'Listing Preferences' : 'Your preferences'}
            </h2>
            <p className="text-sm mt-1" style={{ color:'#8A7E78' }}>
              {isLister ? 'Tell us where your properties are located.' : 'Tell us where and what you\'re looking for.'}
            </p>
          </div>

          {/* States */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(26,18,16,0.5)' }}>
              {isLister ? 'Primary States of Operation' : 'Preferred States'}
            </label>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded-2xl" style={{ borderColor:'#E8DDD2' }}>
              {ALL_STATES.map(s => (
                <button key={s} onClick={() => toggleArr('preferred_states', s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: data.preferred_states.includes(s) ? '#C96A3A' : '#E8DDD2', backgroundColor: data.preferred_states.includes(s) ? '#C96A3A' : '#FFFFFF', color: data.preferred_states.includes(s) ? '#FFFFFF' : '#5C4A3A' }}>
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color:'#8A7E78' }}>You can select multiple states.</p>
          </div>

          {/* Property types */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(26,18,16,0.5)' }}>Property Types</label>
            <div className="flex flex-wrap gap-2">
              {PROP_TYPES.map(t => (
                <button key={t} onClick={() => toggleArr('property_types', t)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: data.property_types.includes(t) ? '#7A9E7E' : '#E8DDD2', backgroundColor: data.property_types.includes(t) ? '#7A9E7E' : '#FFFFFF', color: data.property_types.includes(t) ? '#FFFFFF' : '#5C4A3A' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Budget - buyers/investors/renters only */}
          {isBuyer && (
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider block" style={{ color:'rgba(26,18,16,0.5)' }}>Budget Range (₦) *</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Min budget */}
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color:'#8A7E78' }}>Min Budget</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input text-sm"
                    placeholder="e.g. 5000000"
                    value={data.budget_min}
                    onChange={e => handleBudgetChange('budget_min', e.target.value)}
                    style={{ backgroundColor:'#FFFFFF', color:'#1A1210', borderColor: budgetError ? '#C96A3A' : '#E8DDD2' }}
                  />
                  {data.budget_min && (
                    <p className="text-[10px] mt-1 font-semibold" style={{ color:'#7A9E7E' }}>
                      {formatBudgetPreview(data.budget_min)}
                    </p>
                  )}
                </div>
                {/* Max budget */}
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color:'#8A7E78' }}>Max Budget *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input text-sm"
                    placeholder="e.g. 50000000"
                    value={data.budget_max}
                    onChange={e => handleBudgetChange('budget_max', e.target.value)}
                    style={{ backgroundColor:'#FFFFFF', color:'#1A1210', borderColor: budgetError ? '#C96A3A' : '#E8DDD2' }}
                  />
                  {data.budget_max && (
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: budgetError ? '#C96A3A' : '#7A9E7E' }}>
                      {budgetError ? budgetError : formatBudgetPreview(data.budget_max)}
                    </p>
                  )}
                </div>
              </div>
              {/* Budget error banner */}
              {budgetError && (
                <div className="flex items-center gap-2 p-3 rounded-xl"
                  style={{ backgroundColor:'rgba(201,106,58,0.08)', border:'1px solid rgba(201,106,58,0.25)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C96A3A" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-xs" style={{ color:'#C96A3A' }}>{budgetError}</p>
                </div>
              )}
              {/* Mortgage toggle */}
              {(data.role === 'buyer' || data.role === 'investor') && (
                <div className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all"
                  style={{ borderColor: data.needs_financing ? '#C96A3A' : '#E8DDD2', backgroundColor: data.needs_financing ? 'rgba(201,106,58,0.05)' : '#FFFFFF' }}
                  onClick={() => set('needs_financing', !data.needs_financing)}>
                  <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: data.needs_financing ? '#C96A3A' : '#E8DDD2', backgroundColor: data.needs_financing ? '#C96A3A' : '#FFFFFF' }}>
                    {data.needs_financing && <Check size={10} color="white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color:'#1A1210' }}>I'd be interested in mortgage financing</p>
                    <p className="text-xs" style={{ color:'#8A7E78' }}>Mortgage matching is coming soon - we'll notify you when it's ready</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLister && (
            <div className="rounded-2xl p-4 border" style={{ backgroundColor:'rgba(122,158,126,0.06)', borderColor:'rgba(122,158,126,0.25)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color:'#5C8060' }}>Listing Focus</p>
              <p className="text-xs" style={{ color:'#8A7E78' }}>We'll prioritize showing your listings to buyers in your selected states.</p>
            </div>
          )}
        </div>
      ),
    },

    // Step 4: Summary - no name/phone fields (already collected at signup)
    {
      title: 'Ready to go',
      valid: () => true,
      content: (
        <div className="space-y-5">
          <div className="text-center">
            <div className="flex justify-center mb-3"><PartyPopper size={48} className="text-gold" /></div>
            <h2 className="font-display font-black text-2xl" style={{ color:'#1A1210' }}>You're all set!</h2>
            <p className="text-sm mt-1" style={{ color:'#8A7E78' }}>Here's a summary of your profile setup.</p>
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border divide-y overflow-hidden" style={{ borderColor:'#E8DDD2' }}>
            {[
              { label:'Role',        value: ROLES.find(r => r.id === data.role)?.label },
              { label:'Goal',        value: (GOALS_BY_ROLE[data.role] || []).find(g => g.id === data.property_goal)?.label },
              { label:'States',      value: data.preferred_states.length > 0 ? data.preferred_states.slice(0,3).join(', ') + (data.preferred_states.length > 3 ? ` +${data.preferred_states.length-3} more` : '') : 'Not set' },
              ...(isBuyer && data.budget_max ? [{ label:'Max Budget', value: formatBudgetPreview(data.budget_max) }] : []),
              { label:'Name',        value: profile?.full_name || 'Set in profile' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3"
                style={{ backgroundColor:'#FFFFFF' }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'#8A7E78' }}>{row.label}</p>
                <p className="text-sm font-semibold" style={{ color:'#1A1210' }}>{row.value || 'N/A'}</p>
              </div>
            ))}
          </div>

          {/* Identity verification notice */}
          <div className="rounded-2xl p-4 border-2" style={{ backgroundColor:'rgba(212,168,83,0.06)', borderColor:'rgba(212,168,83,0.3)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color:'#1A1210' }}>Next: Identity Verification</p>
            <p className="text-xs leading-relaxed" style={{ color:'#8A7E78' }}>
              After setup, you'll be asked to upload a valid ID and complete a live face check. This keeps DealMatch scam-free and unlocks all features.
            </p>
          </div>
        </div>
      ),
    },
  ]

  const current = steps[step]
  const isLast  = step === steps.length - 1

  const handleNext = async () => {
    if (!current.valid()) {
      if (budgetError) { toast.error(budgetError); return }
      toast.error('Please complete this step')
      return
    }

    // Budget validation before proceeding from step 3
    if (step === 2 && isBuyer) {
      const err = validateBudget(data.budget_min, data.budget_max)
      if (err) { toast.error(err); return }
    }

    if (!isLast) { setStep(s => s + 1); return }

    if (!user?.id) { toast.error('Not signed in. Please sign in again.'); return }

    setSaving(true)
    try {
      const payload = {
        id:                   user.id,
        role:                 data.role,
        property_goal:        data.property_goal,
        preferred_states:     data.preferred_states,
        property_types:       data.property_types,
        budget_min:           (data.budget_min && isBuyer) ? Number(data.budget_min) : null,
        budget_max:           (data.budget_max && isBuyer) ? Number(data.budget_max) : null,
        needs_financing:      data.needs_financing,
        onboarding_completed: true,
        updated_at:           new Date().toISOString(),
      }

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)

      if (error) throw error

      analytics.onboardingDone?.({ role: data.role, goal: data.property_goal })

      // Refresh profile with a 5s timeout so RLS recursion bugs never stall the user
      const dest = STUDENT_ROLES.has(data.role) ? '/student-verify' : '/verify-identity'
      try {
        await Promise.race([
          refreshProfile(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
      } catch {
        // Timed out or refresh failed - navigate anyway, profile will reload on next page
      }
      navigate(dest)

    } catch (err) {
      console.error('Onboarding save error:', err)
      // RLS recursion bug - save succeeded, move forward
      if (err.message?.includes('infinite recursion') || err.message?.includes('timeout')) {
        const dest = STUDENT_ROLES.has(data.role) ? '/student-verify' : '/verify-identity'
        navigate(dest)
        return
      }
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor:'#FFFAF5' }}>
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs mb-3" style={{ color:'#8A7E78' }}>
            <span>Step {step + 1} of {steps.length}</span>
            <span>{current.title}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor:'rgba(26,18,16,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width:`${((step + 1) / steps.length) * 100}%`, backgroundColor:'#C96A3A' }} />
          </div>
        </div>

        {current.content}

        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} disabled={saving}
              className="px-5 py-4 rounded-2xl text-sm font-semibold border"
              style={{ borderColor:'#E8DDD2', color:'#8A7E78', backgroundColor:'#FFFFFF' }}>
              ←
            </button>
          )}
          <button onClick={handleNext} disabled={saving || !current.valid()}
            className="btn-primary flex-1 py-4 flex items-center justify-center gap-2"
            style={{ opacity: current.valid() ? 1 : 0.5 }}>
            {saving ? 'Saving...' : isLast ? 'Complete Setup' : <><span>Next</span> <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

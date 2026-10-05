import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Banknote, BedDouble, Briefcase, Building2, Check, Compass, ConciergeBell, GraduationCap, Hand, Handshake, HardHat, Home, Hotel, Key, Leaf, PartyPopper, Store, TrendingUp, Wrench } from 'lucide-react'
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
  { id:'student',  icon: <GraduationCap size={20} className="text-terracotta" />, label:"I'm a Student",    desc:'Looking for student hostel accommodation near my school.', comingSoon: true },
]

// Roles that go through student verify flow instead of identity verify
const STUDENT_ROLES = new Set(['student'])

// The two onboarding paths - this is the sieve. A "seeker" wants to find
// something (fast, low-friction). A "place" provider is listing property
// (heavier, document-backed verification). Skilled people (a third path)
// don't use ROLES/GOALS_BY_ROLE at all - they're handled entirely by
// SkillVerificationPage (/verify-skill) after a lightweight onboarding
// confirmation and identity verification. This is the free, portfolio-first
// Skill Verified path - NOT ApplyProfessionalPage, which is the separate
// paid property-professional (surveyor/agent/lawyer) vertical.
const SEEKING_ROLE_IDS = new Set(['buyer', 'renter', 'investor', 'student'])
const PLACE_ROLE_IDS   = new Set(['seller', 'landlord'])

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
    { id:'short_term',    label:'Short-term Stay',      icon: <ConciergeBell size={20} className="text-terracotta" /> },
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
    intent: '', provider_type: '',
    role: '', roles: [], property_goal: '', preferred_states: [],
    property_types: [], budget_min: '', budget_max: '',
    needs_financing: false,
  })

  const set       = (k, v) => setData(d => ({ ...d, [k]: v }))
  const toggleArr = (k, v) => setData(d => ({
    ...d, [k]: d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v]
  }))

  // Branch choices auto-advance on tap (single decision, no "Next" needed) -
  // this is what keeps the flow focused instead of dumping every option
  // on one screen regardless of what the person is actually here to do.
  const chooseIntent = (intent) => {
    setData(d => ({ ...d, intent, provider_type: '', roles: [], role: '', property_goal: '' }))
    setStep(s => s + 1)
  }
  const chooseProviderType = (provider_type) => {
    setData(d => ({ ...d, provider_type, roles: [], role: '', property_goal: '' }))
    setStep(s => s + 1)
  }

  const visibleRoles = ROLES.filter(r =>
    (data.provider_type === 'place' ? PLACE_ROLE_IDS : SEEKING_ROLE_IDS).has(r.id)
  )

  const toggleRole = (id) => {
    setData(d => {
      const roles = d.roles.includes(id) ? d.roles.filter(x => x !== id) : [...d.roles, id]
      // primary `role` drives legacy single-role logic (dashboards, RLS, verify routing);
      // keep it in sync as the first-selected role.
      const stillValidGoal = roles.some(r => (GOALS_BY_ROLE[r] || []).some(g => g.id === d.property_goal))
      return { ...d, roles, role: roles[0] || '', property_goal: stillValidGoal ? d.property_goal : '' }
    })
  }

  const handleBudgetChange = (key, val) => {
    // Only allow digits
    const cleaned = val.replace(/[^0-9]/g, '')
    set(key, cleaned)
    const minVal = key === 'budget_min' ? cleaned : data.budget_min
    const maxVal = key === 'budget_max' ? cleaned : data.budget_max
    const err = validateBudget(minVal, maxVal)
    setBudgetError(err || '')
  }

  const isBuyer = data.roles.some(r => ['buyer','renter','investor'].includes(r))
  const isLister = data.roles.some(r => ['landlord','seller'].includes(r))
  // Union of goal options across every selected role, de-duplicated by goal id
  const goalsForRole = Object.values(
    data.roles.reduce((acc, r) => {
      for (const g of (GOALS_BY_ROLE[r] || [])) acc[g.id] = g
      return acc
    }, {})
  )

  const steps = [
    // Step 0: Intent - the sieve. Everything downstream depends on this.
    {
      title: "Welcome",
      valid: () => !!data.intent,
      content: (
        <div className="space-y-3">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3"><Hand size={48} className="text-terracotta" /></div>
            <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>Welcome to DealMatch!</h2>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>What are you here to do?</p>
          </div>

          <button onClick={() => chooseIntent('seeking')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
            style={{ borderColor: data.intent === 'seeking' ? '#C85F2D' : '#DEDDD6', backgroundColor: data.intent === 'seeking' ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
            <Compass size={22} className="text-terracotta flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color:'#17211B' }}>Find a Place or Get Help</p>
              <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Buy, rent, invest, find student housing, or hire a skilled professional.</p>
            </div>
          </button>

          <button onClick={() => chooseIntent('providing')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
            style={{ borderColor: data.intent === 'providing' ? '#C85F2D' : '#DEDDD6', backgroundColor: data.intent === 'providing' ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
            <Briefcase size={22} className="text-terracotta flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color:'#17211B' }}>List a Property or Offer a Service</p>
              <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Landlords, sellers, and skilled professionals - verification required before going live.</p>
            </div>
          </button>
        </div>
      ),
    },

    // Step 0b: only for the providing path - splits into two structurally
    // different verification pipelines (property docs vs identity + proof of work).
    ...(data.intent === 'providing' ? [{
      title: "What are you offering?",
      valid: () => !!data.provider_type,
      content: (
        <div className="space-y-3">
          <div className="mb-6">
            <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>What are you offering?</h2>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>This decides what we'll ask you to verify.</p>
          </div>

          <button onClick={() => chooseProviderType('place')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
            style={{ borderColor: data.provider_type === 'place' ? '#C85F2D' : '#DEDDD6', backgroundColor: data.provider_type === 'place' ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
            <Home size={22} className="text-terracotta flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color:'#17211B' }}>A Place</p>
              <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Land, apartments, houses, or short-lets you own or manage.</p>
            </div>
          </button>

          <button onClick={() => chooseProviderType('skill')}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
            style={{ borderColor: data.provider_type === 'skill' ? '#C85F2D' : '#DEDDD6', backgroundColor: data.provider_type === 'skill' ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
            <Wrench size={22} className="text-terracotta flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color:'#17211B' }}>A Skill or Service</p>
              <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Surveying, legal, engineering, trades, and other professional services.</p>
            </div>
          </button>
        </div>
      ),
    }] : []),

    // Step: Skilled-person path skips the property-specific steps entirely -
    // they don't have a "budget" or "preferred states" the way a buyer does.
    ...(data.intent === 'providing' && data.provider_type === 'skill' ? [{
      title: "Almost there",
      valid: () => true,
      content: (
        <div className="text-center space-y-4">
          <div className="flex justify-center"><Wrench size={48} className="text-terracotta" /></div>
          <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>You're joining as a Professional</h2>
          <p className="text-sm" style={{ color:'#647068' }}>
            Next, we'll verify your identity, then ask about your profession and experience.
            Your profile only goes live once both are confirmed - that's what keeps clients trusting the people they hire here.
          </p>
        </div>
      ),
    }] : (data.intent ? [
      // Step: Role (filtered to the chosen branch)
      {
        title: "Your role",
        valid: () => data.roles.length > 0,
        content: (
          <div className="space-y-3">
            <div className="mb-6">
              <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>
                {data.provider_type === 'place' ? 'Tell us about your property' : "What's your role?"}
              </h2>
              <p className="text-sm mt-1" style={{ color:'#647068' }}>You can select more than one.</p>
            </div>
            {visibleRoles.map(r => (
            <button key={r.id}
              disabled={r.comingSoon}
              onClick={() => { if (r.comingSoon) return; toggleRole(r.id) }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all"
              style={{
                borderColor: data.roles.includes(r.id) ? '#C85F2D' : '#DEDDD6',
                backgroundColor: data.roles.includes(r.id) ? 'rgba(200,95,45,0.05)' : '#FFFFFF',
                opacity: r.comingSoon ? 0.55 : 1,
                cursor: r.comingSoon ? 'not-allowed' : 'pointer',
              }}>
              <span className="flex-shrink-0">{r.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm flex items-center gap-2" style={{ color:'#17211B' }}>
                  {r.label}
                  {r.comingSoon && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ backgroundColor:'rgba(212,168,83,0.15)', color:'#8A6A20' }}>
                      Coming Soon
                    </span>
                  )}
                </p>
                <p className="text-xs mt-0.5" style={{ color:'#647068' }}>{r.desc}</p>
              </div>
              {data.roles.includes(r.id) && <Check size={16} style={{ color:'#C85F2D', flexShrink:0 }} />}
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
            <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>What's your goal?</h2>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>This helps us match you with the right properties.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {goalsForRole.map(g => (
              <button key={g.id} onClick={() => set('property_goal', g.id)}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all"
                style={{ borderColor: data.property_goal === g.id ? '#C85F2D' : '#DEDDD6', backgroundColor: data.property_goal === g.id ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
                <span className="text-3xl">{g.icon}</span>
                <span className="text-xs font-semibold text-center" style={{ color:'#17211B' }}>{g.label}</span>
                {data.property_goal === g.id && <Check size={12} style={{ color:'#C85F2D' }} />}
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
            <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>
              {isLister ? 'Listing Preferences' : 'Your preferences'}
            </h2>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>
              {isLister ? 'Tell us where your properties are located.' : 'Tell us where and what you\'re looking for.'}
            </p>
          </div>

          {/* States */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>
              {isLister ? 'Primary States of Operation' : 'Preferred States'}
            </label>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border rounded-2xl" style={{ borderColor:'#DEDDD6' }}>
              {ALL_STATES.map(s => (
                <button key={s} onClick={() => toggleArr('preferred_states', s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: data.preferred_states.includes(s) ? '#C85F2D' : '#DEDDD6', backgroundColor: data.preferred_states.includes(s) ? '#C85F2D' : '#FFFFFF', color: data.preferred_states.includes(s) ? '#FFFFFF' : '#5C4A3A' }}>
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color:'#647068' }}>You can select multiple states.</p>
          </div>

          {/* Property types */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Property Types</label>
            <div className="flex flex-wrap gap-2">
              {PROP_TYPES.map(t => (
                <button key={t} onClick={() => toggleArr('property_types', t)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: data.property_types.includes(t) ? '#7A9E7E' : '#DEDDD6', backgroundColor: data.property_types.includes(t) ? '#7A9E7E' : '#FFFFFF', color: data.property_types.includes(t) ? '#FFFFFF' : '#5C4A3A' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Budget - buyers/investors/renters only */}
          {isBuyer && (
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider block" style={{ color:'rgba(23,33,27,0.5)' }}>Budget Range (₦) *</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Min budget */}
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color:'#647068' }}>Min Budget</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input text-sm"
                    placeholder="e.g. 5000000"
                    value={data.budget_min}
                    onChange={e => handleBudgetChange('budget_min', e.target.value)}
                    style={{ backgroundColor:'#FFFFFF', color:'#17211B', borderColor: budgetError ? '#C85F2D' : '#DEDDD6' }}
                  />
                  {data.budget_min && (
                    <p className="text-[10px] mt-1 font-semibold" style={{ color:'#7A9E7E' }}>
                      {formatBudgetPreview(data.budget_min)}
                    </p>
                  )}
                </div>
                {/* Max budget */}
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color:'#647068' }}>Max Budget *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input text-sm"
                    placeholder="e.g. 50000000"
                    value={data.budget_max}
                    onChange={e => handleBudgetChange('budget_max', e.target.value)}
                    style={{ backgroundColor:'#FFFFFF', color:'#17211B', borderColor: budgetError ? '#C85F2D' : '#DEDDD6' }}
                  />
                  {data.budget_max && (
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: budgetError ? '#C85F2D' : '#7A9E7E' }}>
                      {budgetError ? budgetError : formatBudgetPreview(data.budget_max)}
                    </p>
                  )}
                </div>
              </div>
              {/* Budget error banner */}
              {budgetError && (
                <div className="flex items-center gap-2 p-3 rounded-xl"
                  style={{ backgroundColor:'rgba(200,95,45,0.08)', border:'1px solid rgba(200,95,45,0.25)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C85F2D" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p className="text-xs" style={{ color:'#C85F2D' }}>{budgetError}</p>
                </div>
              )}
              {/* Mortgage toggle */}
              {(data.roles.includes('buyer') || data.roles.includes('investor')) && (
                <div className="flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all"
                  style={{ borderColor: data.needs_financing ? '#C85F2D' : '#DEDDD6', backgroundColor: data.needs_financing ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}
                  onClick={() => set('needs_financing', !data.needs_financing)}>
                  <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: data.needs_financing ? '#C85F2D' : '#DEDDD6', backgroundColor: data.needs_financing ? '#C85F2D' : '#FFFFFF' }}>
                    {data.needs_financing && <Check size={10} color="white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color:'#17211B' }}>I'd be interested in mortgage financing</p>
                    <p className="text-xs" style={{ color:'#647068' }}>Mortgage matching is coming soon - we'll notify you when it's ready</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLister && (
            <div className="rounded-2xl p-4 border" style={{ backgroundColor:'rgba(122,158,126,0.06)', borderColor:'rgba(122,158,126,0.25)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color:'#5C8060' }}>Listing Focus</p>
              <p className="text-xs" style={{ color:'#647068' }}>We'll prioritize showing your listings to buyers in your selected states.</p>
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
            <h2 className="font-display font-black text-2xl" style={{ color:'#17211B' }}>You're all set!</h2>
            <p className="text-sm mt-1" style={{ color:'#647068' }}>Here's a summary of your profile setup.</p>
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border divide-y overflow-hidden" style={{ borderColor:'#DEDDD6' }}>
            {[
              { label:'Role',        value: data.roles.map(id => ROLES.find(r => r.id === id)?.label).filter(Boolean).join(', ') },
              { label:'Goal',        value: goalsForRole.find(g => g.id === data.property_goal)?.label },
              { label:'States',      value: data.preferred_states.length > 0 ? data.preferred_states.slice(0,3).join(', ') + (data.preferred_states.length > 3 ? ` +${data.preferred_states.length-3} more` : '') : 'Not set' },
              ...(isBuyer && data.budget_max ? [{ label:'Max Budget', value: formatBudgetPreview(data.budget_max) }] : []),
              { label:'Name',        value: profile?.full_name || 'Set in profile' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3"
                style={{ backgroundColor:'#FFFFFF' }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:'#647068' }}>{row.label}</p>
                <p className="text-sm font-semibold" style={{ color:'#17211B' }}>{row.value || 'N/A'}</p>
              </div>
            ))}
          </div>

          {/* Identity verification notice */}
          <div className="rounded-2xl p-4 border-2" style={{ backgroundColor:'rgba(212,168,83,0.06)', borderColor:'rgba(212,168,83,0.3)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color:'#17211B' }}>Next: Identity Verification</p>
            <p className="text-xs leading-relaxed" style={{ color:'#647068' }}>
              After setup, you'll be asked to upload a valid ID and complete a live face check. This keeps DealMatch scam-free and unlocks all features.
            </p>
          </div>
        </div>
      ),
    },
  ] : []))
  ]

  const stepIndex = Math.min(step, steps.length - 1)
  const current   = steps[stepIndex]
  const isLast    = stepIndex === steps.length - 1

  const handleNext = async () => {
    if (!current.valid()) {
      if (budgetError) { toast.error(budgetError); return }
      toast.error('Please complete this step')
      return
    }

    // Budget validation before leaving the Preferences step
    if (current.title === 'Preferences' && isBuyer) {
      const err = validateBudget(data.budget_min, data.budget_max)
      if (err) { toast.error(err); return }
    }

    if (!isLast) { setStep(s => s + 1); return }

    if (!user?.id) { toast.error('Not signed in. Please sign in again.'); return }

    const isSkillPath = data.intent === 'providing' && data.provider_type === 'skill'

    setSaving(true)
    try {
      const payload = isSkillPath
        ? {
            id:                   user.id,
            role:                 'professional',
            roles:                ['professional'],
            onboarding_completed: true,
            updated_at:           new Date().toISOString(),
          }
        : {
            id:                   user.id,
            role:                 data.role,
            roles:                data.roles,
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

      analytics.onboardingDone?.({ role: payload.role, roles: payload.roles, goal: data.property_goal })

      // Skilled professionals verify identity first, then land on the
      // profession + proof-of-work form - never the other way round.
      const dest = isSkillPath
        ? '/verify-identity'
        : data.roles.some(r => STUDENT_ROLES.has(r)) ? '/student-verify' : '/verify-identity'
      const navOpts = isSkillPath ? { state: { returnTo: '/verify-skill' } } : undefined

      try {
        await Promise.race([
          refreshProfile(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
      } catch {
        // Timed out or refresh failed - navigate anyway, profile will reload on next page
      }
      navigate(dest, navOpts)

    } catch (err) {
      console.error('Onboarding save error:', err)
      // RLS recursion bug - save succeeded, move forward
      if (err.message?.includes('infinite recursion') || err.message?.includes('timeout')) {
        const dest = isSkillPath
          ? '/verify-identity'
          : data.roles.some(r => STUDENT_ROLES.has(r)) ? '/student-verify' : '/verify-identity'
        const navOpts = isSkillPath ? { state: { returnTo: '/verify-skill' } } : undefined
        navigate(dest, navOpts)
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
          <div className="flex items-center justify-between text-xs mb-3" style={{ color:'#647068' }}>
            <span>Step {stepIndex + 1} of {steps.length}</span>
            <span>{current.title}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width:`${((stepIndex + 1) / steps.length) * 100}%`, backgroundColor:'#C85F2D' }} />
          </div>
        </div>

        {current.content}

        <div className="flex gap-3 mt-8">
          {stepIndex > 0 && (
            <button onClick={() => setStep(s => Math.min(s, steps.length - 1) - 1)} disabled={saving}
              className="px-5 py-4 rounded-2xl text-sm font-semibold border"
              style={{ borderColor:'#DEDDD6', color:'#647068', backgroundColor:'#FFFFFF' }}>
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

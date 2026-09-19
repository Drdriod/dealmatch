import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Briefcase, Building, Check, ChevronDown, Map } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { supabase } from '@/lib/supabase'
import { PROFESSIONAL_PLANS, subscribeProfessional } from '@/lib/paystack'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

// Comprehensive list of real-estate and property-related professions.
// Grouped by category so the dropdown is easy to scan.
// 'other' at the end lets someone type in anything not listed.
const PROFESSION_GROUPS = [
  {
    group: 'Surveying & Assessment',
    options: [
      { id: 'land_surveyor',        label: 'Land Surveyor' },
      { id: 'quantity_surveyor',    label: 'Quantity Surveyor' },
      { id: 'property_valuer',      label: 'Property Valuer / Appraiser' },
      { id: 'building_surveyor',    label: 'Building Surveyor' },
    ],
  },
  {
    group: 'Inspection & Engineering',
    options: [
      { id: 'property_inspector',   label: 'Property Inspector' },
      { id: 'structural_engineer',  label: 'Structural Engineer' },
      { id: 'civil_engineer',       label: 'Civil Engineer' },
      { id: 'electrical_engineer',  label: 'Electrical Engineer' },
      { id: 'mechanical_engineer',  label: 'Mechanical Engineer' },
    ],
  },
  {
    group: 'Legal & Finance',
    options: [
      { id: 'real_estate_lawyer',   label: 'Real Estate Lawyer' },
      { id: 'conveyancer',          label: 'Conveyancer' },
      { id: 'mortgage_lender',      label: 'Mortgage Lender' },
      { id: 'mortgage_broker',      label: 'Mortgage Broker' },
      { id: 'financial_advisor',    label: 'Financial Advisor (Property)' },
    ],
  },
  {
    group: 'Architecture & Design',
    options: [
      { id: 'architect',            label: 'Architect' },
      { id: 'interior_designer',    label: 'Interior Designer' },
      { id: 'urban_planner',        label: 'Urban Planner' },
      { id: 'landscape_architect',  label: 'Landscape Architect' },
    ],
  },
  {
    group: 'Construction & Trades',
    options: [
      { id: 'building_contractor',  label: 'Building Contractor' },
      { id: 'plumber',              label: 'Plumber' },
      { id: 'electrician',          label: 'Electrician' },
      { id: 'painter',              label: 'Painter / Decorator' },
      { id: 'tiler',                label: 'Tiler / Floor Layer' },
      { id: 'carpenter',            label: 'Carpenter / Joiner' },
    ],
  },
  {
    group: 'Property Management',
    options: [
      { id: 'property_manager',     label: 'Property Manager' },
      { id: 'facility_manager',     label: 'Facility Manager' },
      { id: 'estate_manager',       label: 'Estate Manager' },
      { id: 'property_agent',       label: 'Property Agent / Realtor' },
    ],
  },
  {
    group: 'Development & Investment',
    options: [
      { id: 'property_developer',   label: 'Property Developer' },
      { id: 'real_estate_investor', label: 'Real Estate Investor' },
      { id: 'land_developer',       label: 'Land Developer' },
    ],
  },
]

// Flat map for easy lookup
const ALL_PROFESSIONS = PROFESSION_GROUPS.flatMap(g => g.options)

// Map a profession id to a PROFESSIONAL_PLANS key for billing
// Most map to 'surveyor' at N25,000/month; adjust per profession type
const planKeyFor = (id) => {
  if (!id || id === 'other') return 'surveyor'
  if (id.includes('lawyer') || id.includes('conveyancer')) return 'lawyer'
  if (id.includes('lender') || id.includes('broker') || id.includes('advisor')) return 'lender'
  if (id.includes('inspector') || id.includes('engineer') || id.includes('architect')) return 'inspector'
  return 'surveyor'
}

export default function ApplyProfessionalPage() {
  const { user, profile } = useAuth()
  const { requireVerification } = useVerificationGuard()
  const navigate = useNavigate()
  const [step, setStep]         = useState(0)
  const [saving, setSaving]     = useState(false)
  const [planType, setPlanType] = useState('monthly')
  const [showDropdown, setShowDropdown] = useState(false)

  const [form, setForm] = useState({
    profession_id:   '',   // selected from dropdown
    custom_profession: '', // typed if 'other' selected
    full_name:       profile?.full_name || '',
    company:         '',
    phone:           profile?.phone || '',
    email:           user?.email || '',
    license_no:      '',
    years_exp:       '',
    coverage_areas:  '',
    bio:             '',
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const selectedLabel = form.profession_id === 'other'
    ? (form.custom_profession || 'Other (specify below)')
    : ALL_PROFESSIONS.find(p => p.id === form.profession_id)?.label || ''

  const professionForDB = form.profession_id === 'other'
    ? (form.custom_profession || 'Other')
    : selectedLabel

  const planKey = planKeyFor(form.profession_id)
  const plan    = PROFESSIONAL_PLANS[planKey]

  const canProceed = () => {
    if (step === 0) {
      if (!form.profession_id) return false
      if (form.profession_id === 'other' && !form.custom_profession.trim()) return false
      return true
    }
    if (step === 1) return form.full_name && form.phone && form.email
    return true
  }

  const handleNext = () => {
    if (!canProceed()) { toast.error('Please fill in all required fields'); return }
    setStep(s => s + 1)
  }

  const handlePay = async () => {
    if (!user) { toast.error('Please sign in first'); return }

    // Providers should not go live until verification is approved - this
    // sends unverified applicants to /verify-identity first and brings them
    // straight back here afterward. (The webhook and a DB trigger also
    // enforce this server-side, so this is a friendlier front door, not the
    // only line of defense.)
    const ok = await requireVerification('list_service')
    if (!ok) return

    setSaving(true)

    const monthlyFee = planType === 'annual' ? plan.annualFee : plan.monthlyFee

    // Insert using live schema column names exactly
    const { data: application, error } = await supabase
      .from('professional_applications')
      .insert({
        user_id:           user.id,
        professional_type: professionForDB,   // the actual profession label/name
        full_name:         form.full_name,
        company_name:      form.company || null,
        phone:             form.phone,
        email:             form.email,
        license_number:    form.license_no || null,
        coverage_areas:    form.coverage_areas || null,
        plan_type:         planType,
        status:            'pending',
      })
      .select('id')
      .single()

    if (error || !application) {
      toast.error('Could not save application: ' + (error?.message || 'unknown error'))
      setSaving(false)
      return
    }

    await subscribeProfessional({
      applicationId:    application.id,
      userId:           user.id,
      professionalType: planKey,
      email:            form.email,
      planType,
      onSuccess: () => {
        toast.success('Payment received! Your profile goes live shortly.')
        navigate('/professionals')
      },
      onClose: () => {
        toast('Payment cancelled. You can complete it anytime.', { icon: 'ℹ️' })
        setSaving(false)
      },
    })
  }

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(201,106,58,0.1)' }}>
            <Briefcase size={22} style={{ color: '#C96A3A' }} />
          </div>
          <h1 className="font-display text-2xl font-black" style={{ color: '#1A1210' }}>
            Join as a Professional
          </h1>
          <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>
            Get matched with clients actively looking for your services on DealMatch.
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-1.5 flex-1 rounded-full transition-all"
              style={{ backgroundColor: i <= step ? '#C96A3A' : '#E8DDD2' }} />
          ))}
        </div>

        {/* ── STEP 0: Profession selector ── */}
        {step === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-4">
            <div>
              <p className="text-sm font-bold mb-1" style={{ color: '#1A1210' }}>
                What is your profession?
              </p>
              <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>
                Select from the list below, or choose "Other" to type your own.
              </p>

              {/* Custom dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDropdown(v => !v)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 text-sm text-left flex items-center justify-between transition-all"
                  style={{
                    borderColor: form.profession_id ? '#C96A3A' : '#E8DDD2',
                    backgroundColor: '#FFFAF5',
                    color: form.profession_id ? '#1A1210' : '#8A7E78',
                  }}>
                  <span>{form.profession_id ? selectedLabel : 'Select your profession'}</span>
                  <ChevronDown size={16} style={{
                    color: '#8A7E78',
                    transform: showDropdown ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }} />
                </button>

                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl shadow-xl z-50 overflow-hidden"
                    style={{ backgroundColor: '#FFFAF5', border: '1px solid #E8DDD2', maxHeight: 320, overflowY: 'auto' }}>

                    {PROFESSION_GROUPS.map(group => (
                      <div key={group.group}>
                        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: '#F5EDE0', color: '#8A7E78' }}>
                          {group.group}
                        </div>
                        {group.options.map(opt => (
                          <button key={opt.id} type="button"
                            onClick={() => {
                              setForm(f => ({ ...f, profession_id: opt.id, custom_profession: '' }))
                              setShowDropdown(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                            style={{
                              backgroundColor: form.profession_id === opt.id
                                ? 'rgba(201,106,58,0.08)' : 'transparent',
                              color: form.profession_id === opt.id ? '#C96A3A' : '#1A1210',
                            }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ))}

                    {/* Other option */}
                    <div>
                      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: '#F5EDE0', color: '#8A7E78' }}>
                        Not listed?
                      </div>
                      <button type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, profession_id: 'other' }))
                          setShowDropdown(false)
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                        style={{
                          backgroundColor: form.profession_id === 'other'
                            ? 'rgba(201,106,58,0.08)' : 'transparent',
                          color: form.profession_id === 'other' ? '#C96A3A' : '#1A1210',
                        }}>
                        Other - I will specify below
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom profession text input - shown only when "Other" is selected */}
              {form.profession_id === 'other' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3">
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                    Your Profession *
                  </label>
                  <input
                    value={form.custom_profession}
                    onChange={set('custom_profession')}
                    placeholder="e.g. Environmental Consultant, Geotechnical Engineer..."
                    className="w-full px-4 py-3 rounded-xl border text-sm"
                    style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }}
                    autoFocus
                  />
                </motion.div>
              )}
            </div>

            {/* Preview chip of selected profession */}
            {form.profession_id && form.profession_id !== 'other' && (
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(122,158,126,0.08)', border: '1px solid rgba(122,158,126,0.2)' }}>
                <Check size={14} style={{ color: '#7A9E7E', flexShrink: 0 }} />
                <p className="text-xs" style={{ color: '#5C4A3A' }}>
                  <strong>{selectedLabel}</strong> selected. All types are listed at N25,000/month.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── STEP 1: Personal details ── */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-4">

            <div className="p-3 rounded-xl mb-2"
              style={{ backgroundColor: 'rgba(201,106,58,0.06)', border: '1px solid rgba(201,106,58,0.15)' }}>
              <p className="text-xs" style={{ color: '#C96A3A' }}>
                Listing as: <strong>{professionForDB}</strong>
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                Full Name *
              </label>
              <input value={form.full_name} onChange={set('full_name')}
                placeholder="Your legal full name"
                className="w-full px-4 py-3 rounded-xl border text-sm"
                style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                Company / Firm (optional)
              </label>
              <input value={form.company} onChange={set('company')}
                placeholder="e.g. ABC Surveyors Ltd"
                className="w-full px-4 py-3 rounded-xl border text-sm"
                style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                  Phone *
                </label>
                <input value={form.phone} onChange={set('phone')}
                  placeholder="08012345678"
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                  Email *
                </label>
                <input value={form.email} onChange={set('email')}
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                  License / Reg. No. (optional)
                </label>
                <input value={form.license_no} onChange={set('license_no')}
                  placeholder="NIS/2024/001"
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                  Years of Experience
                </label>
                <input type="number" min="0" max="50"
                  value={form.years_exp} onChange={set('years_exp')}
                  placeholder="5"
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                Coverage Areas
              </label>
              <input value={form.coverage_areas} onChange={set('coverage_areas')}
                placeholder="e.g. Uyo, Port Harcourt, Lagos"
                className="w-full px-4 py-3 rounded-xl border text-sm"
                style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#5C4A3A' }}>
                Short Bio (optional)
              </label>
              <textarea value={form.bio} onChange={set('bio')} rows={3}
                placeholder="Tell clients about your experience and specialisation..."
                className="w-full px-4 py-3 rounded-xl border text-sm resize-none"
                style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5', color: '#1A1210' }} />
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Plan & payment ── */}
        {step === 2 && plan && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl border p-5 mb-4"
              style={{ borderColor: '#E8DDD2', backgroundColor: '#FFFAF5' }}>
              <p className="text-sm font-bold mb-3" style={{ color: '#1A1210' }}>
                {professionForDB} - What you get
              </p>
              {plan.features.map((f, i) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <Check size={14} style={{ color: '#7A9E7E', marginTop: 2, flexShrink: 0 }} />
                  <p className="text-xs" style={{ color: '#5C4A3A' }}>{f}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-5">
              {[
                { id: 'monthly', label: 'Monthly', price: plan.monthlyFee },
                { id: 'annual',  label: 'Annual (save 10%)', price: plan.annualFee },
              ].map(p => (
                <button key={p.id} onClick={() => setPlanType(p.id)}
                  className="flex-1 rounded-2xl border-2 p-4 text-left transition-all"
                  style={{
                    borderColor: planType === p.id ? '#C96A3A' : '#E8DDD2',
                    backgroundColor: planType === p.id ? 'rgba(201,106,58,0.05)' : '#FFFAF5',
                  }}>
                  <p className="text-xs font-semibold" style={{ color: '#8A7E78' }}>{p.label}</p>
                  <p className="font-display font-black text-lg" style={{ color: '#1A1210' }}>
                    N{p.price.toLocaleString()}
                  </p>
                </button>
              ))}
            </div>

            <button onClick={handlePay} disabled={saving}
              className="btn-primary w-full py-4 flex items-center justify-center gap-2">
              {saving ? 'Processing...' : 'Pay & Activate Profile'}
              {!saving && <ArrowRight size={16} />}
            </button>
          </motion.div>
        )}

        {/* Nav buttons */}
        {step < 2 && (
          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-5 py-3.5 rounded-2xl text-sm font-semibold border flex items-center gap-2"
                style={{ borderColor: '#E8DDD2', color: '#5C4A3A' }}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button onClick={handleNext}
              className="btn-primary flex-1 py-3.5 flex items-center justify-center gap-2">
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}
        {step === 2 && (
          <button onClick={() => setStep(1)} disabled={saving}
            className="mt-3 w-full py-3 rounded-2xl text-xs font-semibold border flex items-center justify-center gap-2"
            style={{ borderColor: '#E8DDD2', color: '#8A7E78' }}>
            <ArrowLeft size={12} /> Back to details
          </button>
        )}

      </div>
    </div>
  )
}

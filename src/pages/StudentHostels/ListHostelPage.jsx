/**
 * ListHostelPage - /list-hostel
 * ══════════════════════════════
 * Hostel owners list their rooms here.
 * Payment required before listing goes live. Plan prices come from the
 * platform fee registry (hostel_listing_semester, hostel_listing_annual).
 *
 * Security: listing_paid = false until Flutterwave confirms payment.
 * The listing is created in DB immediately but stays in 'pending_review'
 * until payment is confirmed AND an admin/verifier approves it.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Building2, Camera, Car, Check, CreditCard, Droplets, Eye, GraduationCap, HardHat, Info, Lock, MapPin, Plus, Shield, Shirt, Trash2, Upload, Utensils, Wifi, X, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { initializeFlutterwavePayment, generateReference, getFeeAmounts } from '@/lib/flutterwave'
import { usePlatformFees } from '@/lib/platformFees'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const ROOM_TYPES = [
  { id: 'single',       label: 'Single Room',          desc: '1 person per room' },
  { id: 'shared_2',     label: 'Shared (2 per room)',   desc: '2 people sharing' },
  { id: 'shared_4',     label: 'Shared (4 per room)',   desc: '4 people sharing' },
  { id: 'shared_6',     label: 'Shared (6 per room)',   desc: '6 people sharing' },
  { id: 'self_contain', label: 'Self Contain',          desc: 'Private bathroom & kitchen' },
  { id: 'mini_flat',    label: 'Mini Flat',             desc: 'Sitting room + bedroom' },
  { id: '2_bedroom',    label: '2 Bedroom',             desc: 'Full 2-bedroom apartment' },
]

const AMENITIES = [
  { id: 'wifi',     label: 'WiFi',          icon: <Wifi size={18} className="text-terracotta" /> },
  { id: 'gen',      label: 'Generator',     icon: <Zap size={18} className="text-terracotta" /> },
  { id: 'water',    label: 'Running Water', icon: <Droplets size={18} className="text-terracotta" /> },
  { id: 'security', label: 'Security',      icon: <Shield size={18} className="text-terracotta" /> },
  { id: 'fence',    label: 'Fenced',        icon: 'hard-hat' },
  { id: 'cctv',     label: 'CCTV',          icon: <Camera size={18} className="text-terracotta" /> },
  { id: 'parking',  label: 'Parking',       icon: <Car size={18} className="text-terracotta" /> },
  { id: 'kitchen',  label: 'Kitchen',       icon: <Utensils size={18} className="text-terracotta" /> },
  { id: 'study',    label: 'Study Room',    icon: <BookOpen size={18} className="text-terracotta" /> },
  { id: 'laundry',  label: 'Laundry',       icon: <Shirt size={18} className="text-terracotta" /> },
]

const GENDER_OPTIONS = [
  { id: 'mixed',       label: 'Mixed (Male & Female)' },
  { id: 'male_only',   label: 'Male Students Only' },
  { id: 'female_only', label: 'Female Students Only' },
]

const INITIAL_FORM = {
  title: '', description: '', address: '', city: '', state: '',
  institution_id: '', institution_name: '', distance_km: '',
  distance_label: '',
  room_type: '', gender_policy: 'mixed',
  rooms_available: 1, total_rooms: 1,
  price_per_year: '', caution_fee: '', agency_fee: '',
  amenities: [], images: [],
}

const STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]

const STEPS = ['Details', 'Location', 'Amenities', 'Photos', 'Payment']

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-1">
            <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all')}
              style={{
                backgroundColor: i < current ? '#7A9E7E' : i === current ? '#C85F2D' : '#F5EDE0',
                color: i <= current ? '#fff' : '#647068',
              }}>
              {i < current ? <Check size={14} /> : i + 1}
            </div>
            <span className="text-xs hidden sm:block font-medium"
              style={{ color: i === current ? '#C85F2D' : '#647068' }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-0.5 mb-5" style={{ backgroundColor: i < current ? '#7A9E7E' : '#DEDDD6' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

function Input({ label, name, value, onChange, type = 'text', placeholder, required, hint, prefix }) {
  return (
    <div>
      <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
        {label}{required && <span style={{ color: '#C85F2D' }}> *</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: '#647068' }}>{prefix}</span>
        )}
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B',
            paddingLeft: prefix ? '2.5rem' : '1rem',
          }} />
      </div>
      {hint && <p className="text-xs mt-1" style={{ color: '#647068' }}>{hint}</p>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ListHostelPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [step,       setStep]    = useState(0)
  const [form,       setForm]    = useState(INITIAL_FORM)
  const [institutions, setInstitutions] = useState([])
  const [plan,       setPlan]    = useState('semester')
  const [saving,     setSaving]  = useState(false)
  const [hostelId,   setHostelId] = useState(null)
  const [paymentDone, setPaymentDone] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  // Plan prices from the platform fee registry. A price is null while loading.
  const { fees } = usePlatformFees()
  const LISTING_PLANS = getFeeAmounts(fees).HOSTEL_LISTING_PLANS
  const plansReady = !!LISTING_PLANS[plan]?.price

  // institutions table removed - school name is now a free-text input
  // so listing owners can type their school name directly without
  // needing a pre-seeded institutions table in the database.
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleAmenity = (id) => {
    setForm(f => ({
      ...f,
      amenities: f.amenities.includes(id)
        ? f.amenities.filter(a => a !== id)
        : [...f.amenities, id],
    }))
  }

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (form.images.length + files.length > 8) { toast.error('Maximum 8 images'); return }

    setImageUploading(true)
    const uploaded = []
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} is too large (max 5MB)`); continue }
      const ext  = file.name.split('.').pop()
      const path = `hostels/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('property-images').upload(path, file, { upsert: false })
      if (error) { toast.error(`Failed to upload ${file.name}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('property-images').getPublicUrl(path)
      uploaded.push(publicUrl)
    }
    setForm(f => ({ ...f, images: [...f.images, ...uploaded] }))
    setImageUploading(false)
    if (uploaded.length) toast.success(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} uploaded`)
  }

  const removeImage = (url) => setForm(f => ({ ...f, images: f.images.filter(i => i !== url) }))

  // ── Save hostel (pending_review, unpaid) ──────────────────────────────
  const saveHostel = async () => {
    setSaving(true)
    try {
      const selectedInstitution = institutions.find(i => i.id === form.institution_id)
      const payload = {
        owner_id:         user.id,
        title:            form.title.trim(),
        description:      form.description.trim(),
        address:          form.address.trim(),
        city:             form.city.trim(),
        state:            form.state,
        institution_id:   form.institution_id || null,
        institution_name: selectedInstitution?.name || form.institution_name || null,
        distance_km:      form.distance_km ? Number(form.distance_km) : null,
        distance_label:   form.distance_label.trim() || null,
        room_type:        form.room_type,
        gender_policy:    form.gender_policy,
        rooms_available:  Number(form.rooms_available),
        total_rooms:      Number(form.total_rooms),
        price_per_year:   Number(form.price_per_year),
        caution_fee:      form.caution_fee ? Number(form.caution_fee) : 0,
        agency_fee:       form.agency_fee  ? Number(form.agency_fee)  : 0,
        amenities:        form.amenities,
        images:           form.images,
        status:           'pending_review',
        updated_at:       new Date().toISOString(),
      }

      let id = hostelId
      if (id) {
        // listing_paid and payment_ref are not in this payload: only a confirmed
        // payment sets them, so saving a paid listing never un-pays it.
        const { error } = await supabase.from('student_hostels').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('student_hostels').insert({ ...payload, listing_paid: false }).select('id').single()
        if (error) throw error
        id = data.id
        setHostelId(id)
      }
      return id
    } catch (err) {
      toast.error('Failed to save listing. Please try again.')
      console.error(err)
      return null
    } finally {
      setSaving(false)
    }
  }

  // ── Payment ────────────────────────────────────────────────────────────
  const handlePayment = async () => {
    const planMeta  = LISTING_PLANS[plan]
    if (!planMeta?.price) { toast.error('Prices are still loading. Please try again in a moment.'); return }

    const id = hostelId || await saveHostel()
    if (!id) return

    const reference = generateReference()

    // The server creates the payment record and prices the plan from the
    // registry. The browser sends only the hostel and the plan.
    await initializeFlutterwavePayment({
      purpose:   'hostel_listing_fee',
      subject:   { hostel_id: id, plan },
      reference,
      onSuccess: () => {
        // The server unlocks the listing when Flutterwave confirms the charge
        // (api/flutterwave-webhook.js). The browser must not write payment
        // status: anything written here could be forged from the console.
        setPaymentDone(true)
        toast.success('Payment received. Your listing will be activated once it is confirmed.')
      },
      onClose: () => {
        toast('Payment cancelled. Your listing has been saved as a draft.', { icon: 'ℹ️' })
      },
    })
  }

  const canProceed = () => {
    if (step === 0) return form.title && form.room_type && form.price_per_year && form.gender_policy
    if (step === 1) return form.address && form.city && form.state
    if (step === 2) return true
    if (step === 3) return true
    return true
  }

  const handleNext = async () => {
    if (!canProceed()) { toast.error('Please fill in all required fields'); return }
    if (step === 3) {
      // Save before going to payment step
      const id = await saveHostel()
      if (!id) return
    }
    setStep(s => s + 1)
  }

  if (paymentDone) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: 'rgba(122,158,126,0.12)', border: '2px solid rgba(122,158,126,0.4)' }}>
          <Check size={36} style={{ color: '#7A9E7E' }} />
        </div>
        <h1 className="font-display font-black text-2xl mb-3" style={{ color: '#17211B' }}>
          Listing Submitted!
        </h1>
        <p className="text-sm mb-2" style={{ color: '#647068' }}>
          Your hostel listing is under review. We'll verify the details within 24 hours and notify you once it goes live.
        </p>
        <p className="text-xs mb-6" style={{ color: '#647068' }}>
          Students will start seeing your hostel as soon as it's approved.
        </p>
        <div className="flex flex-col gap-3">
          <Link to="/student-hostels" className="w-full py-3.5 rounded-2xl font-bold text-sm text-center transition-all hover:opacity-90"
            style={{ backgroundColor: '#17211B', color: '#FFFAF5' }}>
            Browse Hostels
          </Link>
          <Link to="/dashboard" className="w-full py-3.5 rounded-2xl font-bold text-sm text-center"
            style={{ backgroundColor: '#F5EDE0', color: '#17211B' }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ backgroundColor: '#FFFAF5', minHeight: '100vh', paddingTop: 72 }}>
      <div className="max-w-xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/student-hostels')}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-black/5"
            style={{ backgroundColor: '#F5EDE0' }}>
            <ArrowLeft size={16} style={{ color: '#17211B' }} />
          </button>
          <div>
            <h1 className="font-display font-black text-xl" style={{ color: '#17211B' }}>List Your Hostel</h1>
            <p className="text-xs" style={{ color: '#647068' }}>Reach verified students near your campus</p>
          </div>
        </div>

        <StepBar current={step} total={STEPS.length} />

        <AnimatePresence mode="wait">
          {/* ── Step 0: Room Details ── */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <Input label="Hostel Name" name="title" value={form.title} onChange={set('title')}
                placeholder="e.g. Grace Court Hostel, Peace Villa" required />

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                  Room Type <span style={{ color: '#C85F2D' }}>*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROOM_TYPES.map(r => (
                    <button key={r.id} onClick={() => setVal('room_type', r.id)}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{
                        backgroundColor: form.room_type === r.id ? 'rgba(200,95,45,0.08)' : '#F5EDE0',
                        border: `1.5px solid ${form.room_type === r.id ? '#C85F2D' : 'transparent'}`,
                      }}>
                      <div className="text-xs font-bold" style={{ color: form.room_type === r.id ? '#C85F2D' : '#17211B' }}>{r.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#647068' }}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>Gender Policy <span style={{ color: '#C85F2D' }}>*</span></label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map(g => (
                    <button key={g.id} onClick={() => setVal('gender_policy', g.id)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: form.gender_policy === g.id ? '#17211B' : '#F5EDE0',
                        color: form.gender_policy === g.id ? '#FFFAF5' : '#17211B',
                      }}>
                      {g.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Rooms Available" name="rooms_available" value={form.rooms_available}
                  onChange={set('rooms_available')} type="number" placeholder="1" required />
                <Input label="Total Rooms" name="total_rooms" value={form.total_rooms}
                  onChange={set('total_rooms')} type="number" placeholder="10" />
              </div>

              <Input label="Annual Rent (₦)" name="price_per_year" value={form.price_per_year}
                onChange={set('price_per_year')} type="number" placeholder="120000" prefix="₦" required
                hint="Price students pay per year (academic session)" />

              <div className="grid grid-cols-2 gap-3">
                <Input label="Caution Fee (₦)" name="caution_fee" value={form.caution_fee}
                  onChange={set('caution_fee')} type="number" placeholder="0" prefix="₦"
                  hint="Refundable on exit" />
                <Input label="Agency Fee (₦)" name="agency_fee" value={form.agency_fee}
                  onChange={set('agency_fee')} type="number" placeholder="0" prefix="₦" />
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>Description</label>
                <textarea value={form.description} onChange={set('description')} rows={4}
                  placeholder="Describe your hostel - rules, environment, what makes it great for students…"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }} />
              </div>
            </motion.div>
          )}

          {/* ── Step 1: Location ── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <Input label="Street Address" name="address" value={form.address} onChange={set('address')}
                placeholder="e.g. 14 Adeleke Street, Beside GTBank" required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" name="city" value={form.city} onChange={set('city')} placeholder="e.g. Yaba" required />
                <div>
                  <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>State <span style={{ color: '#C85F2D' }}>*</span></label>
                  <select value={form.state} onChange={set('state')}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: form.state ? '#17211B' : '#647068' }}>
                    <option value="">Select state</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: '#647068' }}>
                  Nearest University / Polytechnic / College *
                </label>
                <input
                  value={form.institution_name}
                  onChange={e => setForm(f => ({ ...f, institution_name: e.target.value, institution_id: '' }))}
                  placeholder="e.g. University of Lagos, University of Ibadan..."
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6', color: '#17211B' }}
                />
                <p className="text-xs mt-1" style={{ color: '#647068' }}>
                  Type your school name exactly as students would search for it.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Distance to Campus (km)" name="distance_km" value={form.distance_km}
                  onChange={set('distance_km')} type="number" placeholder="0.5"
                  hint="Approximate walking distance" />
                <Input label="Distance Label" name="distance_label" value={form.distance_label}
                  onChange={set('distance_label')} placeholder="5 min walk"
                  hint="How students will see it" />
              </div>

              <div className="rounded-2xl p-4 flex items-start gap-3"
                style={{ backgroundColor: 'rgba(200,95,45,0.06)', border: '1px solid rgba(200,95,45,0.15)' }}>
                <Info size={16} style={{ color: '#C85F2D', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: '#647068' }}>
                  A DealMatch verifier may visit the address before activating your listing to protect students from fake hostels.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Amenities ── */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h2 className="font-bold text-base mb-1" style={{ color: '#17211B' }}>What does your hostel offer?</h2>
                <p className="text-sm mb-4" style={{ color: '#647068' }}>Select all that apply. More amenities = more enquiries.</p>
                <div className="grid grid-cols-2 gap-2">
                  {AMENITIES.map(a => (
                    <button key={a.id} onClick={() => toggleAmenity(a.id)}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                      style={{
                        backgroundColor: form.amenities.includes(a.id) ? 'rgba(200,95,45,0.08)' : '#F5EDE0',
                        border: `1.5px solid ${form.amenities.includes(a.id) ? '#C85F2D' : 'transparent'}`,
                      }}>
                      <span>{a.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold" style={{ color: form.amenities.includes(a.id) ? '#C85F2D' : '#17211B' }}>{a.label}</div>
                      </div>
                      {form.amenities.includes(a.id) && <Check size={12} style={{ color: '#C85F2D' }} />}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Photos ── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h2 className="font-bold text-base mb-1" style={{ color: '#17211B' }}>Add Photos</h2>
                <p className="text-sm mb-4" style={{ color: '#647068' }}>
                  Hostels with 4+ clear photos get 3× more enquiries. Max 8 photos, 5MB each.
                </p>

                <label className="block cursor-pointer">
                  <div className="border-2 border-dashed rounded-2xl p-8 text-center transition-all hover:border-orange-300"
                    style={{ borderColor: '#DEDDD6', backgroundColor: '#F5EDE0' }}>
                    {imageUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm" style={{ color: '#647068' }}>Uploading…</span>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} style={{ color: '#C85F2D', margin: '0 auto 8px' }} />
                        <p className="text-sm font-semibold" style={{ color: '#17211B' }}>Click to upload photos</p>
                        <p className="text-xs mt-1" style={{ color: '#647068' }}>JPG, PNG · Max 5MB each</p>
                      </>
                    )}
                  </div>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
                </label>

                {form.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {form.images.map((url, i) => (
                      <div key={url} className="relative rounded-xl overflow-hidden aspect-square">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {i === 0 && (
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                            style={{ backgroundColor: 'rgba(23,33,27,0.7)', color: '#fff' }}>Cover</div>
                        )}
                        <button onClick={() => removeImage(url)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(200,95,45,0.9)' }}>
                          <X size={12} style={{ color: '#fff' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Payment ── */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h2 className="font-bold text-base mb-1" style={{ color: '#17211B' }}>Choose Your Listing Plan</h2>
                <p className="text-sm mb-4" style={{ color: '#647068' }}>
                  Students browse for free - you pay a small fee to list your hostel.
                </p>

                <div className="space-y-3 mb-6">
                  {Object.entries(LISTING_PLANS).map(([key, p]) => (
                    <button key={key} onClick={() => setPlan(key)}
                      className="w-full p-4 rounded-2xl text-left transition-all"
                      style={{
                        backgroundColor: plan === key ? 'rgba(200,95,45,0.06)' : '#F5EDE0',
                        border: `2px solid ${plan === key ? '#C85F2D' : 'transparent'}`,
                      }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm" style={{ color: '#17211B' }}>{p.name}</span>
                            {p.badge && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                                style={{ backgroundColor: plan === key ? '#C85F2D' : '#DEDDD6', color: plan === key ? '#fff' : '#647068' }}>
                                {p.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: '#647068' }}>{p.duration}</div>
                          {p.saving && <div className="text-xs mt-0.5 font-semibold" style={{ color: '#7A9E7E' }}>{p.saving}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-black text-lg" style={{ color: plan === key ? '#C85F2D' : '#17211B' }}>
                            {p.price ? `₦${p.price.toLocaleString()}` : '...'}
                          </div>
                          {plan === key && <Check size={14} style={{ color: '#C85F2D', marginLeft: 'auto' }} />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* What's included */}
                <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#F5EDE0', border: '1px solid #DEDDD6' }}>
                  <h4 className="font-bold text-sm mb-3" style={{ color: '#17211B' }}>What's included</h4>
                  {[
                    'Listed on the student hostels page',
                    'Visible to all verified students near your school',
                    'Enquiries via WhatsApp and in-app',
                    'Verified badge after inspection',
                    'Edit or pause your listing anytime',
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2 mb-2">
                      <Check size={12} style={{ color: '#7A9E7E', flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: '#17211B' }}>{f}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl p-3 flex items-start gap-2" style={{ backgroundColor: 'rgba(122,158,126,0.08)', border: '1px solid rgba(122,158,126,0.2)' }}>
                  <Shield size={14} style={{ color: '#7A9E7E', flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs" style={{ color: '#647068' }}>
                    Payment is secured by Flutterwave. Your listing goes live within 24hrs of payment + verification.
                  </p>
                </div>

                <button onClick={handlePayment} disabled={saving || !plansReady}
                  className="w-full py-4 rounded-2xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  style={{ backgroundColor: '#C85F2D', color: '#fff' }}>
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : !plansReady
                      ? 'Loading prices...'
                      : <><CreditCard size={16} /> Pay ₦{LISTING_PLANS[plan].price.toLocaleString()} - Go Live</>}
                </button>

                <p className="text-xs text-center mt-3" style={{ color: '#647068' }}>
                  Your listing is saved as a draft. Pay anytime to activate it.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        {step < 4 && (
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
                style={{ backgroundColor: '#F5EDE0', color: '#17211B' }}>
                Back
              </button>
            )}
            <button onClick={handleNext} disabled={saving || !canProceed()}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: canProceed() ? '#17211B' : '#DEDDD6', color: canProceed() ? '#FFFAF5' : '#647068' }}>
              {saving
                ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <>{step === 3 ? 'Save & Continue' : 'Continue'} <ArrowRight size={14} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

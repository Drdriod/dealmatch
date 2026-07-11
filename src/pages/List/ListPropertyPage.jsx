import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building, Building2, Camera, Check, CheckCircle, Home, Leaf, MapPin, Store, Upload, Video, X } from 'lucide-react'
import { createProperty, supabase } from '@/lib/supabase'
import { indexProperty } from '@/lib/pinecone'
import { analytics } from '@/lib/posthog'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]
const FEATURES = [
  'Swimming Pool','Boys Quarters','Gym','Gated Estate','Solar Power',
  'Borehole','CCTV','Parking','Garden','Smart Home','Prepaid Meter','Perforated Fence',
]
const TYPES = [
  { id:'land',       label:'Land / Plot',      icon: <Leaf size={20} className="text-terracotta" /> },
  { id:'apartment',  label:'Apartment',         icon: <Building2 size={20} className="text-terracotta" /> },
  { id:'duplex',     label:'Duplex',            icon: <Building2 size={20} className="text-terracotta" /> },
  { id:'detached',   label:'Detached Home',    icon: <Home size={20} className="text-terracotta" /> },
  { id:'terrace',    label:'Terrace',           icon: <Home size={20} className="text-terracotta" /> },
  { id:'commercial', label:'Commercial',        icon: <Store size={20} className="text-terracotta" /> },
]
const DOCS = [
  'Certificate of Occupancy (C of O)',
  'Right of Occupancy (R of O)',
  'Deed of Assignment',
  'Registered Survey Plan',
  'Building Approval',
  'Gazette',
]
const LISTING_TYPES = ['For Sale','Joint Venture','Off-Plan']

const INITIAL = {
  title:'', property_type:'', listing_type:'For Sale',
  price:'', state:'', city:'', address:'',
  bedrooms:'', bathrooms:'', size_sqm:'',
  description:'', features:[], documents:[],
  images:[], video_url:'',
}

// ── Upload a single image file to Supabase Storage ────────
async function uploadImageToSupabase(file, userId) {
  const ext      = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabase.storage
    .from('property-images')           // ← your bucket name
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) throw new Error(`Image upload failed: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from('property-images')
    .getPublicUrl(data.path)

  return urlData.publicUrl
}

export default function ListPropertyPage() {
  const { user }          = useAuth()
  const navigate          = useNavigate()
  const { requireVerification } = useVerificationGuard()
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [saved,  setSaved]  = useState(false)
  const [form,   setForm]   = useState(INITIAL)
  const [agreed, setAgreed] = useState(false)

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setE   = (k)    => (e) => set(k, e.target.value)
  const toggle = (k, v) => set(k, form[k].includes(v)
    ? form[k].filter(x => x !== v)
    : [...form[k], v])

  const isLandType = form.property_type === 'land' || form.property_type === 'commercial'

  const steps = [
    // ── Step 0: Basics ──────────────────────────────────
    {
      title: 'Property basics',
      valid: () => !!form.property_type && !!form.title,
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{color:'#1A1210'}}>Property basics</h2>
            <p className="text-sm" style={{color:'#8A7E78'}}>Tell us what type of property you're selling.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>Property Type *</label>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => set('property_type', t.id)}
                  className="p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-3"
                  style={{
                    borderColor: form.property_type === t.id ? '#C96A3A' : '#E8DDD2',
                    backgroundColor: form.property_type === t.id ? 'rgba(201,106,58,0.05)' : '#FFFFFF',
                  }}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-sm font-semibold" style={{color:'#1A1210'}}>{t.label}</span>
                  {form.property_type === t.id && <Check size={14} style={{color:'#C96A3A', marginLeft:'auto', flexShrink:0}} />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>Listing Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {LISTING_TYPES.map(lt => (
                <button key={lt} type="button" onClick={() => set('listing_type', lt)}
                  className="py-3 rounded-xl border-2 text-sm font-semibold transition-all"
                  style={{
                    borderColor: form.listing_type === lt ? '#C96A3A' : '#E8DDD2',
                    color: form.listing_type === lt ? '#C96A3A' : '#8A7E78',
                    backgroundColor: form.listing_type === lt ? 'rgba(201,106,58,0.05)' : '#FFFFFF',
                  }}>
                  {lt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Property Title *</label>
            <input className="input" type="text"
              placeholder="e.g. 4-Bed Detached Duplex with Pool"
              value={form.title} onChange={setE('title')}
              style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
          </div>
        </div>
      ),
    },

    // ── Step 1: Location & Price ─────────────────────────
    {
      title: 'Location & price',
      valid: () => !!form.state && !!form.city && !!form.price,
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{color:'#1A1210'}}>Location & Price</h2>
            <p className="text-sm" style={{color:'#8A7E78'}}>Where is it and how much?</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>State *</label>
            <select className="select" value={form.state} onChange={setE('state')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}}>
              <option value="">Select state...</option>
              {STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>City / Area *</label>
            <input className="input" type="text" placeholder="e.g. Lekki Phase 1"
              value={form.city} onChange={setE('city')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Street Address (optional)</label>
            <input className="input" type="text" placeholder="Shared with serious buyers only"
              value={form.address} onChange={setE('address')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Asking Price (₦) *</label>
            <input className="input" type="number" min="0" placeholder="e.g. 38500000"
              value={form.price} onChange={setE('price')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            {form.price && (() => {
              const gross       = Number(form.price)
              const feeEach     = Math.round(gross * 0.0375)
              const takeHome    = gross - feeEach
              const agentBonus  = Math.round(gross * 0.075 * 0.25)
              return (
                <div className="mt-3 rounded-2xl p-3" style={{backgroundColor:'rgba(122,158,126,0.06)', border:'1px solid rgba(122,158,126,0.2)'}}>
                  <p className="text-xs font-bold mb-2" style={{color:'#4A7A4E'}}>Guaranteed Take-Home Pay</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span style={{color:'#8A7E78'}}>Listing Price</span>
                      <span style={{color:'#1A1210', fontWeight:600}}>₦{gross.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{color:'#8A7E78'}}>DealMatch fee (3.75%)</span>
                      <span style={{color:'#C96A3A'}}>-₦{feeEach.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t pt-1 mt-1" style={{borderColor:'rgba(122,158,126,0.2)'}}>
                      <span className="font-bold" style={{color:'#4A7A4E'}}>You receive</span>
                      <span className="font-black" style={{color:'#4A7A4E'}}>₦{takeHome.toLocaleString()}</span>
                    </div>
                    <p className="text-xs mt-1" style={{color:'rgba(26,18,16,0.35)'}}>
                      The agent who verified your listing earns ₦{agentBonus.toLocaleString()} closing bonus on deal completion.
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      ),
    },

    // ── Step 2: Details & Features ───────────────────────
    {
      title: 'Details & features',
      valid: () => !!form.size_sqm,
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{color:'#1A1210'}}>Details & Features</h2>
            <p className="text-sm" style={{color:'#8A7E78'}}>Size, rooms, and what's included.</p>
          </div>
          <div className={clsx('grid gap-3', isLandType ? 'grid-cols-1' : 'grid-cols-3')}>
            {!isLandType && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Beds</label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={form.bedrooms} onChange={setE('bedrooms')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Baths</label>
                  <input className="input" type="number" min="0" placeholder="0"
                    value={form.bathrooms} onChange={setE('bathrooms')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>Size (sqm) *</label>
              <input className="input" type="number" min="0" placeholder="e.g. 400"
                value={form.size_sqm} onChange={setE('size_sqm')} style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>Features & Amenities</label>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map(f => (
                <button key={f} type="button" onClick={() => toggle('features', f)}
                  className="px-3 py-2 rounded-full text-xs font-medium border-2 transition-all"
                  style={{
                    borderColor: form.features.includes(f) ? '#C96A3A' : '#E8DDD2',
                    backgroundColor: form.features.includes(f) ? '#C96A3A' : '#FFFFFF',
                    color: form.features.includes(f) ? '#FFFFFF' : '#5C4A3A',
                  }}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>Available Documents</label>
            <div className="flex flex-wrap gap-2">
              {DOCS.map(d => (
                <button key={d} type="button" onClick={() => toggle('documents', d)}
                  className="px-3 py-2 rounded-full text-xs font-medium border-2 transition-all"
                  style={{
                    borderColor: form.documents.includes(d) ? '#7A9E7E' : '#E8DDD2',
                    backgroundColor: form.documents.includes(d) ? '#7A9E7E' : '#FFFFFF',
                    color: form.documents.includes(d) ? '#FFFFFF' : '#5C4A3A',
                  }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },

    // ── Step 3: Photos & Video ───────────────────────────
    // FIX 1: valid() now requires at least 1 photo uploaded
    {
      title: 'Photos & Video',
      valid: () => form.images.length > 0,
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{color:'#1A1210'}}>Photos & Video</h2>
            <p className="text-sm" style={{color:'#8A7E78'}}>
              Properties with photos get 5× more enquiries. At least <strong>1 photo is required</strong>.
            </p>
          </div>

          {/* Photo upload */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>
              Photos {form.images.length > 0
                ? <span style={{color:'#7A9E7E'}}>({form.images.length} added)</span>
                : <span style={{color:'#C96A3A'}}>* required</span>}
            </label>

            {/* Red border hint when no photos yet */}
            <div
              className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all"
              style={{
                borderColor: form.images.length > 0 ? '#7A9E7E' : '#C96A3A',
                backgroundColor: form.images.length > 0 ? 'rgba(122,158,126,0.04)' : 'rgba(201,106,58,0.03)',
              }}
              onClick={() => document.getElementById('prop-photo-upload').click()}>
              <div className="flex justify-center mb-3">{form.images.length > 0 ? <CheckCircle size={40} className="text-green-600" /> : <Camera size={40} className="text-muted" />}</div>
              <p className="font-semibold text-sm mb-1" style={{color:'#1A1210'}}>
                {form.images.length > 0 ? `${form.images.length} photo${form.images.length > 1 ? 's' : ''} added: tap to add more` : 'Tap to upload photos'}
              </p>
              <p className="text-xs" style={{color: form.images.length === 0 ? '#C96A3A' : '#8A7E78'}}>
                {form.images.length === 0
                  ? 'At least 1 photo required to continue'
                  : 'JPG, PNG up to 10MB. Show front, rooms, compound, surroundings.'}
              </p>
              <input id="prop-photo-upload" type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files)
                  const newImgs = files.map((f, i) => ({
                    url: URL.createObjectURL(f),
                    is_primary: form.images.length === 0 && i === 0,
                    file: f,
                  }))
                  set('images', [...form.images, ...newImgs])
                  toast.success(`${files.length} photo${files.length > 1 ? 's' : ''} added!`)
                }} />
            </div>

            {/* Photo preview grid */}
            {form.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.images.map((img, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2"
                    style={{borderColor: img.is_primary ? '#C96A3A' : '#E8DDD2'}}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    {img.is_primary && (
                      <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] py-0.5 font-bold"
                        style={{backgroundColor:'rgba(201,106,58,0.9)', color:'#FFFFFF'}}>
                        Main
                      </div>
                    )}
                    <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity"
                      style={{backgroundColor:'rgba(0,0,0,0.5)'}}>
                      {!img.is_primary && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const imgs = form.images.map((x, j) => ({ ...x, is_primary: j === i }))
                            set('images', imgs)
                          }}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{backgroundColor:'#C96A3A', color:'#FFFFFF'}}>
                          Main
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          set('images', form.images.filter((_, j) => j !== i))
                        }}
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{backgroundColor:'rgba(26,18,16,0.8)'}}>
                        <X size={10} color="white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{color:'rgba(26,18,16,0.5)'}}>
              Video Tour (optional but strongly recommended)
            </label>
            <div
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
              style={{
                borderColor: form.video_url ? '#7A9E7E' : '#E8DDD2',
                backgroundColor: form.video_url ? 'rgba(122,158,126,0.04)' : 'rgba(212,168,83,0.02)',
              }}
              onClick={() => !form.video_url && document.getElementById('prop-video-upload').click()}>
              <div className="flex justify-center mb-3">{form.video_url ? <CheckCircle size={40} className="text-green-600" /> : <Video size={40} className="text-muted" />}</div>
              <p className="font-semibold text-sm mb-1" style={{color:'#1A1210'}}>
                {form.video_url ? 'Video uploaded!' : 'Record or upload a video tour'}
              </p>
              <p className="text-xs" style={{color:'#8A7E78'}}>
                Walk through the property on camera. Max 2 minutes. MP4 or MOV.
              </p>
              <input id="prop-video-upload" type="file" accept="video/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) {
                    set('video_url', URL.createObjectURL(file))
                    toast.success('Video added! Buyers will love this.')
                  }
                }} />
            </div>

            {form.video_url && (
              <div className="mt-3 relative rounded-2xl overflow-hidden">
                <video src={form.video_url} controls className="w-full rounded-2xl" style={{maxHeight:220}} />
                <button
                  onClick={() => set('video_url', '')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{backgroundColor:'rgba(26,18,16,0.7)'}}>
                  <X size={12} color="white" />
                </button>
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{color:'rgba(26,18,16,0.5)'}}>
                Or paste a YouTube / Loom link
              </label>
              <input className="input" type="url"
                placeholder="https://youtube.com/watch?v=..."
                value={form.video_url?.startsWith('blob') ? '' : form.video_url}
                onChange={setE('video_url')}
                style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            </div>
          </div>

          <div className="p-4 rounded-2xl" style={{backgroundColor:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.2)'}}>
            <p className="text-xs font-semibold mb-1" style={{color:'#8A6A20'}}>Pro tip</p>
            <p className="text-xs leading-relaxed" style={{color:'#8A7E78'}}>
              Listings with a video tour get 5× more serious enquiries. Just walk through the property on your phone: no editing needed.
            </p>
          </div>
        </div>
      ),
    },

    // ── Step 4: Description ──────────────────────────────
    {
      title: 'Description',
      valid: () => form.description.length >= 50,
      content: (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{color:'#1A1210'}}>Description</h2>
            <p className="text-sm" style={{color:'#8A7E78'}}>Describe the property in your own words.</p>
          </div>
          <div>
            <textarea className="input resize-none" rows={8}
              placeholder="Describe the property: location, features, access roads, nearby landmarks, title status, and why it's a great buy. Minimum 50 characters."
              value={form.description} onChange={setE('description')}
              style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            <p className="text-xs mt-1.5" style={{color: form.description.length >= 50 ? '#7A9E7E' : '#8A7E78'}}>
              {form.description.length} / 50 min characters
            </p>
          </div>
          <div className="p-4 rounded-2xl" style={{backgroundColor:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.2)'}}>
            <p className="text-xs font-semibold mb-1" style={{color:'#8A6A20'}}>Pro tip</p>
            <p className="text-xs leading-relaxed" style={{color:'#8A7E78'}}>
              Listings with detailed descriptions get 3× more matches. Mention proximity to landmarks, road access, and title status.
            </p>
          </div>
        </div>
      ),
    },
  ]

  const current = steps[step]
  const isLast  = step === steps.length - 1

  const handleNext = async () => {
    const verified = await requireVerification('sell')
    if (!verified) return

    // FIX 1c: Clear validation message per step
    if (!current.valid()) {
      if (step === 3 && form.images.length === 0) {
        toast.error('Please upload at least 1 photo to continue')
      } else {
        toast.error('Please complete all required fields')
      }
      return
    }

    if (isLast) {
      handleSubmit()
    } else {
      setStep(s => s + 1)
    }
  }

  // FIX 2: Upload images to Supabase Storage FIRST, then insert property
  const handleSubmit = async () => {
    if (!agreed) {
      toast.error('Please agree to the listing terms to publish')
      return
    }
    if (!user?.id) {
      toast.error('You must be logged in to list a property')
      return
    }

    setSaving(true)

    try {
      // Step A: Upload all images to Supabase Storage
      setUploadProgress('Uploading photos...')
      const uploadedImages = []

      for (let i = 0; i < form.images.length; i++) {
        const img = form.images[i]
        setUploadProgress(`Uploading photo ${i + 1} of ${form.images.length}...`)

        // If it's a blob (local file), upload it
        if (img.url.startsWith('blob:') && img.file) {
          try {
            const publicUrl = await uploadImageToSupabase(img.file, user.id)
            uploadedImages.push({
              url: publicUrl,
              is_primary: img.is_primary,
            })
          } catch (uploadErr) {
            console.error('Image upload error:', uploadErr)
            // Don't block listing: skip failed image and warn
            toast.error(`Photo ${i + 1} could not be uploaded and was skipped.`)
          }
        } else {
          // Already a URL (YouTube link etc) : keep as is
          uploadedImages.push({ url: img.url, is_primary: img.is_primary })
        }
      }

      // Step B: Build and insert the property record
      setUploadProgress('Publishing your listing...')

      const payload = {
        title:        form.title,
        property_type: form.property_type,
        listing_type: form.listing_type,
        price:        Number(form.price),
        state:        form.state,
        city:         form.city,
        address:      form.address || null,
        bedrooms:     form.bedrooms  ? Number(form.bedrooms)  : null,
        bathrooms:    form.bathrooms ? Number(form.bathrooms) : null,
        size_sqm:     Number(form.size_sqm),
        description:  form.description,
        features:     form.features,
        documents:    form.documents,
        video_url:    form.video_url || null,
        seller_id:    user.id,
        status:       'pending_review',  // agent must verify on-site before going live
        category:     'sale',
        // FIX 2b: Pass cleaned uploaded URLs, not blob objects
        images:       uploadedImages,
      }

      const { data, error } = await createProperty(payload)

      if (error) {
        console.error('createProperty error:', error)
        // FIX 2c: Show the actual error so you know what's wrong
        toast.error(`Could not publish: ${error.message || 'Unknown error'}`)
        setSaving(false)
        setUploadProgress('')
        return
      }

      // Step C: Index in Pinecone (don't let this failure block the success)
      try {
        setUploadProgress('Finalising...')
        await indexProperty(data)
        analytics.propertyListed(data.id, data.property_type)
      } catch (indexErr) {
        console.warn('Pinecone index failed (non-blocking):', indexErr)
      }

      setSaved(true)

    } catch (err) {
      console.error('Unexpected error during submit:', err)
      toast.error(`Something went wrong: ${err.message || 'Please try again'}`)
      setSaving(false)
      setUploadProgress('')
    }
  }

  // ── Success screen ──────────────────────────────────────
  if (saved) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{backgroundColor:'#FFFAF5'}}>
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-5"><CheckCircle size={56} className="text-green-600" /></div>
          <h1 className="font-display text-3xl font-black mb-2" style={{color:'#1A1210'}}>
            Listing Submitted!
          </h1>
          <div className="rounded-2xl p-4 mb-6 text-left" style={{backgroundColor:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.25)'}}>
            <p className="text-sm font-bold mb-1" style={{color:'#D4A853'}}>Pending Verification</p>
            <p className="text-xs leading-relaxed" style={{color:'#8A7E78'}}>
              Your listing is live with an <strong>"Unverified"</strong> badge while our field agent schedules an on-site visit. Once verified, it becomes fully active and starts matching with buyers. You'll receive a notification when it's approved.
            </p>
          </div>
          <div className="space-y-3">
            <button onClick={() => navigate('/browse')} className="btn-primary w-full py-4 text-base">
              Browse Other Properties →
            </button>
            <button onClick={() => navigate('/list')}
              className="w-full py-4 rounded-2xl text-sm font-semibold border-2 transition-all"
              style={{borderColor:'#E8DDD2', color:'#5C4A3A', backgroundColor:'#FFFFFF'}}>
              + List Another Property
            </button>
            <button onClick={() => navigate('/dashboard')}
              className="w-full py-4 rounded-2xl text-sm font-semibold transition-all"
              style={{color:'#8A7E78'}}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{backgroundColor:'#FFFAF5'}}>
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-black mb-1" style={{color:'#1A1210'}}>List a Property</h1>
          <p className="text-sm" style={{color:'#8A7E78'}}>Step {step + 1} of {steps.length} : {current.title}</p>
          <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{backgroundColor:'rgba(26,18,16,0.08)'}}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{width:`${((step + 1) / steps.length) * 100}%`, backgroundColor:'#C96A3A'}} />
          </div>
        </div>

        {/* Step content */}
        <div>{current.content}</div>

      {/* Listing Terms */}
      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border-2 p-4 transition-all cursor-pointer"
          style={{ borderColor: agreed ? '#C96A3A' : '#E8DDD2', backgroundColor: agreed ? 'rgba(201,106,58,0.04)' : '#FFFFFF' }}
          onClick={() => setAgreed(v => !v)}>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
              style={{ borderColor: agreed ? '#C96A3A' : '#E8DDD2', backgroundColor: agreed ? '#C96A3A' : 'transparent' }}>
              {agreed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1A1210' }}>
                I agree to DealMatch Listing Terms
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8A7E78' }}>
                I confirm this property is mine or I have authority to list it. I agree to DealMatch's{' '}
                <a href="/terms" target="_blank" className="underline" style={{ color: '#C96A3A' }}>Terms of Service</a> and{' '}
                <a href="/privacy" target="_blank" className="underline" style={{ color: '#C96A3A' }}>Privacy Policy</a>.
              </p>
            </div>
          </div>
        </div>
      </div>

        {/* Upload progress indicator */}
        {saving && uploadProgress && (
          <div className="mt-4 p-3 rounded-xl flex items-center gap-3"
            style={{backgroundColor:'rgba(201,106,58,0.08)', border:'1px solid rgba(201,106,58,0.2)'}}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              border: '2px solid rgba(201,106,58,0.2)',
              borderTop: '2px solid #C96A3A',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p className="text-xs font-medium" style={{color:'#C96A3A'}}>{uploadProgress}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} disabled={saving}
              className="flex items-center gap-2 px-5 py-4 rounded-2xl text-sm font-semibold transition-all"
              style={{border:'1.5px solid #E8DDD2', color:'rgba(26,18,16,0.5)', backgroundColor:'#FFFFFF'}}>
              <ArrowLeft size={16} />
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving || !current.valid()}
            className={clsx(
              'btn-primary flex-1 flex items-center justify-center gap-2 py-4',
              (!current.valid() || saving) && 'opacity-40 cursor-not-allowed'
            )}>
            {saving
              ? uploadProgress || 'Publishing...'
              : isLast
                ? 'Publish Listing'
                : <>Continue <ArrowRight size={16} /></>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

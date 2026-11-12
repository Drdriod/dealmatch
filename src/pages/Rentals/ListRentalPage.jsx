import React, { useState } from 'react'
import { uploadFile, publicUrlFor } from '@/data/storageRepository'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle, Hotel, PartyPopper, Store, Upload, Video, Wifi, X } from 'lucide-react'
import { stripControlChars } from '@/lib/supabase'
import { insertListedProperty } from '@/data/rentalsRepository'
import { useAuth } from '@/context/AuthContext'
import VerifyReminder from '@/components/ui/VerifyReminder'
import toast from 'react-hot-toast'
import PlaceSubtypePicker from '@/components/ui/PlaceSubtypePicker'

const STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Abuja (FCT)']
const HOTEL_FEATURES  = ['Pool','Restaurant','Bar','Gym','Spa','Wifi','Generator','AC','Room Service','Conference Hall','Parking','Security','CCTV','Laundry','24hr Reception']
const RENTAL_FEATURES = ['Furnished','Wifi','Generator','AC','Security','Parking','Borehole','Prepaid Meter','Pop Ceiling','Tiled Floor','Kitchen','Store','CCTV','Balcony']
async function uploadToStorage(file, userId, folder) {
  const ext  = file.name.split('.').pop()
  const path = `${userId}/${folder}_${Date.now()}.${ext}`
  const { data, error } = await uploadFile('property-images', path, file, { upsert:false, contentType:file.type })
  if (error) throw error
  return publicUrlFor('property-images', data.path)
}

export default function ListRentalPage() {
  const [params]  = useSearchParams()
  const type      = params.get('type') || 'rental'
  const isHotel   = type === 'hotel' || type === 'shortlet'
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const [step,    setStep]    = useState(0)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [listingId, setListingId] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [agreed,  setAgreed]  = useState(false)
  const [progress,setProgress]= useState('')
  const [form,    setForm]    = useState({
    title:'', state:'', city:'', address:'',
    price:'', description:'', features:[], images:[], video_url:'',
    bedrooms:'', bathrooms:'', size_sqm:'', max_guests:'',
    category: type,
    category_id: null,
  })

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const toggle = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }))

  const steps = [
    // Step 1: Basics
    {
      title: isHotel ? 'Hotel basics' : 'Rental basics',
      valid: () => !!form.title && !!form.state && !!form.city && !!form.price,
      content: (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-black mb-1" style={{ color:'var(--dm-deep)' }}>
              {isHotel ? 'List your hotel or short-let' : 'List your rental'}
            </h2>
            <p className="text-sm" style={{ color:'var(--dm-warm)' }}>A DealMatch agent will verify the property before it appears to renters.</p>
          </div>

          {/* Category selector for hotel types */}
          {isHotel && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Type *</label>
              <div className="grid grid-cols-2 gap-2">
                {[['hotel','Hotel'],['shortlet','Short-let']].map(([v,l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, category:v, category_id:null }))}
                    className="py-3 rounded-xl text-sm font-semibold border-2 transition-all"
                    style={{ borderColor: form.category === v ? '#B8511E' : '#DEDDD6', color: form.category === v ? '#B8511E' : '#647068', backgroundColor: form.category === v ? 'rgba(200,95,45,0.05)' : '#FFFFFF' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <PlaceSubtypePicker category={form.category} propertyType="apartment"
            value={form.category_id} onChange={id => setForm(f => ({ ...f, category_id: id }))} />

          {[
            { label: isHotel ? 'Property name *' : 'Listing title *', key:'title', type:'text', placeholder: isHotel ? 'e.g. The Grand Lagos Hotel' : 'e.g. 3-Bed Apartment, Lekki' },
            { label:'City or area *', key:'city', type:'text', placeholder:'e.g. Lekki, Lagos' },
            { label:'Full address',  key:'address', type:'text', placeholder:'Street address (used for agent verification)' },
            { label: isHotel ? 'Starting price per night (₦) *' : 'Annual rent (₦) *', key:'price', type:'number', placeholder:'e.g. 35000' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>State *</label>
            <select className="select" value={form.state} onChange={set('state')} style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }}>
              <option value="">Choose a state</option>
              {STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      ),
    },
    // Step 2: Details + Photos (simplified: single step for hotel/shortlet)
    {
      title: 'Details and photos',
      valid: () => !!form.size_sqm && form.images.length > 0,
      content: (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-black mb-1" style={{ color:'var(--dm-deep)' }}>Details and photos</h2>

          <div className="grid grid-cols-2 gap-3">
            {!isHotel && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Bedrooms</label>
                  <input type="number" min="0" value={form.bedrooms} onChange={set('bedrooms')} placeholder="0"
                    className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Bathrooms</label>
                  <input type="number" min="0" value={form.bathrooms} onChange={set('bathrooms')} placeholder="0"
                    className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Size (sqm) *</label>
              <input type="number" min="0" value={form.size_sqm} onChange={set('size_sqm')} placeholder="e.g. 120"
                className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
            </div>
            {isHotel && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Maximum guests</label>
                <input type="number" min="1" value={form.max_guests} onChange={set('max_guests')} placeholder="e.g. 4"
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
              </div>
            )}
          </div>

          {/* Features */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Features and amenities</label>
            <div className="flex flex-wrap gap-2">
              {(isHotel ? HOTEL_FEATURES : RENTAL_FEATURES).map(f => (
                <button key={f} type="button" onClick={() => toggle('features', f)}
                  className="px-3 py-2 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: form.features.includes(f) ? '#B8511E' : '#DEDDD6', backgroundColor: form.features.includes(f) ? '#B8511E' : '#FFFFFF', color: form.features.includes(f) ? '#FFFFFF' : '#5C4A3A' }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Photos: multiple upload */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>
              Photos * {form.images.length > 0 ? <span style={{ color:'var(--dm-sage)' }}>({form.images.length} added)</span> : <span style={{ color:'var(--dm-terracotta)' }}>required</span>}
            </label>
            <div className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
              style={{ borderColor: form.images.length > 0 ? '#7A9E7E' : '#B8511E', backgroundColor: form.images.length > 0 ? 'rgba(122,158,126,0.04)' : 'rgba(200,95,45,0.03)' }}
              onClick={() => document.getElementById('rental-img-input').click()}>
              <div className="flex justify-center mb-2">{form.images.length > 0 ? <CheckCircle size={36} className="text-green-600" /> : <Camera size={36} className="text-muted" />}</div>
              <p className="text-sm font-semibold" style={{ color:'var(--dm-deep)' }}>
                {form.images.length > 0 ? `${form.images.length} photos added: tap to add more` : 'Tap to add photos'}
              </p>
              <p className="text-xs mt-1" style={{ color:'var(--dm-warm)' }}>JPG or PNG, up to 10MB each. Add as many as you can.</p>
              <input id="rental-img-input" type="file" accept="image/*" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  const remaining = Math.max(0, 10 - form.images.length)
                  const validFiles = files.filter(file => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024)
                  if (validFiles.length !== files.length) toast.error('Add image files only, up to 10MB each.')
                  if (!remaining) { toast.error('You can add up to 10 photos.'); return }
                  const selected = validFiles.slice(0, remaining)
                  if (selected.length < validFiles.length) toast.error('Only 10 photos can be added.')
                  const newImgs = selected.map((f, i) => ({ url: URL.createObjectURL(f), is_primary: form.images.length === 0 && i === 0, file: f }))
                  setForm(f2 => ({ ...f2, images: [...f2.images, ...newImgs] }))
                  if (selected.length) toast.success(`${selected.length} photo${selected.length > 1 ? 's' : ''} added.`)
                  e.target.value = ''
                }} />
            </div>
            {form.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.images.map((img, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2"
                    style={{ borderColor: img.is_primary ? '#B8511E' : '#DEDDD6' }}>
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    {img.is_primary && <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5" style={{ backgroundColor:'rgba(200,95,45,0.9)', color:'#FFFFFF' }}>Main</div>}
                    <button className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor:'rgba(0,0,0,0.6)' }}
                      onClick={() => setForm(f => ({ ...f, images: f.images.filter((_,j) => j !== i) }))}>
                      <X size={9} color="white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Video tour (optional, but it helps)</label>
            <input type="url" value={form.video_url} onChange={set('video_url')}
              placeholder="Paste a YouTube or Loom link, or add a video below"
              className="input text-sm mb-2" style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
            {!form.video_url && (
              <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer"
                style={{ borderColor:'var(--dm-line)' }}
                onClick={() => document.getElementById('rental-video-input').click()}>
                <p className="text-xs" style={{ color:'var(--dm-warm)' }}>Or tap to upload a video file (MP4, MOV)</p>
                <input id="rental-video-input" type="file" accept="video/*" className="hidden"
                  onChange={e => { if (e.target.files[0]) { setForm(f => ({ ...f, video_url: URL.createObjectURL(e.target.files[0]) })); toast.success('Video added.') } }} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Description</label>
            <textarea className="input resize-none" rows={4}
              placeholder={`Describe the ${isHotel ? 'hotel or short-let' : 'property'}: where it is, how to get there, nearby landmarks and what makes it special.`}
              value={form.description} onChange={set('description')}
              style={{ backgroundColor:'#FFFFFF', color:'var(--dm-deep)' }} />
          </div>
        </div>
      ),
    },
  ]

  const current = steps[step]
  const isLast  = step === steps.length - 1

  const handleSubmit = async () => {
    if (saving) return
    if (!agreed) { toast.error('Agree to the listing terms to continue.'); return }
    if (!user?.id) { toast.error('Sign in to list a property.'); return }
    setSubmitError('')
    setSaving(true)
    try {
      setProgress('Uploading photos...')
      const uploadedImages = []
      for (let i = 0; i < form.images.length; i++) {
        const img = form.images[i]
        setProgress(`Uploading photo ${i+1} of ${form.images.length}...`)
        if (img.url.startsWith('blob:') && img.file) {
          try {
            const url = await uploadToStorage(img.file, user.id, 'photo')
            uploadedImages.push({ url, is_primary: img.is_primary })
          } catch { toast.error(`Photo ${i+1} couldn't be uploaded, so we skipped it.`) }
        } else {
          uploadedImages.push({ url: img.url, is_primary: img.is_primary })
        }
      }

      setProgress('Publishing...')
      // Postgres text/jsonb columns both flatly reject an embedded NUL byte
      // (\u0000) - the most common real-world source is pasted text (from
      // Word/PDF/some Android keyboards) carrying stray control characters.
      // stripControlChars is the same defensive pass createProperty() uses
      // elsewhere; applying it here closes the gap where this page's direct
      // insert bypassed it entirely, which is what surfaced in production as
      // "null character not permitted" when a host tried to publish.
      const { data: created, error } = await insertListedProperty(stripControlChars({
        title:        form.title,
        property_type: isHotel ? form.category : 'apartment',
        listing_type: isHotel ? (form.category === 'hotel' ? 'Hotel' : 'Short-let') : 'Rental',
        price:        Number(form.price) || 0,
        state:        form.state,
        city:         form.city,
        address:      form.address || null,
        bedrooms:     form.bedrooms  ? Number(form.bedrooms)  : null,
        bathrooms:    form.bathrooms ? Number(form.bathrooms) : null,
        size_sqm:     Number(form.size_sqm) || 0,
        max_guests:   form.max_guests ? Number(form.max_guests) : null,
        description:  form.description,
        features:     form.features,
        images:       uploadedImages,
        video_url:    form.video_url || null,
        seller_id:    user.id,
        status:       'pending_review',  // agent must verify before going live
        category:     form.category,
        // Optional: the Place subcategory picked on the form. Empty means the database files it by type.
        category_id:  form.category_id || null,
      }))

      if (error || !created?.id) throw error || new Error('Listing was not confirmed by the server')
      setListingId(created.id)

      // The listing is now persisted and visible to the admin review queue.
      // Do not automatically open an external messaging app from a submit
      // action; users receive an in-app confirmation instead.
      setSaved(true)
    } catch (err) {
      console.error('[listing-submit]', err?.message || err)
      const message = 'We couldn\'t save your listing. Check your details and try again. If it keeps happening, contact support.'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  if (saved) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor:'#FFFAF5' }}>
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-5"><PartyPopper size={56} className="text-gold" /></div>
        <h1 className="font-display text-3xl font-black mb-2" style={{ color:'var(--dm-deep)' }}>Your listing has been submitted.</h1>
        <p className="text-sm leading-relaxed mb-3" style={{ color:'var(--dm-warm)' }}>
          Your {isHotel ? 'hotel or short-let' : 'rental'} has been submitted. A DealMatch agent will verify the property before it appears to renters.
        </p>
        {listingId && <p className="text-sm font-semibold mb-2" style={{ color:'var(--dm-sage)' }}>Reference: {listingId}</p>}
        <p className="text-xs mb-5" style={{ color:'var(--dm-terracotta)' }}>Check your dashboard for its status.</p>
        <VerifyReminder returnTo="/landlord" className="mb-6" />
        <div className="space-y-3">
          <button onClick={() => navigate('/landlord')} className="btn-primary w-full py-4">Go to Dashboard →</button>
          <button onClick={() => { setSaved(false); setListingId(null); setSubmitError(''); setStep(0); setForm({ title:'', state:'', city:'', address:'', price:'', description:'', features:[], images:[], video_url:'', bedrooms:'', bathrooms:'', size_sqm:'', max_guests:'', category: type, category_id: null }) }}
            className="w-full py-3 rounded-2xl text-sm border" style={{ borderColor:'var(--dm-line)', color:'#5C4A3A' }}>
            List Another Property
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ backgroundColor:'#FFFAF5' }}>
      <div className="max-w-lg mx-auto px-4">
        <div className="mb-8">
          <p className="text-sm mb-4" style={{ color:'var(--dm-warm)' }}>Step {step + 1} of {steps.length}: {current.title}</p>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
            <div className="h-full rounded-full transition-all" style={{ width:`${((step+1)/steps.length)*100}%`, backgroundColor:'var(--dm-terracotta)' }} />
          </div>
        </div>
        <div>{current.content}</div>
        {submitError && <div role="alert" className="mt-4 p-3 rounded-xl text-sm" style={{ color:'#9B2C2C', background:'#FFF1F0', border:'1px solid #F3C4BF' }}>{submitError}</div>}
        {isLast && (
          <div className="mt-6">
            <div className="rounded-2xl border-2 p-4 transition-all cursor-pointer"
              style={{ borderColor: agreed ? '#B8511E' : '#DEDDD6', backgroundColor: agreed ? 'rgba(200,95,45,0.04)' : '#FFFFFF' }}
              onClick={() => setAgreed(v => !v)}>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                  style={{ borderColor: agreed ? '#B8511E' : '#DEDDD6', backgroundColor: agreed ? '#B8511E' : 'transparent' }}>
                  {agreed && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--dm-deep)' }}>I agree to the DealMatch Listing Terms</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--dm-warm)' }}>
                    I confirm this property is mine or I have authority to list it. I agree to DealMatch\'s{' '}
                    <a href="/terms" target="_blank" className="underline" style={{ color: 'var(--dm-terracotta)' }}>Terms of Service</a>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {saving && progress && (
          <div className="mt-4 p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor:'rgba(200,95,45,0.08)', border:'1px solid rgba(200,95,45,0.2)' }}>
            <div style={{ width:14, height:14, borderRadius:'50%', flexShrink:0, border:'2px solid rgba(200,95,45,0.2)', borderTop:'2px solid #B8511E', animation:'spin 0.8s linear infinite' }} />
            <p className="text-xs font-medium" style={{ color:'var(--dm-terracotta)' }}>{progress}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        <div className="flex gap-3 mt-8">
          {step > 0 && <button onClick={() => setStep(s => s-1)} disabled={saving} className="px-5 py-4 rounded-2xl text-sm font-semibold border" style={{ borderColor:'var(--dm-line)', color:'var(--dm-warm)', backgroundColor:'#FFFFFF' }}>←</button>}
          <button
            onClick={() => { if (!current.valid()) { toast.error('Complete the required fields to continue.'); return } if (isLast) handleSubmit(); else setStep(s => s+1) }}
            disabled={saving || !current.valid()}
            className="btn-primary flex-1 py-4 flex items-center justify-center gap-2"
            style={{ opacity: current.valid() ? 1 : 0.5 }}>
            {saving ? (progress || 'Submitting…') : isLast ? 'Submit for verification' : <>Continue <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

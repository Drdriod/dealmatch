import React, { useState, useEffect } from 'react'
import {
  CameraIcon, CheckCircleIcon, KeyIcon, MapPinIcon, PlayIcon, XCircleIcon, ArrowPathIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { uploadFile } from '@/data/storageRepository'
import { startVisit, submitVisit } from '@/lib/agentVisitApi'
import toast from 'react-hot-toast'

const CHECKLIST_LABELS = {
  water_running:       'Running water confirmed',
  electricity_working: 'Electricity working',
  matches_description: 'Property matches listing description',
  landlord_present:    'Landlord/caretaker was present',
  no_structural_damage:'No structural damage observed',
  address_confirmed:   'Physical address confirmed on-site',
}
const BLANK_CHECKLIST = Object.fromEntries(Object.keys(CHECKLIST_LABELS).map(k => [k, false]))
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2'

// Which step is still missing, in the order the agent does them. Shown inline, never as a disabled button.
export function firstMissing(ev, verdict) {
  if (!ev.session) return 'Start the visit first.'
  if (!ev.gps) return 'Capture your GPS location at the property.'
  if ((ev.photos || []).length < 3) return 'Add at least 3 site photos.'
  if (!/^\d{6}$/.test((ev.code || '').replace(/\s/g, ''))) return 'Enter the 6-digit visit code from the property owner.'
  if (!ev.acknowledged) return 'Tick the accuracy declaration.'
  if (verdict === 'pending' && !Object.values(ev.checklist || BLANK_CHECKLIST).every(Boolean)) return 'Complete every checklist item before approving.'
  return null
}

// Defined outside the form so the inputs inside it keep focus while typing.
function Step({ n, title, done, children }) {
  return (
  <div>
    <p className="mb-2 flex items-center gap-2 text-xs font-bold">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${done ? 'bg-forest text-white' : 'bg-sand text-bark'}`}>{done ? '✓' : n}</span>
      {title}
    </p>
    {children}
  </div>
)
}

const sessionKey = (propertyId) => `dm-visit:${propertyId}`

// One site visit, from "start" to "submit for review". The server checks the code, the GPS
// distance and the photo locations; this form only collects them.
export default function VisitForm({ property, user, onDone }) {
  const [ev, setEv] = useState({ photos: [], checklist: { ...BLANK_CHECKLIST }, notes: '', acknowledged: false, code: '' })
  const [busy, setBusy] = useState(null)   // 'start' | 'gps' | 'photos' | 'submit'
  const [problem, setProblem] = useState(null)
  const set = (patch) => setEv(f => ({ ...f, ...patch }))

  // A started visit survives a page reload for the length of the session.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey(property.id)) || 'null')
      if (saved && new Date(saved.expires_at) > new Date()) set({ session: saved })
    } catch { /* storage unavailable: start again */ }
  }, [property.id])

  const start = async () => {
    setBusy('start'); setProblem(null)
    try {
      const s = await startVisit(property.id)
      try { sessionStorage.setItem(sessionKey(property.id), JSON.stringify(s)) } catch { /* optional */ }
      set({ session: s })
    } catch (e) { setProblem(e.message) }
    setBusy(null)
  }

  const captureGps = () => {
    if (!navigator.geolocation) { setProblem('GPS is not available on this device.'); return }
    setBusy('gps'); setProblem(null)
    navigator.geolocation.getCurrentPosition(
      pos => { set({ gps: { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) } }); setBusy(null) },
      () => { setProblem('Could not get GPS. Turn location on and try again, in an open area.'); setBusy(null) },
      { enableHighAccuracy: true, timeout: 20000 },
    )
  }

  const addPhotos = async (files) => {
    setBusy('photos'); setProblem(null)
    const paths = []
    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/${property.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await uploadFile('verification-photos', path, file, { upsert: true })
      if (error) { setProblem(`A photo did not upload: ${error.message}`); continue }
      paths.push(path)
    }
    set({ photos: [...ev.photos, ...paths] })
    setBusy(null)
  }

  const submit = async (verdict) => {
    const missing = firstMissing(ev, verdict)
    if (missing) { setProblem(missing); return }
    setBusy('submit'); setProblem(null)
    try {
      await submitVisit({
        session: ev.session, gps: ev.gps, photos: ev.photos, checklist: ev.checklist,
        verdict, rejectionReason: verdict === 'rejected' ? (ev.notes || 'See checklist') : null,
        visitCode: ev.code,
      })
      try { sessionStorage.removeItem(sessionKey(property.id)) } catch { /* optional */ }
      toast.success('Visit recorded. It is now with an admin for review.')
      onDone()
    } catch (e) { setProblem(e.message) }
    setBusy(null)
  }

  return (
    <div className="mt-4 space-y-5">
      <Step n={1} title="Start the visit" done={!!ev.session}>
        {ev.session ? (
          <p className="rounded-2xl bg-sage/15 p-3 text-xs text-forest">Visit started. It stays open until {new Date(ev.session.expires_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}.</p>
        ) : (
          <button type="button" onClick={start} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-deep py-3 text-xs font-bold text-white ${focusRing}`}>
            {busy === 'start' ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayIcon className="h-4 w-4" aria-hidden="true" />} Start visit
          </button>
        )}
      </Step>

      <Step n={2} title="GPS location, at the property" done={!!ev.gps}>
        {ev.gps ? (
          <p className="flex items-center gap-2 rounded-2xl bg-sage/15 p-3 text-xs text-forest"><CheckCircleIcon className="h-4 w-4" aria-hidden="true" />{ev.gps.lat.toFixed(5)}, {ev.gps.lng.toFixed(5)} (±{ev.gps.acc}m)</p>
        ) : (
          <button type="button" onClick={captureGps} className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-sky/40 bg-sky/10 py-3 text-xs font-bold text-deep ${focusRing}`}>
            {busy === 'gps' ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPinIcon className="h-4 w-4" aria-hidden="true" />} Capture GPS
          </button>
        )}
      </Step>

      <Step n={3} title={`Site photos (${ev.photos.length} of 3 minimum)`} done={ev.photos.length >= 3}>
        <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-terracotta/40 bg-orange-pale py-3 text-xs font-bold text-terracotta-dark ${focusRing}`}>
          {busy === 'photos' ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CameraIcon className="h-4 w-4" aria-hidden="true" />} Take or add photos
          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => addPhotos(e.target.files)} />
        </label>
        <p className="mt-1.5 text-[11px] text-warm">Take them at the property with your camera. Photos are checked against the property&apos;s location.</p>
      </Step>

      <Step n={4} title="Checklist" done={Object.values(ev.checklist).every(Boolean)}>
        <div className="space-y-2">
          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
            <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 text-xs ${ev.checklist[key] ? 'border-forest/40 bg-sage/10' : 'border-line bg-white/60'}`}>
              <input type="checkbox" checked={ev.checklist[key]} onChange={() => set({ checklist: { ...ev.checklist, [key]: !ev.checklist[key] } })} className="h-4 w-4 accent-forest" />
              {label}
            </label>
          ))}
        </div>
        <textarea value={ev.notes} onChange={e => set({ notes: e.target.value })} rows={3} aria-label="Additional notes"
          placeholder="Anything you noticed, or why you are rejecting it" className="input mt-3 !py-2.5 text-xs" />
      </Step>

      <Step n={5} title="Visit code from the property owner" done={/^\d{6}$/.test(ev.code.replace(/\s/g, ''))}>
        <div className="relative">
          <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm" aria-hidden="true" />
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={ev.code} onChange={e => set({ code: e.target.value })}
            aria-label="Visit code" placeholder="6-digit code" className="input !pl-9 text-sm tracking-widest" />
        </div>
        <p className="mt-1.5 text-[11px] text-warm">The owner finds this code in My Offers while you are at the property. You cannot get it from this app.</p>
      </Step>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white/60 p-3">
        <input type="checkbox" checked={ev.acknowledged} onChange={() => set({ acknowledged: !ev.acknowledged })} className="mt-0.5 h-4 w-4 accent-forest" />
        <span className="text-xs leading-relaxed">I confirm this verification is accurate and truthful. False information is grounds for suspension and legal action by DealMatch.</span>
      </label>

      {problem ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-semibold text-terracotta-dark">
          <ExclamationCircleIcon className="mt-px h-4 w-4 flex-shrink-0" aria-hidden="true" />{problem}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => submit('rejected')} className={`flex items-center justify-center gap-2 rounded-2xl border border-danger/30 bg-danger/10 py-3 text-sm font-bold text-danger ${focusRing}`}>
          <XCircleIcon className="h-4 w-4" aria-hidden="true" /> Reject
        </button>
        <button type="button" onClick={() => submit('pending')} className={`flex items-center justify-center gap-2 rounded-2xl bg-forest py-3 text-sm font-bold text-white ${focusRing}`}>
          {busy === 'submit' ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />} Submit for review
        </button>
      </div>
    </div>
  )
}

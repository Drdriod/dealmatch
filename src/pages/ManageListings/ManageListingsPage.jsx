/**
 * ManageListingsPage - /manage-listings
 *
 * "My listings" across both the legacy Real Estate vertical (`properties`,
 * status: active/pending/sold/removed) and every schema-driven category
 * (`category_listings`, status: ACTIVE/MATCHED/SUSPENDED/CLOSED). Status
 * changes go through the existing owner-scoped RLS UPDATE policies
 * ("Sellers can update own props" / the category_listings equivalent) --
 * this page issues a plain .update().eq('id', ...) the same way
 * VerificationPage and the listing composers already do, no new RPC
 * needed since the owner-write path already exists and is already scoped
 * correctly (seller_id = auth.uid() / user_id = auth.uid()).
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon, EyeIcon, HeartIcon, PauseIcon, PlayIcon, PlusIcon, TrashIcon, InboxIcon,
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { fetchMyProperties, setPropertyStatus } from '@/data/manageListingsRepository'
import { listMyListings, updateListingStatus } from '@/modules/listings/listingsService'
import { useAuth } from '@/context/AuthContext'
import VisitCodeCard from './VisitCodeCard'
import toast from 'react-hot-toast'

const TONES = {
  good:  'bg-sage/20 text-forest',
  warn:  'bg-gold/20 text-bark',
  info:  'bg-sky/15 text-deep',
  bad:   'bg-danger/15 text-danger',
  quiet: 'bg-warm/15 text-warm',
}
const PROPERTY_STATUS_META = {
  active:  { label: 'Active',  tone: 'good' },
  pending: { label: 'Pending review', tone: 'warn' },
  pending_review: { label: 'Pending review', tone: 'warn' },
  under_verification: { label: 'Under verification', tone: 'warn' },
  paused:  { label: 'Paused',  tone: 'quiet' },
  inactive: { label: 'Paused', tone: 'quiet' },
  rejected: { label: 'Not approved', tone: 'bad' },
  rented:  { label: 'Rented', tone: 'info' },
  sold:    { label: 'Sold', tone: 'info' },
  removed: { label: 'Paused',  tone: 'quiet' },
}
const LISTING_STATUS_META = {
  ACTIVE:    { label: 'Active',    tone: 'good' },
  MATCHED:   { label: 'Matched',   tone: 'info' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
  CLOSED:    { label: 'Closed',    tone: 'quiet' },
}

const glass = 'border border-white/70 bg-white/80 shadow-card backdrop-blur-xl'
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

export default function ManageListingsPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])
  const [listings, setListings] = useState([])
  const [filter, setFilter] = useState('all') // 'all' | 'active' | 'paused'
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { if (user?.id) load() }, [user?.id])

  const load = async () => {
    setLoading(true)
    const [propRes, listData] = await Promise.all([
      fetchMyProperties(user.id),
      listMyListings(supabase, user.id, { withCategory: true }),
    ])
    setProperties(propRes.data || [])
    setListings(listData || [])
    setLoading(false)
  }

  const items = useMemo(() => {
    const a = properties.map(p => ({
      kind: 'property', id: p.id, title: p.title, price: p.price,
      subtitle: [p.category?.name, [p.city, p.state].filter(Boolean).join(', '), p.listing_type || 'For Sale'].filter(Boolean).join(' · '),
      status: p.status, meta: PROPERTY_STATUS_META[p.status] || { label: p.status, tone: 'quiet' },
      views: p.view_count, likes: p.like_count, createdAt: p.created_at,
      isPaused: p.status === 'removed' || p.status === 'paused',
      // Pausing writes 'paused'. 'removed' is what the Remove button writes; rows paused before
      // this change also hold 'removed', so both still count as paused and can be restored.
      togglePausedTo: (p.status === 'removed' || p.status === 'paused') ? 'active' : 'paused',
      link: `/property/${p.id}`,
    }))
    const b = listings.map(l => ({
      kind: 'listing', id: l.id, title: l.title, price: l.price_cents ? l.price_cents / 100 : null,
      subtitle: `${l.categories?.name || 'Offer'} · ${l.type}`,
      status: l.status, meta: LISTING_STATUS_META[l.status] || { label: l.status, tone: 'quiet' },
      views: null, likes: null, createdAt: l.created_at,
      isPaused: l.status === 'SUSPENDED',
      togglePausedTo: l.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
      link: null, // no generic /listing/:id detail route exists yet -- see PRODUCTION_HANDOFF.md follow-ups; avoid linking to a 404
    }))
    const all = [...a, ...b].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))
    if (filter === 'active')  return all.filter(x => !x.isPaused && x.status !== 'sold' && x.status !== 'rented' && x.status !== 'CLOSED')
    if (filter === 'paused')  return all.filter(x => x.isPaused)
    return all
  }, [properties, listings, filter])

  const togglePause = async (item) => {
    setBusyId(item.id)
    let error = null
    if (item.kind === 'property') {
      ({ error } = await setPropertyStatus(item.id, item.togglePausedTo))
    } else {
      try { await updateListingStatus(supabase, item.id, user.id, item.togglePausedTo) } catch (e) { error = e }
    }
    setBusyId(null)
    if (error) { toast.error('We couldn\'t update that offer. Please try again.'); return }
    toast.success(item.isPaused ? 'Offer reactivated.' : 'Offer paused.')
    load()
  }

  const remove = async (item) => {
    if (!(await confirm({ title: 'Remove this offer?', message: 'This cannot be undone.', confirmLabel: 'Remove', danger: true }))) return
    setBusyId(item.id)
    // Soft-delete via status, matching the rest of the app's pattern
    // (properties/category_listings are referenced by escrow/transaction
    // history, so a hard DELETE would orphan financial records).
    let error = null
    if (item.kind === 'property') {
      ({ error } = await setPropertyStatus(item.id, 'removed'))
    } else {
      try { await updateListingStatus(supabase, item.id, user.id, 'CLOSED') } catch (e) { error = e }
    }
    setBusyId(null)
    if (error) { toast.error('We couldn\'t remove that offer. Please try again.'); return }
    toast.success('Offer removed.')
    load()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream pb-28 text-deep">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-[60%_40%_55%_45%] bg-forest/10 blur-3xl" />
        <div className="absolute -right-20 top-[30rem] h-80 w-80 rounded-[45%_55%_40%_60%] bg-terracotta/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 pt-6">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} aria-label="Go back"
              className={`flex h-10 w-10 items-center justify-center rounded-full ${glass} ${focusRing}`}>
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="font-display text-3xl">My Offers</h1>
          </div>
          <button type="button" onClick={() => navigate('/list')} aria-label="List a new place"
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-terracotta-dark text-white shadow-glow ${focusRing}`}>
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 ml-[52px] text-xs text-warm">Manage your offers. Track your deals.</p>

        <div className="mb-4 flex gap-2" role="group" aria-label="Filter offers">
          {[['all', 'All'], ['active', 'Active'], ['paused', 'Paused']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${focusRing} ${filter === id ? 'bg-terracotta-dark text-white' : 'border border-line bg-white/80 text-bark'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-[24px_24px_24px_8px] bg-sand" />)
          ) : items.length === 0 ? (
            <div className={`rounded-[32px_32px_32px_10px] px-6 py-12 text-center ${glass}`}>
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[20px_20px_20px_6px] bg-orange-pale text-terracotta">
                <InboxIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold">You haven&apos;t published an offer yet.</p>
              <p className="mb-4 mt-1 text-xs text-warm">Offer a place or a service and get matched with people looking for it.</p>
              <button type="button" onClick={() => navigate('/list')} className="btn-primary px-6 py-2.5 text-sm">Create Your First Offer</button>
            </div>
          ) : items.map(item => (
            <div key={item.kind + item.id} className={`rounded-[24px_24px_24px_8px] p-4 ${glass}`}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <button type="button" onClick={() => item.link && navigate(item.link)} disabled={!item.link}
                  className={`min-w-0 flex-1 rounded text-left disabled:cursor-default ${focusRing}`}>
                  <span className="block truncate text-sm font-bold">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-warm">{item.subtitle}</span>
                </button>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${TONES[item.meta.tone] || TONES.quiet}`}>
                  {item.meta.label}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-warm">
                  {item.price != null && <span className="font-bold text-deep">₦{Number(item.price).toLocaleString()}</span>}
                  {item.views != null && <span className="flex items-center gap-1"><EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />{item.views}<span className="sr-only"> views</span></span>}
                  {item.likes != null && <span className="flex items-center gap-1"><HeartIcon className="h-3.5 w-3.5" aria-hidden="true" />{item.likes}<span className="sr-only"> likes</span></span>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => togglePause(item)} disabled={busyId === item.id}
                    aria-label={item.isPaused ? 'Reactivate offer' : 'Pause offer'} title={item.isPaused ? 'Reactivate' : 'Pause'}
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-deep/5 disabled:opacity-50 ${focusRing}`}>
                    {item.isPaused ? <PlayIcon className="h-4 w-4 text-forest" aria-hidden="true" /> : <PauseIcon className="h-4 w-4 text-bark" aria-hidden="true" />}
                  </button>
                  <button type="button" onClick={() => remove(item)} disabled={busyId === item.id}
                    aria-label="Remove offer" title="Remove"
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 disabled:opacity-50 ${focusRing}`}>
                    <TrashIcon className="h-4 w-4 text-danger" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {item.kind === 'property' && ['pending_review', 'pending', 'under_verification'].includes(item.status) ? <VisitCodeCard propertyId={item.id} /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

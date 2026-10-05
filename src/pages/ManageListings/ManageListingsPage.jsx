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
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, Heart, MoreVertical, Pause, Play, Plus, Trash2, Home, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { listMyListings, updateListingStatus } from '@/modules/listings/listingsService'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const PROPERTY_STATUS_META = {
  active:  { label: 'Active',  color: '#7A9E7E' },
  pending: { label: 'Pending review', color: '#D4A853' },
  sold:    { label: 'Sold/Let', color: '#5B8DEF' },
  removed: { label: 'Paused',  color: '#647068' },
}
const LISTING_STATUS_META = {
  ACTIVE:    { label: 'Active',    color: '#7A9E7E' },
  MATCHED:   { label: 'Matched',   color: '#5B8DEF' },
  SUSPENDED: { label: 'Suspended', color: '#C94A3A' },
  CLOSED:    { label: 'Closed',    color: '#647068' },
}

export default function ManageListingsPage() {
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
      supabase.from('properties')
        .select('id, title, price, city, state, status, view_count, like_count, listing_type, created_at')
        .eq('seller_id', user.id).order('created_at', { ascending: false }),
      listMyListings(supabase, user.id, { withCategory: true }),
    ])
    setProperties(propRes.data || [])
    setListings(listData || [])
    setLoading(false)
  }

  const items = useMemo(() => {
    const a = properties.map(p => ({
      kind: 'property', id: p.id, title: p.title, price: p.price,
      subtitle: `${p.city}, ${p.state} · ${p.listing_type || 'For Sale'}`,
      status: p.status, meta: PROPERTY_STATUS_META[p.status] || { label: p.status, color: '#647068' },
      views: p.view_count, likes: p.like_count, createdAt: p.created_at,
      isPaused: p.status === 'removed',
      togglePausedTo: p.status === 'removed' ? 'active' : 'removed',
      link: `/property/${p.id}`,
    }))
    const b = listings.map(l => ({
      kind: 'listing', id: l.id, title: l.title, price: l.price_cents ? l.price_cents / 100 : null,
      subtitle: `${l.categories?.name || 'Listing'} · ${l.type}`,
      status: l.status, meta: LISTING_STATUS_META[l.status] || { label: l.status, color: '#647068' },
      views: null, likes: null, createdAt: l.created_at,
      isPaused: l.status === 'SUSPENDED',
      togglePausedTo: l.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
      link: null, // no generic /listing/:id detail route exists yet -- see PRODUCTION_HANDOFF.md follow-ups; avoid linking to a 404
    }))
    const all = [...a, ...b].sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))
    if (filter === 'active')  return all.filter(x => !x.isPaused && x.status !== 'sold' && x.status !== 'CLOSED')
    if (filter === 'paused')  return all.filter(x => x.isPaused)
    return all
  }, [properties, listings, filter])

  const togglePause = async (item) => {
    setBusyId(item.id)
    let error = null
    if (item.kind === 'property') {
      ({ error } = await supabase.from('properties').update({ status: item.togglePausedTo }).eq('id', item.id))
    } else {
      try { await updateListingStatus(supabase, item.id, user.id, item.togglePausedTo) } catch (e) { error = e }
    }
    setBusyId(null)
    if (error) { toast.error('Could not update listing'); return }
    toast.success(item.isPaused ? 'Listing reactivated' : 'Listing paused')
    load()
  }

  const remove = async (item) => {
    if (!window.confirm('Remove this listing? This cannot be undone.')) return
    setBusyId(item.id)
    // Soft-delete via status, matching the rest of the app's pattern
    // (properties/category_listings are referenced by escrow/transaction
    // history, so a hard DELETE would orphan financial records).
    let error = null
    if (item.kind === 'property') {
      ({ error } = await supabase.from('properties').update({ status: 'removed' }).eq('id', item.id))
    } else {
      try { await updateListingStatus(supabase, item.id, user.id, 'CLOSED') } catch (e) { error = e }
    }
    setBusyId(null)
    if (error) { toast.error('Could not remove listing'); return }
    toast.success('Listing removed')
    load()
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F7F4ED' }}>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF' }}>
            <ArrowLeft size={16} style={{ color: '#17211B' }} />
          </button>
          <h1 className="font-display text-lg font-black" style={{ color: '#17211B' }}>My Listings</h1>
        </div>
        <button onClick={() => navigate('/list')} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C85F2D' }}>
          <Plus size={16} className="text-white" />
        </button>
      </div>

      <div className="px-4 flex gap-2 mb-4">
        {[['all', 'All'], ['active', 'Active'], ['paused', 'Paused']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold"
            style={filter === id ? { backgroundColor: '#C85F2D', color: '#FFF' } : { backgroundColor: '#FFF', color: '#5C4A3A', border: '1px solid #DEDDD6' }}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: '#F0E5D8' }} />)
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Package size={32} className="mx-auto mb-3" style={{ color: '#D8C9B8' }} />
            <p className="text-sm font-semibold" style={{ color: '#17211B' }}>No listings yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: '#647068' }}>Post a property, shortlet, or service to get started.</p>
            <button onClick={() => navigate('/list')} className="btn-primary px-6 py-2.5 text-sm">Create a listing</button>
          </div>
        ) : items.map(item => (
          <div key={item.kind + item.id} className="rounded-2xl p-4" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <button onClick={() => item.link && navigate(item.link)} disabled={!item.link}
                className="flex-1 min-w-0 text-left disabled:cursor-default">
                <p className="text-sm font-semibold truncate" style={{ color: '#17211B' }}>{item.title}</p>
                <p className="text-xs mt-0.5" style={{ color: '#647068' }}>{item.subtitle}</p>
              </button>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: item.meta.color + '22', color: item.meta.color }}>
                {item.meta.label}
              </span>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3 text-xs" style={{ color: '#647068' }}>
                {item.price != null && <span className="font-bold" style={{ color: '#17211B' }}>₦{Number(item.price).toLocaleString()}</span>}
                {item.views != null && <span className="flex items-center gap-1"><Eye size={12} /> {item.views}</span>}
                {item.likes != null && <span className="flex items-center gap-1"><Heart size={12} /> {item.likes}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => togglePause(item)} disabled={busyId === item.id}
                  className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50" style={{ backgroundColor: 'rgba(23,33,27,0.06)' }}
                  title={item.isPaused ? 'Reactivate' : 'Pause'}>
                  {item.isPaused ? <Play size={13} style={{ color: '#7A9E7E' }} /> : <Pause size={13} style={{ color: '#5C4A3A' }} />}
                </button>
                <button onClick={() => remove(item)} disabled={busyId === item.id}
                  className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50" style={{ backgroundColor: 'rgba(201,74,58,0.08)' }}
                  title="Remove">
                  <Trash2 size={13} style={{ color: '#C94A3A' }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, BedDouble, Check, Hotel, Lightbulb, Minus, Plus, RefreshCw, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const WHATSAPP = '2347057392060'

const CATEGORY_PRESETS = [
  'Standard', 'Executive', 'Luxury', 'Suite',
  'Deluxe', 'Budget', 'VIP', 'Penthouse',
  'Family', 'Single', 'Double', 'Twin',
]

// ─── Add Category Modal ────────────────────────────────────
function AddCategoryModal({ propertyId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', total_rooms: '', price_per_night: '', description: ''
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm(f => ({...f, [k]: e.target.value}))

  const handleSave = async () => {
    if (!form.name || !form.total_rooms) {
      toast.error('Category name and room count are required')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('room_categories').insert({
      property_id:     propertyId,
      name:            form.name,
      total_rooms:     Number(form.total_rooms),
      available_rooms: Number(form.total_rooms),
      price_per_night: Number(form.price_per_night) || null,
      description:     form.description,
      updated_at:      new Date().toISOString(),
    })
    setSaving(false)
    if (error) { toast.error('Could not save: ' + error.message); return }
    toast.success('Room category added!')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{backgroundColor:'rgba(26,18,16,0.8)', backdropFilter:'blur(8px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{backgroundColor:'#FFFAF5'}}>
        <div className="p-5 border-b flex items-center justify-between"
          style={{borderColor:'#E8DDD2'}}>
          <h3 className="font-display font-black text-lg" style={{color:'#1A1210'}}>
            Add Room Category
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{backgroundColor:'rgba(26,18,16,0.08)'}}>
            <X size={14} style={{color:'#5C4A3A'}} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
              style={{color:'rgba(26,18,16,0.5)'}}>Category Name *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {CATEGORY_PRESETS.map(p => (
                <button key={p} type="button"
                  onClick={() => setForm(f => ({...f, name: p}))}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={{
                    borderColor: form.name === p ? '#C96A3A' : '#E8DDD2',
                    backgroundColor: form.name === p ? 'rgba(201,106,58,0.08)' : '#FFFFFF',
                    color: form.name === p ? '#C96A3A' : '#8A7E78',
                  }}>
                  {p}
                </button>
              ))}
            </div>
            <input className="input text-sm" type="text" placeholder="Or type custom name..."
              value={form.name} onChange={set('name')}
              style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{color:'rgba(26,18,16,0.5)'}}>Total Rooms *</label>
              <input className="input text-sm" type="number" min="1" placeholder="e.g. 100"
                value={form.total_rooms} onChange={set('total_rooms')}
                style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                style={{color:'rgba(26,18,16,0.5)'}}>Price/Night (₦)</label>
              <input className="input text-sm" type="number" placeholder="e.g. 35000"
                value={form.price_per_night} onChange={set('price_per_night')}
                style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
              style={{color:'rgba(26,18,16,0.5)'}}>Description (optional)</label>
            <input className="input text-sm" type="text"
              placeholder="e.g. Air-conditioned, en-suite bathroom, king bed"
              value={form.description} onChange={set('description')}
              style={{backgroundColor:'#FFFFFF', color:'#1A1210'}} />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-4">
            {saving ? 'Saving...' : 'Add Category →'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Room Category Card ────────────────────────────────────
function CategoryCard({ cat, onUpdate }) {
  const [updating, setUpdating] = useState(false)
  const available  = cat.available_rooms
  const total      = cat.total_rooms
  const pct        = total > 0 ? (available / total) * 100 : 0
  const statusColor = pct === 0 ? '#C96A3A' : pct < 30 ? '#D4A853' : '#7A9E7E'
  const statusLabel = pct === 0 ? 'Fully Booked' : pct < 30 ? 'Almost Full' : 'Available'

  const adjust = async (delta) => {
    const newVal = Math.max(0, Math.min(total, available + delta))
    if (newVal === available) return
    setUpdating(true)
    const { error } = await supabase
      .from('room_categories')
      .update({ available_rooms: newVal, updated_at: new Date().toISOString() })
      .eq('id', cat.id)
    setUpdating(false)
    if (error) { toast.error('Update failed'); return }

    // Notify DealMatch if fully booked
    if (newVal === 0) {
      const msg = encodeURIComponent(
        '*Room Fully Booked: DealMatch*\n\n' +
        'Property: ' + (cat.property_title || 'Your Property') + '\n' +
        'Category: ' + cat.name + '\n' +
        'Status: ALL ' + total + ' rooms are now booked\n\n' +
        'DealMatch has automatically blocked new bookings for this category.'
      )
      window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank')
    }
    onUpdate()
  }

  const markAllBooked = async () => {
    setUpdating(true)
    const { error } = await supabase
      .from('room_categories')
      .update({ available_rooms: 0, updated_at: new Date().toISOString() })
      .eq('id', cat.id)
    setUpdating(false)
    if (error) { toast.error('Update failed'); return }
    toast.success(cat.name + ' marked as fully booked')
    onUpdate()
  }

  const markAllAvailable = async () => {
    setUpdating(true)
    const { error } = await supabase
      .from('room_categories')
      .update({ available_rooms: total, updated_at: new Date().toISOString() })
      .eq('id', cat.id)
    setUpdating(false)
    if (error) { toast.error('Update failed'); return }
    toast.success('All ' + cat.name + ' rooms marked available')
    onUpdate()
  }

  return (
    <div className="rounded-2xl border p-5" style={{backgroundColor:'#FFFAF5', borderColor:'#E8DDD2'}}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-black text-lg" style={{color:'#1A1210'}}>{cat.name}</h3>
          {cat.price_per_night && (
            <p className="text-xs mt-0.5" style={{color:'#8A7E78'}}>
              ₦{Number(cat.price_per_night).toLocaleString()}/night
            </p>
          )}
        </div>
        <span className="px-3 py-1.5 rounded-full text-xs font-bold"
          style={{backgroundColor: statusColor + '15', color: statusColor}}>
          {statusLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5" style={{color:'#8A7E78'}}>
          <span>{available} available</span>
          <span>{total} total</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{backgroundColor:'rgba(26,18,16,0.08)'}}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{width: pct + '%', backgroundColor: statusColor}} />
        </div>
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold" style={{color:'#8A7E78'}}>
          Adjust available rooms:
        </p>
        <div className="flex items-center gap-3">
          <button onClick={() => adjust(-1)} disabled={updating || available === 0}
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg transition-all"
            style={{
              backgroundColor: available === 0 ? 'rgba(26,18,16,0.04)' : 'rgba(201,106,58,0.1)',
              color: available === 0 ? '#8A7E78' : '#C96A3A',
            }}>
            <Minus size={16} />
          </button>
          <span className="font-display font-black text-2xl w-10 text-center"
            style={{color:'#1A1210'}}>
            {updating ? '...' : available}
          </span>
          <button onClick={() => adjust(+1)} disabled={updating || available === total}
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all"
            style={{
              backgroundColor: available === total ? 'rgba(26,18,16,0.04)' : 'rgba(122,158,126,0.15)',
              color: available === total ? '#8A7E78' : '#7A9E7E',
            }}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={markAllBooked} disabled={updating || available === 0}
          className="py-2.5 rounded-xl text-xs font-semibold border-2 transition-all"
          style={{
            borderColor: 'rgba(201,106,58,0.3)',
            color: available === 0 ? '#8A7E78' : '#C96A3A',
            backgroundColor: available === 0 ? 'rgba(26,18,16,0.03)' : 'rgba(201,106,58,0.04)',
          }}>
          Mark All Booked
        </button>
        <button onClick={markAllAvailable} disabled={updating || available === total}
          className="py-2.5 rounded-xl text-xs font-semibold border-2 transition-all"
          style={{
            borderColor: 'rgba(122,158,126,0.3)',
            color: available === total ? '#8A7E78' : '#7A9E7E',
            backgroundColor: available === total ? 'rgba(26,18,16,0.03)' : 'rgba(122,158,126,0.06)',
          }}>
          All Available
        </button>
      </div>

      {cat.description && (
        <p className="text-xs mt-3 pt-3 border-t" style={{color:'#8A7E78', borderColor:'#E8DDD2'}}>
          {cat.description}
        </p>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function AvailabilityPage() {
  const { user } = useAuth()
  const [properties, setProperties]     = useState([])
  const [selectedProp, setSelectedProp] = useState(null)
  const [categories, setCategories]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [lastUpdated, setLastUpdated]   = useState(null)

  useEffect(() => {
    if (!user) return
    loadProperties()
  }, [user])

  useEffect(() => {
    if (selectedProp) loadCategories(selectedProp)
  }, [selectedProp])

  const loadProperties = async () => {
  try {
    const { data } = await supabase
      .from('properties')
      .select('id, title, city, state, category')
      .eq('seller_id', user.id)
      .in('category', ['hotel', 'shortlet'])
      .order('created_at', { ascending: false })
    setProperties(data || [])
    if (data?.length > 0) setSelectedProp(data[0].id)
    setLoading(false)
    } catch (err) {
    console.error("loadProperties error:", err.message)
  }
}

  const loadCategories = async (propId) => {
  try {
    const { data } = await supabase
      .from('room_categories')
      .select('*')
      .eq('property_id', propId)
      .eq('is_active', true)
      .order('name')
    // Attach property title to each category for WhatsApp notifications
    const prop = properties.find(p => p.id === propId)
    setCategories((data || []).map(c => ({...c, property_title: prop?.title})))
    setLastUpdated(new Date())
    } catch (err) {
    console.error("loadCategories error:", err.message)
  }
}

  const totalAvailable = categories.reduce((sum, c) => sum + c.available_rooms, 0)
  const totalRooms     = categories.reduce((sum, c) => sum + c.total_rooms, 0)

  return (
    <div className="min-h-screen pt-20 pb-16" style={{backgroundColor:'#F5EDE0'}}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-black" style={{color:'#1A1210'}}>
              Availability Manager
            </h1>
            <p className="text-xs mt-0.5" style={{color:'#8A7E78'}}>
              Keep online and offline bookings in sync
            </p>
          </div>
          <button onClick={() => { if(selectedProp) loadCategories(selectedProp) }}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{backgroundColor:'rgba(26,18,16,0.08)'}}>
            <RefreshCw size={16} style={{color:'#5C4A3A'}} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20" style={{color:'#8A7E78'}}>Loading...</div>
        ) : properties.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center"
            style={{backgroundColor:'#FFFAF5', borderColor:'#E8DDD2'}}>
            <div className="flex justify-center mb-4"><Hotel size={48} className="text-terracotta" /></div>
            <h3 className="font-display font-black text-xl mb-2" style={{color:'#1A1210'}}>
              No hotels or short-lets listed
            </h3>
            <p className="text-sm mb-5" style={{color:'#8A7E78'}}>
              List your hotel or short-let first to manage availability.
            </p>
            <a href="/list-rental?type=hotel" className="btn-primary px-6 py-3 text-sm inline-flex">
              List Your Property →
            </a>
          </div>
        ) : (
          <>
            {/* Property selector */}
            {properties.length > 1 && (
              <div className="flex gap-2 overflow-x-auto mb-5" style={{scrollbarWidth:'none'}}>
                {properties.map(p => (
                  <button key={p.id} onClick={() => setSelectedProp(p.id)}
                    className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 border transition-all"
                    style={{
                      backgroundColor: selectedProp === p.id ? '#1A1210' : '#FFFFFF',
                      color: selectedProp === p.id ? '#FFFFFF' : '#5C4A3A',
                      borderColor: selectedProp === p.id ? '#1A1210' : '#E8DDD2',
                    }}>
                    {p.title}
                  </button>
                ))}
              </div>
            )}

            {/* Summary card */}
            <div className="rounded-2xl p-5 mb-5"
              style={{backgroundColor:'#1A1210'}}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{color:'rgba(255,255,255,0.4)'}}>
                Overall Availability
              </p>
              <div className="flex items-end gap-2 mb-3">
                <span className="font-display font-black text-4xl"
                  style={{color: totalAvailable === 0 ? '#C96A3A' : '#7A9E7E'}}>
                  {totalAvailable}
                </span>
                <span className="text-sm mb-1" style={{color:'rgba(255,255,255,0.4)'}}>
                  / {totalRooms} rooms available
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden"
                style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: totalRooms > 0 ? (totalAvailable/totalRooms*100) + '%' : '0%',
                    backgroundColor: totalAvailable === 0 ? '#C96A3A' : '#7A9E7E',
                  }} />
              </div>
              {lastUpdated && (
                <p className="text-xs mt-3" style={{color:'rgba(255,255,255,0.25)'}}>
                  Updated {lastUpdated.toLocaleTimeString('en-NG', {hour:'2-digit', minute:'2-digit'})}
                </p>
              )}
            </div>

            {/* How it works note */}
            <div className="rounded-2xl p-4 mb-5 flex gap-3"
              style={{backgroundColor:'rgba(122,158,126,0.08)', border:'1px solid rgba(122,158,126,0.2)'}}>
              <Lightbulb size={20} className="text-gold flex-shrink-0" />
              <div>
                <p className="text-xs font-bold mb-1" style={{color:'#5C8060'}}>
                  How to prevent double bookings
                </p>
                <p className="text-xs leading-relaxed" style={{color:'#8A7E78'}}>
                  When a room is booked offline, tap <strong>−</strong> to reduce available count. 
                  DealMatch automatically blocks online bookings when count reaches 0. 
                  When guest checks out, tap <strong>+</strong> to restore availability.
                </p>
              </div>
            </div>

            {/* Categories */}
            {categories.length === 0 ? (
              <div className="rounded-2xl border p-8 text-center mb-5"
                style={{backgroundColor:'#FFFAF5', borderColor:'#E8DDD2'}}>
                <div className="flex justify-center mb-3"><BedDouble size={40} className="text-terracotta" /></div>
                <p className="font-semibold text-sm mb-1" style={{color:'#1A1210'}}>
                  No room categories yet
                </p>
                <p className="text-xs mb-4" style={{color:'#8A7E78'}}>
                  Add your room categories to start managing availability
                </p>
              </div>
            ) : (
              <div className="space-y-4 mb-5">
                {categories.map(cat => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    onUpdate={() => loadCategories(selectedProp)}
                  />
                ))}
              </div>
            )}

            {/* Add category button */}
            <button onClick={() => setShowAdd(true)}
              className="w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-semibold transition-all"
              style={{borderColor:'#C96A3A', color:'#C96A3A', backgroundColor:'rgba(201,106,58,0.03)'}}>
              <Plus size={16} /> Add Room Category
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {showAdd && selectedProp && (
          <AddCategoryModal
            propertyId={selectedProp}
            onClose={() => setShowAdd(false)}
            onSaved={() => loadCategories(selectedProp)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

import React, { useState } from 'react'
import { Flag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

/**
 * Per-entity-type report categories. Falls back to GENERIC_CATEGORIES for
 * any entity_type not listed here, so adding a new listing source later
 * never requires touching this component, only optionally adding a more
 * specific category set.
 */
const CATEGORIES_BY_TYPE = {
  property: [
    { id: 'fake_listing',      label: 'Fake listing — property does not exist' },
    { id: 'misrepresentation', label: 'Property looks different from photos/description' },
    { id: 'wrong_address',     label: 'Wrong or misleading address given' },
    { id: 'structural_damage', label: 'Serious structural damage not disclosed' },
    { id: 'fraud',             label: 'Fraud or scam attempt' },
    { id: 'agent_misconduct',  label: 'Agent behaved unprofessionally or dishonestly' },
    { id: 'other',             label: 'Other issue' },
  ],
  professional: [
    { id: 'fake_profile',      label: 'Fake profile or impersonation' },
    { id: 'unqualified',       label: 'Claims skills/credentials they do not have' },
    { id: 'no_show',           label: 'Did not show up / unresponsive after booking' },
    { id: 'poor_conduct',      label: 'Unprofessional or dishonest conduct' },
    { id: 'fraud',             label: 'Fraud or scam attempt' },
    { id: 'other',             label: 'Other issue' },
  ],
  student_hostel: [
    { id: 'fake_listing',      label: 'Fake listing — hostel does not exist' },
    { id: 'misrepresentation', label: 'Room looks different from photos/description' },
    { id: 'wrong_address',     label: 'Wrong or misleading address given' },
    { id: 'fraud',             label: 'Fraud or scam attempt' },
    { id: 'other',             label: 'Other issue' },
  ],
}

const GENERIC_CATEGORIES = [
  { id: 'misrepresentation', label: 'Listing looks different from photos/description' },
  { id: 'fraud',              label: 'Fraud or scam attempt' },
  { id: 'inappropriate',      label: 'Inappropriate or abusive content' },
  { id: 'other',              label: 'Other issue' },
]

/**
 * <ReportModal entityType="property" entityId={property.id} listingSource="properties" onClose={...} />
 *
 * Writes to the generalized `reports` table (entity_type + entity_id),
 * not the old property-only `complaints` table. Drop-in replacement for
 * any inline report modal in a listing detail page.
 */
export default function ReportModal({ entityType, entityId, listingSource = null, onClose }) {
  const { user } = useAuth()
  const [filing, setFiling]   = useState(false)
  const [form, setForm]       = useState({ category: '', description: '' })

  const categories = CATEGORIES_BY_TYPE[entityType] || GENERIC_CATEGORIES

  const submit = async () => {
    if (!user) { toast.error('Sign in to report this listing'); return }
    if (!form.category) { toast.error('Select an issue category'); return }
    if (!form.description.trim()) { toast.error('Describe the problem'); return }

    setFiling(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id:    user.id,
      entity_type:    entityType,
      entity_id:      String(entityId),
      listing_source: listingSource,
      category:       form.category,
      description:    form.description.trim(),
    })
    if (error) {
      toast.error('Could not submit report. Try again.')
    } else {
      toast.success('Report submitted. Our team will investigate within 24 hours.')
      onClose()
    }
    setFiling(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10" style={{ backgroundColor: '#FFFAF5', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: '#E8DDD2' }} />
        <h3 className="font-display text-lg font-black mb-1" style={{ color: '#1A1210' }}>Report a Problem</h3>
        <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>
          Your report goes directly to our team.
        </p>

        <p className="text-xs font-bold mb-2" style={{ color: '#1A1210' }}>What's the issue? *</p>
        <div className="space-y-2 mb-4">
          {categories.map(cat => (
            <button key={cat.id}
              onClick={() => setForm(f => ({ ...f, category: cat.id }))}
              className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
              style={{
                backgroundColor: form.category === cat.id ? 'rgba(201,74,58,0.06)' : 'rgba(26,18,16,0.03)',
                border: `1.5px solid ${form.category === cat.id ? '#C94A3A' : '#E8DDD2'}`,
              }}>
              <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ border: `2px solid ${form.category === cat.id ? '#C94A3A' : '#E8DDD2'}`, backgroundColor: form.category === cat.id ? '#C94A3A' : 'transparent' }}>
                {form.category === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className="text-xs" style={{ color: '#1A1210' }}>{cat.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs font-bold mb-1" style={{ color: '#1A1210' }}>Describe what happened *</p>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Provide as much detail as possible — dates, what you were told vs reality, any money lost..."
          rows={4}
          className="w-full rounded-2xl px-4 py-3 text-xs resize-none outline-none mb-4"
          style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1.5px solid #E8DDD2', color: '#1A1210' }}
        />

        <button onClick={submit} disabled={filing || !form.category || !form.description.trim()}
          className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
          style={{ backgroundColor: '#C94A3A', color: 'white' }}>
          <Flag size={16} />
          {filing ? 'Submitting...' : 'Submit Report'}
        </button>
        <button onClick={onClose} className="w-full mt-2 py-2.5 text-xs" style={{ color: '#8A7E78' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

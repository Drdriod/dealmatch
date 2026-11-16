import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { fetchReviewForTransaction, insertReview } from '@/data/jobPostingRepository'

// RATE-3: a review is only accepted for a COMPLETED transaction, written by the
// requester, about that transaction's provider. The database enforces all of
// this (enforce_review_transaction). The UI just gives the chance to review once.
export default function LeaveReview({ transactionId, providerId, reviewerId }) {
  const [existing, setExisting] = useState(undefined) // undefined = loading
  const [rating, setRating]     = useState(0)
  const [comment, setComment]   = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchReviewForTransaction(transactionId)
      .then(({ data }) => { if (!cancelled) setExisting(data || null) })
    return () => { cancelled = true }
  }, [transactionId])

  const submit = async () => {
    if (rating < 1) { toast.error('Choose a rating from 1 to 5'); return }
    setSaving(true)
    const { data, error } = await insertReview({
      transactionId,
      providerId,
      reviewerId,
      rating,
      comment: comment.trim() || null,
    })
    setSaving(false)
    if (error) {
      toast.error(/REVIEW_/.test(error.message || '')
        ? 'This job cannot be reviewed.'
        : 'Could not save your review. Please try again.')
      return
    }
    setExisting(data)
    toast.success('Thank you. Your review is in.')
  }

  if (existing === undefined) return null
  if (existing) {
    return <p className="text-xs text-center py-4" style={{ color: 'var(--dm-warm)' }}>You rated this job {existing.rating}/5. Thank you.</p>
  }

  return (
    <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEDDD6' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: 'var(--dm-deep)' }}>How did it go?</p>
      <div className="flex gap-1 mb-3" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)}
            className="text-2xl leading-none" style={{ color: n <= rating ? '#D4A853' : '#D8C9B8' }}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} maxLength={1000}
        placeholder="Optional: tell others about the work" className="input mb-3" />
      <button onClick={submit} disabled={saving || rating < 1}
        className="w-full py-3 rounded-2xl font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--dm-terracotta)' }}>
        {saving ? 'Saving…' : 'Submit review'}
      </button>
    </div>
  )
}

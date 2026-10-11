// Maps the custom error codes raised by our Postgres triggers and RPCs to
// messages a person can act on. Unknown errors fall back to the caller's text,
// so raw database messages never reach the UI.
//
// Codes are defined in supabase/migrations/20261011000000_provider_matching_caps_and_listing_guards.sql
// and must stay in sync with that file.

const MESSAGES = [
  ['LEVEL1_CAP_EXCEEDED',
    'This provider has reached the Level 1 limit of ₦50,000 in 30 days. Choose a verified Level 2 or higher provider, or try again later.'],
  ['IDENTITY_NIN_REQUIRED',
    'This person has not submitted their NIN/BVN yet, so they cannot be approved.'],
  ['IDENTITY_ALREADY_REGISTERED',
    'This NIN/BVN is already linked to another provider account.'],
  ['REVIEW_ONLY_AFTER_COMPLETION',
    'You can review a provider once the job is completed.'],
  ['REVIEW_NOT_BY_REQUESTER',
    'Only the person who posted the job can leave a review.'],
  ['REVIEW_PROVIDER_MISMATCH',
    'This review does not match the provider on this job.'],
  ['REVIEW_REQUIRES_TRANSACTION',
    'Reviews can only be left on a completed, paid job.'],
  ['REVIEW_TRANSACTION_NOT_FOUND',
    'We could not find the job for this review.'],
  ['REVIEW_LINK_IMMUTABLE',
    'A review cannot be moved to a different job or provider.'],
]

export function friendlyDbError(error, fallback = 'Something went wrong. Please try again.') {
  const text = `${error?.message || ''} ${error?.details || ''}`
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message
  }
  return fallback
}

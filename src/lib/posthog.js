import posthog from 'posthog-js'

// ─── User identification ───────────────────────────────────
export const identifyUser = (userId, properties = {}) => {
  try { posthog.identify(userId, properties) } catch (_) {}
}

export const resetUser = () => {
  try { posthog.reset() } catch (_) {}
}

// ─── Event tracking ────────────────────────────────────────
export const track = (event, properties = {}) => {
  try { posthog.capture(event, properties) } catch (_) {}
}

// ─── Predefined events ─────────────────────────────────────
export const analytics = {
  signedUp:            (role)               => track('user_signed_up',           { role }),
  signedIn:            ()                   => track('user_signed_in'),
  onboardingStart:     ()                   => track('onboarding_started'),
  onboardingDone:      (profile)            => track('onboarding_completed',      profile),
  propertyViewed:      (propertyId)         => track('property_viewed',           { property_id: propertyId }),
  propertyLiked:       (propertyId, score)  => track('property_liked',            { property_id: propertyId, match_score: score }),
  propertyPassed:      (propertyId)         => track('property_passed',           { property_id: propertyId }),
  propertySuperLiked:  (propertyId)         => track('property_super_liked',      { property_id: propertyId }),
  matchViewed:         (propertyId, score)  => track('match_viewed',              { property_id: propertyId, match_score: score }),
  matchContacted:      (propertyId)         => track('match_contacted',           { property_id: propertyId }),
  professionalViewed:  (type, id)           => track('professional_viewed',       { type, professional_id: id }),
  professionalContacted:(type, id)          => track('professional_contacted',    { type, professional_id: id }),
  subscriptionStarted: (type, plan)         => track('subscription_started',      { professional_type: type, plan }),
  subscriptionCompleted:(type, plan, amount)=> track('subscription_completed',    { professional_type: type, plan, amount }),
  propertyListed:      (propertyId, type)   => track('property_listed',           { property_id: propertyId, type }),
  searchPerformed:     (filters)            => track('search_performed',          filters),
}

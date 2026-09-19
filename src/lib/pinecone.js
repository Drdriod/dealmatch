// Pinecone: vector similarity matching
// Used for semantic property matching based on buyer preferences

// NOTE: Pinecone calls happen server-side (Vercel API routes) to protect your API key.
// This file contains the CLIENT-SIDE helpers that call your own API routes.
import { supabase } from './supabase'

// ─── Match API call ────────────────────────────────────────
/**
 * Get AI-matched properties for a buyer profile
 * Sends buyer preferences to /api/match which queries Pinecone
 */
export const getAIMatches = async (buyerProfile) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ buyerProfile }),
    })
    if (!res.ok) throw new Error('Match API error')
    const data = await res.json()
    return { matches: data.matches, error: null }
  } catch (error) {
    console.error('AI matching error:', error)
    return { matches: [], error }
  }
}

/**
 * Index a new property in Pinecone when it's listed
 * Called from /api/index-property (server-side)
 */
export const indexProperty = async (property) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/index-property', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ property }),
    })
    if (!res.ok) throw new Error('Index API error')
    return { success: true, error: null }
  } catch (error) {
    console.error('Property indexing error:', error)
    return { success: false, error }
  }
}

// ─── Buyer profile → embedding vector ─────────────────────
/**
 * Converts a buyer profile into a text description
 * that gets embedded and compared against property vectors
 */
export const buildBuyerText = (profile) => {
  const parts = [
    `Looking for ${profile.property_goal} in ${profile.preferred_states?.join(', ')}`,
    `Budget between ${formatPrice(profile.budget_min)} and ${formatPrice(profile.budget_max)}`,
    `Preferred property types: ${profile.property_types?.join(', ')}`,
    profile.needs_financing ? 'Needs mortgage financing' : 'Has own financing',
    profile.features?.length ? `Must have: ${profile.features.join(', ')}` : '',
    profile.lifestyle_notes || '',
  ].filter(Boolean)

  return parts.join('. ')
}

/**
 * Converts a property listing into a text description for embedding
 */
export const buildPropertyText = (property) => {
  const parts = [
    `${property.title} in ${property.city}, ${property.state}`,
    `${property.property_type} for ${property.listing_type}`,
    `Price: ${formatPrice(property.price)}`,
    `${property.bedrooms ? `${property.bedrooms} bedrooms,` : ''} ${property.bathrooms ? `${property.bathrooms} bathrooms` : ''}`,
    `Size: ${property.size_sqm} sqm`,
    property.features?.length ? `Features: ${property.features.join(', ')}` : '',
    property.description || '',
  ].filter(Boolean)

  return parts.join('. ')
}

// ─── Match score explanation ───────────────────────────────
export const explainMatchScore = (score, property, buyerProfile) => {
  const reasons = []
  const pct = Math.round(score * 100)

  // Budget match
  if (property.price >= buyerProfile.budget_min && property.price <= buyerProfile.budget_max) {
    reasons.push('Within your budget')
  } else if (property.price <= buyerProfile.budget_max * 1.1) {
    reasons.push('Slightly above budget')
  }

  // Location match
  if (buyerProfile.preferred_states?.includes(property.state)) {
    reasons.push(`In your preferred location (${property.state})`)
  }

  // Property type match
  if (buyerProfile.property_types?.includes(property.property_type)) {
    reasons.push(`Matches your preferred property type`)
  }

  // Feature overlap
  const sharedFeatures = (property.features || []).filter(f =>
    (buyerProfile.features || []).includes(f)
  )
  if (sharedFeatures.length > 0) {
    reasons.push(`Has ${sharedFeatures.slice(0, 2).join(' and ')}`)
  }

  return { score: pct, reasons }
}

const formatPrice = (num) => {
  if (!num) return '₦0'
  if (num >= 1_000_000) return `₦${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `₦${(num / 1_000).toFixed(0)}K`
  return `₦${num}`
}

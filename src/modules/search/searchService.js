/**
 * Search module (ADR-012). Owns nothing directly, it is a read-only
 * federator over Catalog/Listings and the legacy verticals, implemented as
 * a single database function call rather than direct table access, so it
 * never trips the module-boundary fitness function.
 */

export async function universalSearch(supabase, query, { limit = 30 } = {}) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  const { data, error } = await supabase.rpc('universal_search', {
    p_query: trimmed,
    p_limit: limit,
  })

  if (error) throw new Error(`universalSearch failed: ${error.message}`)
  return data
}

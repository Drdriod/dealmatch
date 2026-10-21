/**
 * Search module (ADR-012). Owns nothing directly, it is a read-only
 * federator over Catalog/Listings and the legacy verticals, implemented as
 * a single database function call rather than direct table access, so it
 * never trips the module-boundary fitness function.
 */

export async function universalSearch(supabase, query, { limit = 30, category = null } = {}) {
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  // Only send the filter when one is chosen, so the call still works against
  // a database that has not yet applied the category migration.
  const args = { p_query: trimmed, p_limit: limit }
  if (category) args.p_category_slug = category

  const { data, error } = await supabase.rpc('universal_search', args)

  if (error) throw new Error(`universalSearch failed: ${error.message}`)
  return data
}

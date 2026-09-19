/**
 * Catalog module - owns `public.categories`.
 * No React, no Vercel req/res here - takes a Supabase client and plain data
 * in, returns plain data or throws. Keeps this module boundary framework-agnostic
 * per the "strict module boundaries" rule in the architecture spec.
 */

export async function listCategories(supabase, { includeInactive = false } = {}) {
  let query = supabase.from('categories').select('*').order('name')
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(`listCategories failed: ${error.message}`)
  return data
}

export async function getCategoryBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) throw new Error(`getCategoryBySlug(${slug}) failed: ${error.message}`)
  return data
}

/** Full nested tree: top-level categories with their children attached. Mirrors forumService.getForumCategoryTree. */
export async function getCategoryTree(supabase) {
  const all = await listCategories(supabase)
  const byParent = new Map()
  for (const cat of all) {
    const key = cat.parent_id ?? 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(cat)
  }
  const roots = byParent.get('root') || []
  return roots.map(root => ({ ...root, children: byParent.get(root.id) || [] }))
}

export async function listChildCategories(supabase, parentId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .eq('parent_id', parentId)
    .order('name')

  if (error) throw new Error(`listChildCategories failed: ${error.message}`)
  return data
}

export async function getCategoryById(supabase, id) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getCategoryById(${id}) failed: ${error.message}`)
  return data
}

/**
 * Creates a new category. This is the operation that satisfies the spec's
 * Definition of Done: "a new category can be created purely via a database
 * record/API call with zero code changes or DDL migrations."
 */
export async function createCategory(supabase, { slug, name, parentId = null, attributeSchema }) {
  if (!slug || !name || !attributeSchema) {
    throw new Error('slug, name, and attributeSchema are required')
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ slug, name, parent_id: parentId, attribute_schema: attributeSchema })
    .select()
    .single()

  if (error) throw new Error(`createCategory failed: ${error.message}`)
  return data
}

export async function updateCategorySchema(supabase, categoryId, attributeSchema) {
  const { data, error } = await supabase
    .from('categories')
    .update({ attribute_schema: attributeSchema })
    .eq('id', categoryId)
    .select()
    .single()

  if (error) throw new Error(`updateCategorySchema failed: ${error.message}`)
  return data
}

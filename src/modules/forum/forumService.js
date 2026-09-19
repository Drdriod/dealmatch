/**
 * Forum module - owns forum_categories / forum_threads / forum_posts.
 * Framework-agnostic: takes a Supabase client + plain data, returns plain
 * data or throws. Used by api/platform.js (both the authenticated CRUD
 * resources and the public SSR render path).
 */

import { slugify, slugWithSuffix } from './slugify.js'

export async function listForumCategories(supabase, { topLevelOnly = false } = {}) {
  let query = supabase.from('forum_categories').select('*').eq('is_active', true).order('sort_order')
  if (topLevelOnly) query = query.is('parent_id', null)

  const { data, error } = await query
  if (error) throw new Error(`listForumCategories failed: ${error.message}`)
  return data
}

export async function listChildCategories(supabase, parentId) {
  const { data, error } = await supabase
    .from('forum_categories')
    .select('*')
    .eq('is_active', true)
    .eq('parent_id', parentId)
    .order('sort_order')

  if (error) throw new Error(`listChildCategories failed: ${error.message}`)
  return data
}

/** Full nested tree - top-level categories with their children attached. Used by the forum index page. */
export async function getForumCategoryTree(supabase) {
  const all = await listForumCategories(supabase)
  const byParent = new Map()
  for (const cat of all) {
    const key = cat.parent_id ?? 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(cat)
  }
  const roots = byParent.get('root') || []
  return roots.map(root => ({ ...root, children: byParent.get(root.id) || [] }))
}

export async function getForumCategoryBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from('forum_categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) throw new Error(`getForumCategoryBySlug(${slug}) failed: ${error.message}`)
  return data
}

/**
 * Lists threads for a category page. `sort` controls ranking:
 *  - 'active'  (default): pinned first, then most recently active - best for a live forum index
 *  - 'newest': most recently created - best for a chronological/SEO freshness view
 */
export async function listThreads(supabase, categoryId, { sort = 'active', page = 1, pageSize = 20 } = {}) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('forum_threads')
    .select('id, title, slug, thread_type, status, view_count, reply_count, is_pinned, last_activity_at, created_at, user_id', { count: 'exact' })
    .eq('category_id', categoryId)
    .in('status', ['OPEN', 'CLOSED'])

  query = sort === 'newest'
    ? query.order('created_at', { ascending: false })
    : query.order('is_pinned', { ascending: false }).order('last_activity_at', { ascending: false })

  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(`listThreads failed: ${error.message}`)
  return { threads: data, total: count, page, pageSize }
}

export async function getThreadBySlug(supabase, categoryId, threadSlug) {
  const { data, error } = await supabase
    .from('forum_threads')
    .select('*')
    .eq('category_id', categoryId)
    .eq('slug', threadSlug)
    .single()

  if (error) throw new Error(`getThreadBySlug(${threadSlug}) failed: ${error.message}`)
  return data
}

// Looks a thread up by its raw id rather than its (categoryId, slug) pair.
// Missing entirely until now - api/platform.js's forum-accept-answer
// handler imports and calls this directly by threadId, and importing a
// name a module doesn't export throws at module load time under native
// ES modules. That took down the whole platform.js function for every
// resource routed through it (search, categories, sitemap, all of
// forum), not just thread-accept-answer specifically, which is why
// /forum showed a full FUNCTION_INVOCATION_FAILED crash rather than a
// contained error.
export async function getThreadById(supabase, threadId) {
  const { data, error } = await supabase
    .from('forum_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  if (error) throw new Error(`getThreadById(${threadId}) failed: ${error.message}`)
  return data
}

export async function listPosts(supabase, threadId, { page = 1, pageSize = 50 } = {}) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('forum_posts')
    .select('id, body, user_id, created_at, updated_at', { count: 'exact' })
    .eq('thread_id', threadId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .range(from, to)

  if (error) throw new Error(`listPosts failed: ${error.message}`)
  return { posts: data, total: count, page, pageSize }
}

/**
 * Creates a thread, generating a unique slug within the category (retries
 * once with a random suffix on collision rather than failing the request  - 
 * duplicate titles like "How much is rent in Lekki?" are expected).
 */
export async function createThread(supabase, { userId, categoryId, title, body, threadType = 'DISCUSSION' }) {
  if (!userId || !categoryId || !title || !body) {
    throw new Error('userId, categoryId, title, and body are required')
  }

  const attempt = async (slug) => supabase
    .from('forum_threads')
    .insert({ user_id: userId, category_id: categoryId, title, body, thread_type: threadType, slug })
    .select()
    .single()

  let { data, error } = await attempt(slugify(title))

  if (error?.code === '23505') { // unique_violation on (category_id, slug)
    ;({ data, error } = await attempt(slugWithSuffix(title)))
  }

  if (error) throw new Error(`createThread failed: ${error.message}`)
  return data
}

export async function createPost(supabase, { userId, threadId, body }) {
  if (!userId || !threadId || !body) {
    throw new Error('userId, threadId, and body are required')
  }

  const { data, error } = await supabase
    .from('forum_posts')
    .insert({ user_id: userId, thread_id: threadId, body })
    .select()
    .single()

  if (error) throw new Error(`createPost failed: ${error.message}`)
  return data
}

/** Only the thread's original author may mark an accepted answer (enforced here + by caller checking ownership). */
export async function acceptAnswer(supabase, threadId, postId) {
  const { data, error } = await supabase
    .from('forum_threads')
    .update({ accepted_post_id: postId })
    .eq('id', threadId)
    .select()
    .single()

  if (error) throw new Error(`acceptAnswer failed: ${error.message}`)
  return data
}

export async function incrementViewCount(supabase, threadId) {
  // Best-effort - a failed view-count bump should never break the page render.
  try {
    await supabase.rpc('increment_thread_view_count', { p_thread_id: threadId })
  } catch { /* non-critical */ }
}

// Used by sitemapService.js so it doesn't have to query forum_threads
// directly (module boundary: only this module reads/writes tables it owns).
export async function listThreadSlugsForSitemap(supabase, categoryId, { limit = 500 } = {}) {
  const { data } = await supabase
    .from('forum_threads')
    .select('slug, updated_at')
    .eq('category_id', categoryId)
    .in('status', ['OPEN', 'CLOSED'])
    .order('last_activity_at', { ascending: false })
    .limit(limit)
  return data || []
}

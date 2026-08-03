// api/platform.js
//
// Consolidates everything added for the multicategory catalog and the
// community forum (originally ~13 separate files) into ONE Vercel
// serverless function, dispatched by ?resource=... (JSON API) or
// ?render=... (bot-facing HTML / sitemap XML). This mirrors the same
// [resource]/[action] dispatch pattern already used by api/admin/[resource].js
// and api/agent/[action].js elsewhere in this codebase.
//
// WHY: Vercel's plan tier caps the number of serverless functions in a
// deployment. Splitting every endpoint into its own file blew past that
// limit. All the routing paths the frontend already calls (/api/categories,
// /api/forum/threads, /forum/*, /sitemap.xml, etc.) are unchanged — they're
// rewritten to this one file via vercel.json, with the original path/query
// preserved and a `resource`/`render` param added. See vercel.json for the
// exact mappings.
//
// All the actual logic lives in src/modules/* — this file is just the
// dispatcher + HTTP plumbing (auth, status codes, response shape).

import { withSecurity } from '../src/lib/apiMiddleware.js'
import { createServerClient, getAuthedUser } from '../src/lib/supabaseServer.js'
import { validateAttributes } from '../src/lib/schemaValidation.js'
import { redisRateLimit } from '../src/lib/redis.js'

import { listCategories, createCategory, getCategoryBySlug, getCategoryById, updateCategorySchema, getCategoryTree, listChildCategories as listChildCatalogCategories } from '../src/modules/catalog/catalogService.js'
import { createListing, listMyListings, getListing } from '../src/modules/listings/listingsService.js'
import { findMatches, findCounterpartMatches } from '../src/modules/matching/matchingService.js'
import { clearValidatorCache } from '../src/lib/schemaValidation.js'
import { universalSearch } from '../src/modules/search/searchService.js'

import {
  getForumCategoryTree, getForumCategoryBySlug, listChildCategories,
  listThreads, getThreadBySlug, getThreadById, listPosts, createThread, createPost,
  acceptAnswer, incrementViewCount,
} from '../src/modules/forum/forumService.js'
import { renderForumSSR } from '../src/modules/forum/ssrRenderer.js'
import { buildSitemapXml } from '../src/modules/sitemap/sitemapService.js'

// ─── Bot-facing HTML / sitemap XML (no auth, no JSON) ──────────────────────
//
// DELIBERATELY not wrapped in withSecurity(): that middleware's isBot() check
// matches any User-Agent containing "bot"/"crawl"/"spider" (i.e. Googlebot,
// GPTBot, ClaudeBot, PerplexityBot — precisely the traffic this path exists
// to serve) and its isAllowedOrigin() check rejects any request without an
// Origin/Referer header, which crawlers never send. Wrapping this in
// withSecurity would 403 every crawler and silently defeat the whole SEO/AEO
// build. It gets its own light, fail-open rate limit instead.
async function handleRenderPublic(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return }

  const rl = await redisRateLimit(req, 'platform-render', 120, 60)
  if (!rl.allowed) { res.status(429).send('Too many requests'); return }

  const supabase = createServerClient()

  if (req.query.render === 'sitemap') {
    const xml = await buildSitemapXml(supabase)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
    res.status(200).send(xml)
    return
  }

  // render === 'html' -> forum SSR for crawlers
  const segments = String(req.query.slug || '').split('/').filter(Boolean)
  const { status, contentType, body } = await renderForumSSR(supabase, segments)
  res.setHeader('Content-Type', contentType || 'text/html; charset=utf-8')
  res.status(status).send(body)
}

// ─── JSON API resources ─────────────────────────────────────────────────────
const jsonResources = {
  // -- Universal search (ADR-012) --
  async search(req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const { q, limit } = req.query
    if (!q || !q.trim()) return res.status(200).json({ results: [] })

    try {
      const results = await universalSearch(supabase, q, { limit: limit ? Number(limit) : 30 })
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60')
      return res.status(200).json({ results })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  },

  async ['listing-detail'](req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id is required' })

    try {
      const listing = await getListing(supabase, id)
      const category = await getCategoryById(supabase, listing.category_id).catch(() => null)
      return res.status(200).json({ listing, category })
    } catch {
      return res.status(404).json({ error: 'Listing not found' })
    }
  },

  // -- Dynamic listing catalog --
  async categories(req, res, supabase) {
    if (req.method === 'GET') return res.status(200).json({ categories: await getCategoryTree(supabase) })
    if (req.method === 'POST') {
      const { slug, name, parentId, attributeSchema } = req.body || {}
      try {
        return res.status(201).json(await createCategory(supabase, { slug, name, parentId, attributeSchema }))
      } catch (err) { return res.status(400).json({ error: err.message }) }
    }
    return res.status(405).json({ error: 'Method not allowed' })
  },

  async category(req, res, supabase) {
    const { slug } = req.query
    if (req.method === 'GET') {
      try {
        const category = await getCategoryBySlug(supabase, slug)
        const children = await listChildCatalogCategories(supabase, category.id)
        return res.status(200).json({ ...category, children })
      }
      catch { return res.status(404).json({ error: 'Category not found' }) }
    }
    if (req.method === 'PATCH') {
      const { attributeSchema } = req.body || {}
      if (!attributeSchema) return res.status(400).json({ error: 'attributeSchema is required' })
      try {
        const category = await getCategoryBySlug(supabase, slug)
        const updated = await updateCategorySchema(supabase, category.id, attributeSchema)
        clearValidatorCache(category.id)
        return res.status(200).json(updated)
      } catch (err) { return res.status(400).json({ error: err.message }) }
    }
    return res.status(405).json({ error: 'Method not allowed' })
  },

  async ['category-match'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    // Public, matching category_listings' own RLS: "listings_public_read_active"
    // already lets anyone read ACTIVE rows, so browsing/matching them needs no
    // auth either, same as the forum-threads and categories resources.

    const { categoryId, type, lat, lng, radiusMeters, attributeFilter, limit } = req.body || {}
    try {
      const matches = await findMatches(supabase, { categoryId, type, lat, lng, radiusMeters, attributeFilter, limit })
      return res.status(200).json({ matches })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  },

  async listings(req, res, supabase) {
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    if (req.method === 'GET') {
      const { categoryId } = req.query
      const listings = await listMyListings(supabase, user.id, { categoryId: categoryId ? Number(categoryId) : undefined })
      return res.status(200).json({ listings })
    }
    if (req.method === 'POST') {
      const { categoryId, type, title, description, priceCents, lat, lng, locationName, attributes } = req.body || {}
      const { valid, errors } = await validateAttributes(supabase, categoryId, attributes)
      if (!valid) return res.status(400).json({ error: 'Invalid attributes', details: errors })
      try {
        const listing = await createListing(supabase, {
          userId: user.id, categoryId, type, title, description, priceCents, lat, lng, locationName, attributes,
        })
        return res.status(201).json(listing)
      } catch (err) { return res.status(400).json({ error: err.message }) }
    }
    return res.status(405).json({ error: 'Method not allowed' })
  },

  // -- Webhook receiver: called by the notify_listing_created Postgres trigger,
  //    not by end users. See supabase/migrations/20260731000000_multicategory_catalog.sql --
  async ['listing-webhook'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).end()

    const sharedSecret = process.env.LISTING_WEBHOOK_SECRET
    if (sharedSecret && req.headers['x-webhook-secret'] !== sharedSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { eventName, payload } = req.body || {}
    if (!eventName || !payload) return res.status(400).json({ error: 'Malformed event' })

    try {
      const listing = await getListing(supabase, payload.entityId)
      const counterparts = await findCounterpartMatches(supabase, listing)
      console.log(`[listing-webhook] ${eventName} for listing ${listing.id}: ${counterparts.length} potential counterpart match(es)`)
      return res.status(200).json({ ok: true, counterpartCount: counterparts.length })
    } catch (err) {
      console.error('[listing-webhook] error:', err.message)
      return res.status(200).json({ ok: false, error: err.message })
    }
  },

  // -- Forum --
  async ['forum-categories'](req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const tree = await getForumCategoryTree(supabase)
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return res.status(200).json({ categories: tree })
  },

  async ['forum-threads'](req, res, supabase) {
    if (req.method === 'GET') {
      const { category, sort, page } = req.query
      if (!category) return res.status(400).json({ error: 'category query param is required' })
      try {
        const cat = await getForumCategoryBySlug(supabase, category)
        const result = await listThreads(supabase, cat.id, { sort: sort === 'newest' ? 'newest' : 'active', page: page ? Number(page) : 1 })
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
        return res.status(200).json(result)
      } catch { return res.status(404).json({ error: 'Category not found' }) }
    }
    if (req.method === 'POST') {
      const { user, error: authError } = await getAuthedUser(req, supabase)
      if (authError) return res.status(401).json({ error: authError })

      const { categorySlug, title, body, threadType } = req.body || {}
      if (!categorySlug || !title || !body) return res.status(400).json({ error: 'categorySlug, title, and body are required' })
      if (title.length > 200) return res.status(400).json({ error: 'title must be 200 characters or fewer' })

      try {
        const cat = await getForumCategoryBySlug(supabase, categorySlug)
        const thread = await createThread(supabase, { userId: user.id, categoryId: cat.id, title, body, threadType })
        return res.status(201).json(thread)
      } catch (err) { return res.status(400).json({ error: err.message }) }
    }
    return res.status(405).json({ error: 'Method not allowed' })
  },

  async ['forum-thread'](req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const { category, thread: threadSlug, page } = req.query
    if (!category || !threadSlug) return res.status(400).json({ error: 'category and thread query params are required' })

    try {
      const cat = await getForumCategoryBySlug(supabase, category)
      const thread = await getThreadBySlug(supabase, cat.id, threadSlug)
      if (thread.status === 'HIDDEN') return res.status(404).json({ error: 'Thread not found' })

      const postsResult = await listPosts(supabase, thread.id, { page: page ? Number(page) : 1 })
      incrementViewCount(supabase, thread.id) // fire-and-forget
      return res.status(200).json({ category: cat, thread, ...postsResult })
    } catch { return res.status(404).json({ error: 'Thread not found' }) }
  },

  async ['forum-posts'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    const { threadId, body } = req.body || {}
    if (!threadId || !body) return res.status(400).json({ error: 'threadId and body are required' })
    if (body.length > 10000) return res.status(400).json({ error: 'body must be 10,000 characters or fewer' })

    try {
      return res.status(201).json(await createPost(supabase, { userId: user.id, threadId, body }))
    } catch (err) { return res.status(400).json({ error: err.message }) }
  },

  async ['forum-accept-answer'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    const { threadId, postId } = req.body || {}
    if (!threadId || !postId) return res.status(400).json({ error: 'threadId and postId are required' })

    let thread
    try {
      thread = await getThreadById(supabase, threadId)
    } catch {
      return res.status(404).json({ error: 'Thread not found' })
    }
    if (thread.user_id !== user.id) return res.status(403).json({ error: 'Only the thread author can accept an answer' })

    try {
      return res.status(200).json(await acceptAnswer(supabase, threadId, postId))
    } catch (err) { return res.status(400).json({ error: err.message }) }
  },

  async ['forum-resolve'](req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const segments = String(req.query.path || '').split('/').filter(Boolean)

    if (segments.length === 0) return res.status(200).json({ kind: 'index', tree: await getForumCategoryTree(supabase) })

    let category
    try { category = await getForumCategoryBySlug(supabase, segments[0]) }
    catch { return res.status(404).json({ error: 'Category not found' }) }

    const children = await listChildCategories(supabase, category.id)

    if (children.length > 0) {
      if (segments.length === 1) return res.status(200).json({ kind: 'group', category, children })
      const child = children.find(c => c.slug === segments[1])
      if (!child) return res.status(404).json({ error: 'Category not found' })

      if (segments.length === 2) {
        const { threads } = await listThreads(supabase, child.id, { sort: 'active', pageSize: 50 })
        return res.status(200).json({ kind: 'category', category: child, breadcrumb: [category, child], threads })
      }
      if (segments.length === 3) return await resolveThreadJson(supabase, res, child, segments[2], [category, child])
      return res.status(404).json({ error: 'Not found' })
    }

    if (segments.length === 1) {
      const { threads } = await listThreads(supabase, category.id, { sort: 'active', pageSize: 50 })
      return res.status(200).json({ kind: 'category', category, breadcrumb: [category], threads })
    }
    if (segments.length === 2) return await resolveThreadJson(supabase, res, category, segments[1], [category])
    return res.status(404).json({ error: 'Not found' })
  },
}

async function resolveThreadJson(supabase, res, category, threadSlug, breadcrumb) {
  let thread
  try { thread = await getThreadBySlug(supabase, category.id, threadSlug) }
  catch { return res.status(404).json({ error: 'Thread not found' }) }
  if (thread.status === 'HIDDEN') return res.status(404).json({ error: 'Thread not found' })

  const { posts } = await listPosts(supabase, thread.id, { pageSize: 100 })
  incrementViewCount(supabase, thread.id) // fire-and-forget
  return res.status(200).json({ kind: 'thread', category, breadcrumb, thread, posts })
}

// ─── Entry point ────────────────────────────────────────────────────────────
// The render path (bot HTML / sitemap XML) is checked FIRST and handled
// completely outside withSecurity — see handleRenderPublic's comment above
// for why. Only requests with ?resource=... go through the secured,
// JSON-API dispatcher below.
async function jsonHandler(req, res) {
  const supabase = createServerClient()
  const resource = req.query.resource
  const fn = resource && jsonResources[resource]
  if (!fn) return res.status(404).json({ error: `Unknown resource: ${resource}` })
  return fn(req, res, supabase)
}

// requireAuth:false at the wrapper level — most resources are public GETs;
// each resource above that needs a signed-in user calls getAuthedUser()
// itself and returns 401 explicitly. This mirrors the pattern already used
// by the individual endpoints this file replaces.
const securedJsonHandler = withSecurity(jsonHandler, { rateLimit: 60, requireAuth: false })

export default async function handler(req, res) {
  if (req.query.render) return handleRenderPublic(req, res)
  return securedJsonHandler(req, res)
}

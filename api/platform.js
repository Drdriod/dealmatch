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
// /api/forum/threads, /forum/*, /sitemap.xml, etc.) are unchanged - they're
// rewritten to this one file via vercel.json, with the original path/query
// preserved and a `resource`/`render` param added. See vercel.json for the
// exact mappings.
//
// All the actual logic lives in src/modules/* - this file is just the
// dispatcher + HTTP plumbing (auth, status codes, response shape).

import { withSecurity, honeypotHandler } from '../src/lib/apiMiddleware.js'
import { createServerClient, getAuthedUser } from '../src/lib/supabaseServer.js'
import { createClient } from '@supabase/supabase-js'
import { validateAttributes } from '../src/lib/schemaValidation.js'
import { redisRateLimit } from '../src/lib/redis.js'

import { listCategories, createCategory, getCategoryBySlug, getCategoryById, updateCategorySchema, getCategoryTree, listChildCategories as listChildCatalogCategories } from '../src/modules/catalog/catalogService.js'
import { createListing, listMyListings, getListing } from '../src/modules/listings/listingsService.js'
import { findMatches, findCounterpartMatches, universalMatch } from '../src/modules/matching/matchingService.js'
import { clearValidatorCache } from '../src/lib/schemaValidation.js'
import { universalSearch } from '../src/modules/search/searchService.js'
import { getEmbedding, getPineconeIndex, boundingBoxFilter, distanceMeters, EmbeddingUnavailableError } from '../src/lib/ai.js'

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
// GPTBot, ClaudeBot, PerplexityBot - precisely the traffic this path exists
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
    try {
      const xml = await buildSitemapXml(supabase)
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      res.status(200).send(xml)
    } catch (err) {
      console.error('[platform:sitemap]', err?.message || err)
      const origin = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'
      const escapeXml = value => String(value).replace(/[<>&'\"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '\"':'&quot;' }[c]))
      const fallback = ['/', '/browse', '/find-provider', '/marketplace', '/rentals', '/forum']
        .map(path => `  <url><loc>${escapeXml(origin + path)}</loc></url>`).join('\\n')
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\\n${fallback}\\n</urlset>`)
    }
    return
  }

  // render === 'html' -> forum SSR for crawlers
  const segments = String(req.query.slug || '').split('/').filter(Boolean)
  try {
    const { status, contentType, body } = await renderForumSSR(supabase, segments)
    res.setHeader('Content-Type', contentType || 'text/html; charset=utf-8')
    res.status(status).send(body)
  } catch (err) {
    console.error('[platform:forum-ssr]', err?.message || err)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send('<!doctype html><html><head><title>DealMatch Forum</title></head><body><main><h1>DealMatch Forum</h1><p>Forum content is temporarily unavailable. Please try again later.</p></main></body></html>')
  }
}

// ─── JSON API resources ─────────────────────────────────────────────────────
const jsonResources = {
  // ── Automated payouts (item 8 of the fix request) ─────────────────────
  // Three resources, all folded in here rather than given their own
  // files to stay under the serverless function count budget:
  //   - cron-process-payouts: Vercel Cron hits this on a schedule (see
  //     vercel.json "crons"), picks up pending payout_queue rows (queued
  //     by release_held_payment() once a transaction is dual-confirmed -
  //     see 20260915000002_automated_payouts.sql), creates a Paystack
  //     transfer recipient if the provider doesn't have one yet, and
  //     initiates the transfer. Final confirmation happens asynchronously
  //     via api/paystack-webhook.js's transfer.success/transfer.failed.
  //   - paystack-banks / paystack-resolve-account: PayoutSetupPage.jsx
  //     needs these to let a provider pick a real bank (for its Paystack
  //     code, required to create a transfer recipient) and confirm the
  //     account name resolves, instead of the old free-text bank name
  //     field that gave no way to actually pay anyone out automatically.
  async ['cron-process-payouts'](req, res) {
    // Not a signed-in-user resource - Vercel Cron calls this with no user
    // session at all, so it is gated by a shared secret instead, the same
    // pattern api/escrow-webhook.js and api/paystack-webhook.js use for
    // gateway-initiated calls that also have no user JWT to check.
    const cronSecret = process.env.CRON_SECRET
    const auth = req.headers.authorization
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.PAYSTACK_SECRET_KEY) {
      return res.status(200).json({ processed: 0, skipped: 'payouts not configured' })
    }

    const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const paystackKey = process.env.PAYSTACK_SECRET_KEY

    const { data: rows, error } = await svc
      .from('payout_queue')
      .select('id, transaction_id, profile_id, payout_account_id, amount_cents, attempts')
      .eq('status', 'pending')
      .lt('attempts', 5) // never retry forever - a row stuck at 5 failures needs an admin, see PayoutsTab's "Retry" button
      .order('created_at', { ascending: true })
      .limit(20) // small batches per cron tick, safely inside a serverless function's timeout

    if (error) {
      console.error('cron-process-payouts: failed to load queue', error.message)
      return res.status(500).json({ error: 'Failed to load payout queue' })
    }

    let processed = 0, failed = 0
    for (const row of rows || []) {
      try {
        await svc.from('payout_queue').update({ attempts: row.attempts + 1 }).eq('id', row.id)

        const { data: account } = await svc
          .from('payout_accounts')
          .select('*')
          .eq('id', row.payout_account_id)
          .eq('status', 'verified')
          .maybeSingle()

        if (!account) {
          throw new Error('No verified payout account for this transaction')
        }
        if (!account.bank_code) {
          // Old rows submitted before bank_code existed - can't create a
          // real transfer recipient without it. Surface clearly so an
          // admin can ask the provider to resubmit, rather than silently
          // retrying forever.
          throw new Error('Payout account is missing a bank code - ask the provider to resubmit their bank details')
        }

        let recipientCode = account.gateway_recipient_code
        if (!recipientCode) {
          const recRes = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'nuban',
              name: account.account_name,
              account_number: account.account_number,
              bank_code: account.bank_code,
              currency: 'NGN',
            }),
          })
          const recData = await recRes.json()
          if (!recRes.ok || !recData?.data?.recipient_code) {
            throw new Error(recData?.message || 'Failed to create Paystack transfer recipient')
          }
          recipientCode = recData.data.recipient_code
          await svc.from('payout_accounts').update({ gateway_recipient_code: recipientCode }).eq('id', account.id)
        }

        const transferRes = await fetch('https://api.paystack.co/transfer', {
          method: 'POST',
          headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'balance',
            amount: row.amount_cents, // Paystack amounts are in kobo, same unit as amount_cents throughout this codebase
            recipient: recipientCode,
            reason: `DealMatch payout - transaction #${row.transaction_id}`,
            reference: `payout_${row.id}_${Date.now()}`,
          }),
        })
        const transferData = await transferRes.json()
        if (!transferRes.ok) {
          throw new Error(transferData?.message || 'Paystack transfer initiation failed')
        }

        // Still 'pending' from Paystack's side until the transfer.success
        // webhook confirms it - this just records that it's in flight.
        await svc.from('payout_queue').update({
          status: 'processing',
          gateway_ref: transferData.data?.transfer_code || transferData.data?.reference || null,
        }).eq('id', row.id)
        await svc.from('transactions').update({ payout_ref: transferData.data?.transfer_code }).eq('id', row.transaction_id)

        processed++
      } catch (err) {
        failed++
        console.error(`cron-process-payouts: row ${row.id} failed:`, err.message)
        await svc.from('payout_queue').update({
          status: row.attempts + 1 >= 5 ? 'failed' : 'pending', // give up after 5 attempts, otherwise leave pending for the next tick
          failure_reason: err.message.slice(0, 500),
        }).eq('id', row.id)
        if (row.attempts + 1 >= 5) {
          await svc.from('transactions').update({ payout_status: 'failed' }).eq('id', row.transaction_id)
        }
      }
    }

    return res.status(200).json({ processed, failed, total: (rows || []).length })
  },

  async ['paystack-banks'](req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(200).json({ banks: [] })
    try {
      const r = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      })
      const data = await r.json()
      const banks = (data?.data || []).map(b => ({ name: b.name, code: b.code })).sort((a, b) => a.name.localeCompare(b.name))
      res.setHeader('Cache-Control', 'public, max-age=3600') // bank list barely ever changes
      return res.status(200).json({ banks })
    } catch (err) {
      console.error('paystack-banks failed:', err.message)
      return res.status(200).json({ banks: [] })
    }
  },

  async ['paystack-resolve-account'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user } = await getAuthedUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(200).json({ resolved: false })

    const { accountNumber, bankCode } = req.body || {}
    if (!accountNumber || !bankCode) return res.status(400).json({ error: 'accountNumber and bankCode required' })

    try {
      const r = await fetch(`https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      })
      const data = await r.json()
      if (!r.ok || !data?.data?.account_name) {
        return res.status(200).json({ resolved: false, error: data?.message || 'Could not resolve this account' })
      }
      return res.status(200).json({ resolved: true, accountName: data.data.account_name })
    } catch (err) {
      console.error('paystack-resolve-account failed:', err.message)
      return res.status(200).json({ resolved: false })
    }
  },

  // -- AI matching for the unified listing catalog (item 1 of the fix
  // request): universal counterpart to api/index-property.js/api/match.js,
  // which stay scoped to the legacy `properties` table. Folded in here
  // rather than given their own files to stay under the serverless
  // function count budget, same reasoning as every other resource in
  // this file - see the header comment.
  async ['index-listing'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' })

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

    const { listingId } = req.body || {}
    if (!listingId) return res.status(400).json({ error: 'listingId required' })

    const { data: listing, error: fetchErr } = await supabase
      .from('category_listings')
      .select('id, user_id, category_id, type, title, description, price_cents, location_name, status, attributes, categories(slug, name)')
      .eq('id', listingId)
      .single()

    if (fetchErr || !listing) return res.status(404).json({ error: 'Listing not found' })
    if (listing.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

    if (!process.env.PINECONE_API_KEY) return res.status(200).json({ success: true, skipped: 'no Pinecone key' })

    const LISTINGS_INDEX = process.env.PINECONE_LISTINGS_INDEX_NAME || 'dealmatch-listings'

    try {
      const index = await getPineconeIndex(LISTINGS_INDEX)
      if (!index) return res.status(200).json({ success: true, skipped: 'no Pinecone key' })

      // A listing that's no longer ACTIVE (sold, paused, removed) has no
      // business showing up in matches - remove it from the vector index
      // instead of leaving a stale entry that keeps getting recommended.
      if (listing.status !== 'ACTIVE') {
        await index.deleteOne(String(listing.id)).catch(() => {})
        return res.status(200).json({ success: true, removed: true, id: listing.id })
      }

      const vector = await getEmbedding(buildListingText(listing), { inputType: 'passage' })
      const { lat, lng } = await getListingLatLng(supabase, listing.id)

      await index.upsert([{
        id: String(listing.id),
        values: vector,
        metadata: {
          title: String(listing.title || '').slice(0, 200),
          category_slug: listing.categories?.slug || '',
          category_name: listing.categories?.name || '',
          type: listing.type,
          price_cents: Number(listing.price_cents) || 0,
          location_name: String(listing.location_name || '').slice(0, 200),
          url_path: `/marketplace/${listing.categories?.slug || ''}/listing/${listing.id}`,
          ...flattenPrimitiveAttributes(listing.attributes),
          ...(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : {}),
        },
      }])

      return res.status(200).json({ success: true, id: listing.id })
    } catch (err) {
      if (err instanceof EmbeddingUnavailableError) {
        console.warn('Skipping listing indexing:', err.message)
        return res.status(200).json({ success: true, skipped: err.message })
      }
      console.error('Pinecone listing index error:', err.message)
      return res.status(500).json({ error: 'Indexing service unavailable' })
    }
  },

  async ['match-listings'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { queryText, categorySlug = null, type = null, lat = null, lng = null, radiusMeters = 15000 } = req.body || {}
    if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
      return res.status(400).json({ error: 'queryText required' })
    }
    if (!process.env.PINECONE_API_KEY) return res.status(200).json({ matches: [], skipped: 'no Pinecone key' })

    const LISTINGS_INDEX = process.env.PINECONE_LISTINGS_INDEX_NAME || 'dealmatch-listings'

    try {
      const index = await getPineconeIndex(LISTINGS_INDEX)
      if (!index) return res.status(200).json({ matches: [], skipped: 'no Pinecone key' })

      const queryVector = await getEmbedding(queryText, { inputType: 'query' })
      const filter = {}
      if (categorySlug) filter.category_slug = { $eq: categorySlug }
      if (type && ['SUPPLY', 'DEMAND'].includes(type)) filter.type = { $eq: type }
      if (typeof lat === 'number' && typeof lng === 'number') Object.assign(filter, boundingBoxFilter(lat, lng, radiusMeters))

      const queryOptions = { vector: queryVector, topK: 30, includeMetadata: true }
      if (Object.keys(filter).length > 0) queryOptions.filter = filter

      const results = await index.query(queryOptions)
      let matches = (results.matches || []).map(m => {
        const distance = (typeof lat === 'number' && typeof m.metadata?.lat === 'number')
          ? distanceMeters(lat, lng, m.metadata.lat, m.metadata.lng) : null
        return { id: m.id, score: m.score, distance_m: distance, ...m.metadata }
      })
      if (typeof lat === 'number') {
        matches = matches
          .filter(m => m.distance_m == null || m.distance_m <= radiusMeters)
          .sort((a, b) => (b.score - a.score) || ((a.distance_m ?? Infinity) - (b.distance_m ?? Infinity)))
      }
      matches = matches.slice(0, 20)
      return res.status(200).json({ matches })
    } catch (err) {
      if (err instanceof EmbeddingUnavailableError) return res.status(200).json({ matches: [], skipped: err.message })
      console.error('match-listings error:', err.message)
      return res.status(500).json({ error: 'Matching service unavailable' })
    }
  },

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
      console.error('[platform:search]', err?.message || err)
      return res.status(200).json({ results: [], degraded: true })
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
    if (req.method === 'GET') {
      try {
        return res.status(200).json({ categories: await getCategoryTree(supabase) })
      } catch (err) {
        console.error('[platform:categories]', err?.message || err)
        return res.status(200).json({ categories: [], degraded: true })
      }
    }
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
      // Hybrid model (ADR-002): a category with source_table set is a legacy
      // vertical (properties/student_hostels/professionals), matched via
      // universal_match() instead of match_category_listings. universal_match
      // returns a different column shape (item_id, source) than
      // match_category_listings (id) -- normalized here so MarketplacePage
      // never needs to know which path it's hitting, and each result gets a
      // detailUrl pointing at wherever that source's REAL detail page lives
      // (only /property/:id actually exists today; student-hostels and
      // professionals don't have per-item pages yet, so those link to their
      // section's landing page instead of a URL that would 404).
      const category = await getCategoryById(supabase, categoryId)
      let matches
      if (category.source_table) {
        const raw = await universalMatch(supabase, category.slug, { lat, lng, radiusMeters, attributeFilter, limit })
        const detailUrl = (source, id) => {
          if (source === 'properties') return `/property/${id}`
          if (source === 'student_hostels') return '/student-hostels'
          if (source === 'professionals') return '/professionals'
          return '/marketplace'
        }
        matches = raw.map(r => ({
          id: r.item_id, title: r.title, price_cents: r.price_cents, location_name: r.location_name,
          lat: r.lat, lng: r.lng, attributes: r.attributes, created_at: r.created_at,
          source: r.source, detailUrl: detailUrl(r.source, r.item_id),
        }))
      } else {
        matches = await findMatches(supabase, { categoryId, type, lat, lng, radiusMeters, attributeFilter, limit })
      }
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

      // Hybrid model (ADR-002): a category with source_table set is a legacy
      // vertical. Its listings live on that legacy table, created through
      // that table's own existing flow (e.g. /list for properties), not
      // through this generic composer, which only ever writes to
      // category_listings. universal_match() never looks at category_listings
      // for a hybrid category, so a listing created here for one would be
      // silently invisible everywhere. Reject it explicitly instead.
      let category
      try {
        category = await getCategoryById(supabase, categoryId)
      } catch {
        return res.status(400).json({ error: 'Unknown category' })
      }
      if (category.source_table) {
        return res.status(400).json({
          error: `${category.name} listings are created through its own page, not this composer.`,
        })
      }

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
    try {
      const tree = await getForumCategoryTree(supabase)
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      return res.status(200).json({ categories: tree })
    } catch (err) {
      console.error('[platform:forum-categories]', err?.message || err)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ categories: [], degraded: true })
    }
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

    if (segments.length === 0) {
      try {
        return res.status(200).json({ kind: 'index', tree: await getForumCategoryTree(supabase) })
      } catch (err) {
        console.error('[platform:forum-resolve:index]', err?.message || err)
        return res.status(200).json({ kind: 'index', tree: [], degraded: true })
      }
    }

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

// ─── Helpers for the index-listing / match-listings resources above ───────
async function getListingLatLng(supabase, id) {
  // location is a PostGIS geography column, not directly readable as
  // lat/lng over PostgREST - reuses the existing RPC (see
  // matchingService.js:findCounterpartMatches for the same pattern).
  const { data } = await supabase.rpc('get_listing_with_latlng', { p_id: id }).single()
  return { lat: typeof data?.lat === 'number' ? data.lat : null, lng: typeof data?.lng === 'number' ? data.lng : null }
}

function buildListingText(listing) {
  const attrs = listing.attributes && typeof listing.attributes === 'object' ? listing.attributes : {}
  const attrText = Object.entries(attrs)
    .filter(([, v]) => v != null && (typeof v !== 'object' || Array.isArray(v)))
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('. ')
  return [
    `${listing.title}`,
    listing.categories?.name ? `Category: ${listing.categories.name}` : '',
    listing.type === 'SUPPLY' ? 'Offering this' : 'Looking for this',
    listing.location_name ? `Location: ${listing.location_name}` : '',
    listing.price_cents ? `Price: NGN ${(listing.price_cents / 100).toLocaleString()}` : '',
    attrText,
    String(listing.description || '').slice(0, 500),
  ].filter(Boolean).join('. ')
}

function flattenPrimitiveAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[`attr_${key}`] = value
    else if (Array.isArray(value) && value.every(v => typeof v === 'string')) out[`attr_${key}`] = value.slice(0, 20)
  }
  return out
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
// completely outside withSecurity - see handleRenderPublic's comment above
// for why. Only requests with ?resource=... go through the secured,
// JSON-API dispatcher below.
async function jsonHandler(req, res) {
  const supabase = createServerClient()
  const resource = req.query.resource
  const fn = resource && jsonResources[resource]
  if (!fn) return res.status(404).json({ error: `Unknown resource: ${resource}` })
  return fn(req, res, supabase)
}

// requireAuth:false at the wrapper level - most resources are public GETs;
// each resource above that needs a signed-in user calls getAuthedUser()
// itself and returns 401 explicitly. This mirrors the pattern already used
// by the individual endpoints this file replaces.
const securedJsonHandler = withSecurity(jsonHandler, { rateLimit: 60, requireAuth: false })

export default async function handler(req, res) {
  // Folded in from the old standalone api/properties-export.js to stay
  // under the serverless function count budget (see
  // scripts/check-architecture-fitness.mjs) -- vercel.json still rewrites
  // the original public path /api/properties-export here unchanged, so a
  // scraper hitting the "discovered" URL sees identical behavior.
  // Deliberately bypasses withSecurity(): the honeypot must accept ANY
  // request shape and always return its convincing-but-empty payload,
  // never a 401/403 that would tip off an attacker that it's a trap.
  if (req.query.resource === 'properties-export') return honeypotHandler(req, res)
  if (req.query.render) return handleRenderPublic(req, res)
  return securedJsonHandler(req, res)
}

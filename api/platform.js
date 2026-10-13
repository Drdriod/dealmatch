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
import { randomUUID } from 'node:crypto'
import { validateAttributes } from '../src/lib/schemaValidation.js'
import { redisRateLimit } from '../src/lib/redis.js'
import { identityHmac, IdentityHashError } from '../src/lib/identityHash.js'
import { flw, alnum, flutterwaveConfigured, isFlutterwaveSandbox } from '../src/lib/flutterwaveServer.js'

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
// Removes identity documents whose 90-day retention window has ended.
// Queue rows are written by a trigger when a profile's document pointer is
// cleared on account deletion. Storage paths may carry a legacy
// 'identity-docs/' prefix, so it is stripped before removal.
async function purgeIdentityDocs(svc) {
  // Queue unreferenced files (superseded or legacy uploads) before purging.
  // Failure here is logged and does not block purging what is already queued.
  const { error: sweepErr } = await svc.rpc('sweep_orphan_identity_docs')
  if (sweepErr) console.error('purge: orphan sweep failed:', sweepErr.message)

  const { data: due, error } = await svc
    .from('identity_doc_purge_queue')
    .select('id, storage_path, attempts')
    .is('purged_at', null)
    .lte('purge_after', new Date().toISOString())
    .lt('attempts', 5)
    .order('purge_after', { ascending: true })
    .limit(200)
  if (error) {
    console.error('purge: failed to load queue', error.message)
    return { purged: 0, failed: 0, error: 'load_failed' }
  }
  if (!due || due.length === 0) return { purged: 0, failed: 0 }

  const withPath = due.filter((r) => r.storage_path)
  const paths = [...new Set(withPath.map((r) => r.storage_path.replace(/^identity-docs\//, '')))]
  let removeErr = null
  if (paths.length > 0) {
    const { error: rmErr } = await svc.storage.from('identity-docs').remove(paths)
    removeErr = rmErr
  }

  const now = new Date().toISOString()
  if (removeErr) {
    console.error('purge: storage remove failed:', removeErr.message)
    for (const r of due) {
      await svc.from('identity_doc_purge_queue')
        .update({ attempts: r.attempts + 1, last_error: removeErr.message.slice(0, 500) })
        .eq('id', r.id)
    }
    return { purged: 0, failed: due.length }
  }

  // Rows with no path have nothing to delete; they are closed out as well.
  const ids = due.map((r) => r.id)
  const { error: updErr } = await svc
    .from('identity_doc_purge_queue')
    .update({ purged_at: now, storage_path: null, last_error: null })
    .in('id', ids)
  if (updErr) console.error('purge: marking rows purged failed:', updErr.message)
  return { purged: ids.length, failed: 0 }
}

const jsonResources = {
  // ── Account deletion (Google Play / App Store requirement) ───────────
  // POST { confirm: 'DELETE' } with the user's bearer token. GET returns
  // what is currently blocking deletion. Personal data is erased in
  // public.erase_account_data(); the auth user is then anonymised and
  // banned (never hard-deleted: financial records reference it, see
  // 20261003000001_account_deletion.sql). Lives here to stay inside the
  // serverless function count budget.
  async ['delete-account'](req, res, supabase) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Account deletion is temporarily unavailable. Please contact support.' })
    }
    const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

    if (req.method === 'GET') {
      const { data, error } = await svc.rpc('account_deletion_blockers', { p_user: user.id })
      if (error) return res.status(500).json({ error: 'Could not check your account' })
      return res.status(200).json({ blockers: data || [] })
    }

    if ((req.body || {}).confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm' })
    }

    const { data, error } = await svc.rpc('erase_account_data', { p_user: user.id })
    if (error) {
      console.error('[platform:delete-account] erase failed', error.message)
      return res.status(500).json({ error: 'Could not delete your account. Please try again or contact support.' })
    }
    if (!data?.ok) return res.status(409).json({ error: 'Your account cannot be deleted yet.', blockers: data?.blockers || [] })

    // Anonymise and lock the login. A random placeholder email frees the
    // real address for re-registration and removes the personal data.
    const { error: authErr } = await svc.auth.admin.updateUserById(user.id, {
      email: `deleted+${user.id}@deleted.dealmatch.com.ng`,
      phone: '',
      password: randomUUID() + randomUUID(),
      ban_duration: '876000h',
      user_metadata: {},
      app_metadata: { deleted: true },
    })
    if (authErr) {
      console.error('[platform:delete-account] auth anonymise failed', authErr.message)
      // Data is already erased; still try to at least lock the login.
      await svc.auth.admin.updateUserById(user.id, { ban_duration: '876000h' }).catch(() => {})
    }
    return res.status(200).json({ ok: true })
  },

  // ── Flutterwave V4: collections and automated payouts ───────────────
  // Folded in here (not separate files) to stay inside the serverless
  // function budget, same as every resource in this file.
  //   - payment-virtual-account (POST): a payer gets a dynamic bank account
  //     number for one payment. The transfer lands via api/flutterwave-webhook.js.
  //   - payment-status (GET): the payer's own payment row. Owner-only by RLS.
  //   - cron-process-payouts: Vercel Cron pays out queued transactions as
  //     V4 bank transfers (recipient first, then transfer).
  //   - payout-banks / payout-resolve-account: PayoutSetupPage.jsx.
  async ['payment-virtual-account'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    const rl = await redisRateLimit(req, 'pay_va', 10, 60, true, { failClosed: true })
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !flutterwaveConfigured()) {
      return res.status(503).json({ error: 'Payment service not configured' })
    }

    // The browser names what it is paying for and the record it belongs to.
    // It does NOT name the amount or the metadata: the server works both out
    // from the database (resolvePayment below), so a payer cannot pick a price
    // or claim a different purpose.
    const { reference, purpose, subject } = req.body || {}
    if (!reference || typeof reference !== 'string' || !/^[a-zA-Z0-9-]{6,42}$/.test(reference)) {
      return res.status(400).json({ error: 'Invalid reference' })
    }
    // The payer is always the signed-in account. The webhook matches the
    // transfer back to this email, so it must be the account's own email.
    const email = user.email
    if (!email || typeof email !== 'string' || email.length > 254) {
      return res.status(400).json({ error: 'Your account needs an email address to pay' })
    }

    const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

    // Retries of the same reference return the same account, but only to its owner.
    const { data: existing } = await svc
      .from('payment_virtual_accounts')
      .select('*')
      .eq('reference', reference)
      .maybeSingle()
    if (existing) {
      if (existing.profile_id !== user.id) return res.status(409).json({ error: 'Reference already in use' })
      return res.status(200).json(publicVirtualAccount(existing))
    }

    // Price and validate the payment from the database. Throws PaymentError
    // for anything the payer may not pay for (not their record, switched off,
    // already paid, unavailable room).
    let plan
    try {
      plan = await resolvePayment(svc, { purpose, subject: subject && typeof subject === 'object' ? subject : {}, reference, user })
    } catch (err) {
      if (err instanceof PaymentError) return res.status(err.status).json({ error: err.message })
      console.error('payment-virtual-account: could not price payment:', err.message)
      return res.status(500).json({ error: 'Could not start payment. Please try again.' })
    }
    const metadata = plan.metadata
    const amountKobo = Math.round(plan.amountNaira * 100)
    if (!Number.isFinite(amountKobo) || amountKobo <= 0 || amountKobo > 1e12) {
      return res.status(409).json({ error: 'This payment has no valid amount' })
    }

    try {
      // Flutterwave rejects a second customer with the same email, so reuse the
      // one we already created for this email. Only our own rows are used.
      const { data: prior } = await svc
        .from('payment_virtual_accounts')
        .select('customer_id')
        .eq('email', email)
        .not('customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const customer = prior?.customer_id
        ? { id: prior.customer_id }
        : await flw('POST', '/customers', {
            body: { email },
            idempotencyKey: idemKey('dmcus', reference),
          })
      const va = await flw('POST', '/virtual-accounts', {
        body: {
          customer_id: customer.id,
          reference,
          currency: 'NGN',
          account_type: 'dynamic',
          amount: amountKobo / 100, // Flutterwave takes naira
          expiry: VA_TTL_SECONDS,
          narration: 'DealMatch payment',
          meta: metadata,
        },
        idempotencyKey: idemKey('dmva', reference),
        // Sandbox only: tells Flutterwave's sandbox to approve the transfer,
        // so a test account can be paid. Never sent to live.
        extraHeaders: isFlutterwaveSandbox() ? { 'X-Scenario-Key': 'issuer:approved' } : undefined,
      })

      const row = {
        reference,
        profile_id: user.id,
        email,
        customer_id: customer.id,
        virtual_account_id: va.id,
        account_number: va.account_number,
        bank_name: va.account_bank_name ?? null,
        expected_kobo: amountKobo,
        status: 'pending',
        metadata,
        expires_at: va.account_expiration_datetime ?? new Date(Date.now() + VA_TTL_SECONDS * 1000).toISOString(),
      }
      const { error: insErr } = await svc.from('payment_virtual_accounts').insert(row)
      if (insErr) {
        console.error('payment-virtual-account: insert failed', insErr.message)
        return res.status(500).json({ error: 'Could not start payment. Please try again.' })
      }
      return res.status(200).json(publicVirtualAccount(row))
    } catch (err) {
      console.error('payment-virtual-account failed:', err.message)
      return res.status(502).json({ error: 'Could not start payment. Please try again.' })
    }
  },

  async ['payment-status'](req, res, supabase) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    const reference = req.query.reference
    if (!reference || typeof reference !== 'string' || !/^[a-zA-Z0-9-]{6,42}$/.test(reference)) {
      return res.status(400).json({ error: 'Invalid reference' })
    }
    // The elevated client runs under the payer's own RLS, so only their row is visible.
    const { data: row, error } = await supabase
      .from('payment_virtual_accounts')
      .select('reference, status, expected_kobo, paid_kobo, paid_at, profile_id')
      .eq('reference', reference)
      .maybeSingle()
    if (error) return res.status(500).json({ error: 'Could not load payment' })
    if (!row || row.profile_id !== user.id) return res.status(404).json({ error: 'Payment not found' })

    return res.status(200).json({
      reference: row.reference,
      status: row.status,
      paid: row.status === 'paid',
      amountNaira: Number(row.expected_kobo) / 100,
      paidAt: row.paid_at,
    })
  },

  // Identity (ADR-009): the NIN/BVN is hashed here with a server-side key and only
  // the hash is stored. The raw number is never written to the database.
  // Approval by staff then sets Level 1 (see sync_identity_to_provider in the DB).
  async ['identity-submit'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user, error: authError } = await getAuthedUser(req, supabase)
    if (authError) return res.status(401).json({ error: authError })

    // Fail closed: this route creates identity links, so Redis trouble must deny, not allow.
    const rl = await redisRateLimit(req, `identity-submit:${user.id}`, 5, 60 * 60, false, { failClosed: true })
    if (!rl.allowed) return res.status(429).json({ error: rl.message || 'Too many attempts. Try again later.' })

    if (!process.env.IDENTITY_HMAC_KEY) {
      console.error('identity-submit: IDENTITY_HMAC_KEY is not set')
      return res.status(503).json({ error: 'Identity service is not configured.' })
    }
    let hash
    try {
      hash = identityHmac(req.body?.nin)
    } catch (err) {
      if (err instanceof IdentityHashError) return res.status(400).json({ error: 'Enter your 11-digit NIN or BVN.' })
      throw err
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Identity service is not configured.' })
    }
    const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: current } = await svc
      .from('profiles').select('identity_verification_status').eq('id', user.id).maybeSingle()
    if (current?.identity_verification_status === 'approved') {
      return res.status(409).json({ error: 'Your identity is already verified.' })
    }

    const { error } = await svc.from('profiles').update({
      identity_hmac: hash,
      identity_nin_submitted_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This NIN/BVN is already linked to another account. Contact support if this is a mistake.' })
      }
      console.error('identity-submit failed:', error.message)
      return res.status(500).json({ error: 'Could not save your NIN/BVN. Please try again.' })
    }
    return res.status(200).json({ ok: true })
  },

  async ['cron-process-payouts'](req, res) {
    // Not a signed-in-user resource - Vercel Cron calls this with no user
    // session, so it is gated by a shared secret, the same pattern the
    // gateway webhooks use.
    const cronSecret = process.env.CRON_SECRET
    const auth = req.headers.authorization
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Verification expiry runs on this daily cron (ADR-009), even when payouts are not configured.
    let demoted = null
    let purged = null
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const maint = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: n, error: demoteErr } = await maint.rpc('demote_expired_verifications')
      if (demoteErr) console.error('cron: demote_expired_verifications failed:', demoteErr.message)
      else demoted = n
      // Identity documents are removed 90 days after account deletion (ADR-009).
      purged = await purgeIdentityDocs(maint)
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !flutterwaveConfigured()) {
      return res.status(200).json({ processed: 0, skipped: 'payouts not configured', demoted, purged })
    }

    const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: rows, error } = await svc
      .from('payout_queue')
      .select('id, transaction_id, profile_id, payout_account_id, amount_cents, attempts')
      .eq('status', 'pending')
      .lt('attempts', 5) // never retry forever - a row stuck at 5 failures needs an admin
      .order('created_at', { ascending: true })
      .limit(20)

    if (error) {
      console.error('cron-process-payouts: failed to load queue', error.message)
      return res.status(500).json({ error: 'Failed to load payout queue' })
    }

    let processed = 0, failed = 0
    for (const row of rows || []) {
      try {
        await svc.from('payout_queue').update({ attempts: row.attempts + 1 }).eq('id', row.id)

        // Defence in depth: pay only what the transaction says is owed, to the
        // account it was accepted with, once the deal is completed. Anything
        // else is held for a person to look at, not retried.
        const { data: tx } = await svc.from('transactions')
          .select('id, status, payout_status, provider_payout_account_id, amount_cents, commission_amount_cents')
          .eq('id', row.transaction_id).maybeSingle()
        const owedKobo = tx ? Number(tx.amount_cents || 0) - Number(tx.commission_amount_cents || 0) : null
        const matches = tx
          && tx.status === 'COMPLETED'
          && tx.payout_status === 'queued'
          && String(tx.provider_payout_account_id) === String(row.payout_account_id)
          && Number(row.amount_cents) === owedKobo
          && Number(row.amount_cents) > 0
        if (!matches) {
          const held = new Error('Payout does not match its completed transaction; held for review')
          held.holdForReview = true
          throw held
        }

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
          throw new Error('Payout account is missing a bank code - ask the provider to resubmit their bank details')
        }

        // V4 transfers pay a saved recipient. Create it once per payout
        // account and store its id, so later payouts and retries reuse it.
        let recipientId = account.gateway_recipient_code
        if (!recipientId) {
          const recipient = await flw('POST', '/transfers/recipients', {
            body: {
              type: 'bank_ngn',
              bank: { account_number: account.account_number, code: account.bank_code },
            },
            idempotencyKey: idemKey('dmrcp', account.id),
          })
          recipientId = recipient.id
          await svc.from('payout_accounts').update({ gateway_recipient_code: recipientId }).eq('id', account.id)
        }

        // The reference is stable per queue row: Flutterwave rejects a
        // duplicate reference, so a crash between sending and recording
        // cannot pay out twice.
        const transferReference = `payout-${row.id}`
        const transfer = await flw('POST', '/transfers', {
          body: {
            action: 'instant',
            reference: transferReference,
            narration: `DealMatch payout - transaction #${row.transaction_id}`,
            payment_instruction: {
              source_currency: 'NGN',
              destination_currency: 'NGN',
              amount: { applies_to: 'destination_currency', value: row.amount_cents / 100 }, // naira; amount_cents is kobo
              recipient_id: recipientId,
            },
          },
          idempotencyKey: idemKey('dmpayout', row.id),
        })

        // Still in flight until the transfer.success / transfer.failed
        // webhook confirms it. gateway_ref is our reference, which the webhook matches.
        await svc.from('payout_queue').update({
          status: 'processing',
          gateway_ref: transferReference,
        }).eq('id', row.id)
        await svc.from('transactions').update({ payout_ref: String(transfer.id ?? transferReference) }).eq('id', row.transaction_id)

        processed++
      } catch (err) {
        failed++
        console.error(`cron-process-payouts: row ${row.id} failed:`, err.message)
        // A mismatch is never retried: it goes straight to 'failed' for review.
        const giveUp = err.holdForReview || row.attempts + 1 >= 5
        await svc.from('payout_queue').update({
          status: giveUp ? 'failed' : 'pending',
          failure_reason: String(err.message).slice(0, 500),
        }).eq('id', row.id)
        if (giveUp) {
          await svc.from('transactions').update({ payout_status: 'failed' }).eq('id', row.transaction_id)
        }
      }
    }

    return res.status(200).json({ processed, failed, total: (rows || []).length })
  },

  async ['payout-banks'](req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    if (!flutterwaveConfigured()) return res.status(200).json({ banks: [] })
    try {
      const data = await flw('GET', '/banks?country=NG')
      const banks = (Array.isArray(data) ? data : [])
        .map(b => ({ name: b.name, code: b.code }))
        .sort((a, b) => a.name.localeCompare(b.name))
      res.setHeader('Cache-Control', 'public, max-age=3600') // bank list barely ever changes
      return res.status(200).json({ banks })
    } catch (err) {
      console.error('payout-banks failed:', err.message)
      return res.status(200).json({ banks: [] })
    }
  },

  async ['payout-resolve-account'](req, res, supabase) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { user } = await getAuthedUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    if (!flutterwaveConfigured()) return res.status(200).json({ resolved: false })

    const { accountNumber, bankCode } = req.body || {}
    if (!accountNumber || !bankCode) return res.status(400).json({ error: 'accountNumber and bankCode required' })
    if (!/^\d{10}$/.test(String(accountNumber))) return res.status(400).json({ error: 'Account number must be 10 digits' })

    try {
      const data = await flw('POST', '/banks/account-resolve', {
        body: { currency: 'NGN', account: { code: String(bankCode), number: String(accountNumber) } },
      })
      if (!data?.account_name) {
        return res.status(200).json({ resolved: false, error: 'Could not resolve this account' })
      }
      return res.status(200).json({ resolved: true, accountName: data.account_name })
    } catch (err) {
      console.error('payout-resolve-account failed:', err.message)
      return res.status(200).json({ resolved: false, error: 'Could not resolve this account' })
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

// ─── Flutterwave V4 helpers ─────────────────────────────────────────────────
const VA_TTL_SECONDS = 86400 // a dynamic account can be paid for 24 hours

// Flutterwave idempotency keys are 12-255 alphanumeric characters.
function idemKey(prefix, value) {
  return `${prefix}${alnum(value)}`.padEnd(12, '0').slice(0, 255)
}

// Only short, simple string or number values go to Flutterwave and the DB.
function publicVirtualAccount(row) {
  return {
    reference: row.reference,
    accountNumber: row.account_number,
    bankName: row.bank_name,
    amountNaira: Number(row.expected_kobo) / 100,
    expiresAt: row.expires_at,
    status: row.status,
    // Lets the page open the record this payment created (a hotel booking).
    bookingId: row.metadata?.booking_id || null,
  }
}

// ─── Payment resolution ─────────────────────────────────────────────────────
// Every paid purpose is priced here from the database. The browser supplies
// only the id of the record being paid for (and, for unlock packs, the pack
// key). The server checks that the signed-in user owns that record, reads the
// amount from the record or from the platform fee registry, creates any pending
// record needed, and returns the amount plus the metadata the webhook trusts.
class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const UNLOCK_PACKS = { unlock_credit_single: 1, unlock_credit_pack_5: 5 } // key -> credits
const PRO_PLAN_FEE = { monthly: 'professional_monthly', annual: 'professional_annual' }
const HOSTEL_PLAN_FEE = { semester: 'hostel_listing_semester', annual: 'hostel_listing_annual' }

// The current price for a channel. Refuses to charge while it is switched off.
async function platformFeeNaira(svc, key) {
  const { data, error } = await svc.from('platform_fees').select('value, is_active').eq('key', key).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active) {
    throw new PaymentError('This payment is not available right now. Please try again later.', 409)
  }
  return Number(data.value)
}

async function resolvePayment(svc, { purpose, subject, reference, user }) {
  switch (purpose) {
    // Rent or sale protection: the escrow row was created by
    // start_property_escrow_payment with this reference, for this buyer.
    case 'escrow_payment': {
      const { data: esc } = await svc.from('escrow_transactions')
        .select('id, property_id, gross_amount, status, buyer_id')
        .eq('payment_ref', reference).maybeSingle()
      if (!esc || esc.buyer_id !== user.id) throw new PaymentError('Reservation not found', 404)
      if (esc.status !== 'awaiting_payment') throw new PaymentError('This reservation is no longer waiting for payment', 409)
      return {
        amountNaira: Number(esc.gross_amount),
        metadata: { type: 'escrow_payment', user_id: user.id, escrow_id: esc.id, property_id: esc.property_id },
      }
    }

    // Marketplace job: the transaction was bound to this reference server-side.
    case 'transaction_escrow': {
      const { data: tx } = await svc.from('transactions')
        .select('id, requester_id, amount_cents, status')
        .eq('payment_ref', reference).maybeSingle()
      if (!tx || tx.requester_id !== user.id) throw new PaymentError('Transaction not found', 404)
      if (tx.status !== 'PENDING') throw new PaymentError('This job is not waiting for payment', 409)
      return {
        amountNaira: Number(tx.amount_cents) / 100,
        metadata: { type: 'transaction_escrow', user_id: user.id, transaction_id: tx.id },
      }
    }

    case 'professional_subscription': {
      const planType = subject.plan_type === 'annual' ? 'annual' : 'monthly'
      const { data: app, error } = await svc.from('professional_applications')
        .select('id, user_id, professional_type')
        .eq('id', clean(subject.application_id, 64)).maybeSingle()
      if (error || !app || app.user_id !== user.id) throw new PaymentError('Application not found', 404)
      return {
        amountNaira: await platformFeeNaira(svc, PRO_PLAN_FEE[planType]),
        metadata: {
          type: 'professional_subscription', user_id: user.id, application_id: app.id,
          professional_type: app.professional_type || '', plan_type: planType,
        },
      }
    }

    case 'hostel_listing_fee': {
      const plan = subject.plan === 'annual' ? 'annual' : 'semester'
      const { data: hostel, error } = await svc.from('student_hostels')
        .select('id, owner_id').eq('id', clean(subject.hostel_id, 64)).maybeSingle()
      if (error || !hostel || hostel.owner_id !== user.id) throw new PaymentError('Listing not found', 404)
      const amountNaira = await platformFeeNaira(svc, HOSTEL_PLAN_FEE[plan])
      // The paid-listing check in the webhook compares against this row.
      const { error: payErr } = await svc.from('hostel_payments').insert({
        hostel_id: hostel.id, owner_id: user.id, reference, amount: amountNaira, plan, status: 'pending',
      })
      if (payErr) throw new PaymentError('Could not start the listing payment. Please try again.', 500)
      return {
        amountNaira,
        metadata: { type: 'hostel_listing_fee', user_id: user.id, hostel_id: hostel.id, plan, listing_type: 'student_hostel' },
      }
    }

    case 'contact_unlock_credits': {
      const pack = clean(subject.pack, 64)
      if (!Object.prototype.hasOwnProperty.call(UNLOCK_PACKS, pack)) throw new PaymentError('Unknown unlock pack', 400)
      return {
        amountNaira: await platformFeeNaira(svc, pack),
        metadata: { type: 'contact_unlock_credits', user_id: user.id, credits: String(UNLOCK_PACKS[pack]), pack },
      }
    }

    case 'hotel_booking':
      return createHotelBooking(svc, { subject, reference, user })

    default:
      throw new PaymentError('Unknown payment type', 400)
  }
}

// A hotel or short-let booking. The price, availability and fee are all
// worked out here. The booking is created as 'pending' and becomes 'confirmed'
// only when the webhook sees the transfer. Pending bookings stop holding rooms
// after the payment window (VA_TTL_SECONDS) passes.
async function createHotelBooking(svc, { subject, reference, user }) {
  const s = subject || {}
  const checkin = clean(s.checkin, 10)
  const checkout = clean(s.checkout, 10)
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)
    || !(nights > 0) || nights > 90 || Date.parse(checkin) < Date.now() - 86400000) {
    throw new PaymentError('Check-in and check-out dates are not valid', 400)
  }
  const rooms = Math.floor(Number(s.rooms))
  if (!(rooms >= 1 && rooms <= 20)) throw new PaymentError('Choose between 1 and 20 rooms', 400)
  const guestName = clean(s.guest_name, 120)
  const guestPhone = clean(s.guest_phone, 30)
  if (!guestName || !guestPhone) throw new PaymentError('Guest name and phone are required', 400)

  const { data: property, error } = await svc.from('properties')
    .select('id, category, status, room_categories(id, name, price_per_night, available_rooms, is_active)')
    .eq('id', clean(s.property_id, 64)).maybeSingle()
  if (error || !property || property.status !== 'active' || !['hotel', 'shortlet'].includes(property.category)) {
    throw new PaymentError('This property is not available for booking', 404)
  }
  const cats = (property.room_categories || []).filter((c) => c.is_active !== false)
  const cat = cats.find((c) => c.name === clean(s.room_type, 120)) || cats[0]
  if (!cat || !(Number(cat.price_per_night) > 0)) throw new PaymentError('No room price is set for this property', 409)

  // Rooms held for these dates: every confirmed booking, and pending ones still
  // inside the payment window.
  const since = new Date(Date.now() - VA_TTL_SECONDS * 1000).toISOString()
  const overlapping = () => svc.from('bookings').select('rooms_booked')
    .eq('property_id', property.id).eq('category_id', cat.id)
    .lt('checkin_date', checkout).gt('checkout_date', checkin)
  const [{ data: confirmed }, { data: pending }] = await Promise.all([
    overlapping().eq('status', 'confirmed'),
    overlapping().eq('status', 'pending').gte('created_at', since),
  ])
  const held = [...(confirmed || []), ...(pending || [])]
    .reduce((n, b) => n + (Number(b.rooms_booked) || 1), 0)
  if (held + rooms > Number(cat.available_rooms || 0)) {
    throw new PaymentError('Sorry, those rooms are no longer available for these dates.', 409)
  }

  const feeRate = await platformFeeNaira(svc, 'hotel_booking') // a percentage of the room charge
  const subtotal = Number(cat.price_per_night) * rooms * nights
  const fee = Math.round(subtotal * feeRate / 100)
  const total = subtotal + fee

  const { data: booking, error: bookErr } = await svc.from('bookings').insert({
    property_id: property.id,
    category_id: cat.id,
    room_type: cat.name,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: clean(s.guest_email, 254) || user.email,
    checkin_date: checkin,
    checkout_date: checkout,
    rooms_booked: rooms,
    guests: Math.min(Math.max(Math.floor(Number(s.guests) || 1), 1), 50),
    total_amount: total,
    platform_fee_ngn: fee,
    payment_ref: reference,
    source: 'dealmatch',
    status: 'pending',
    notes: clean(s.notes, 500),
    user_id: user.id,
  }).select('id').single()
  if (bookErr || !booking) throw new PaymentError('Could not reserve the rooms. Please try again.', 500)

  return {
    amountNaira: total,
    metadata: { type: 'hotel_booking', user_id: user.id, booking_id: booking.id, platform_fee_ngn: String(fee) },
  }
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

# ADR-009: Provider Directory Visibility and Level 1 Job Caps

## Status

**Proposed.** Not accepted until the founder signs off. Supersedes ADR-008 only for directory visibility and the Level 1 cap. Ratings, identity storage and retention are separate sections below.

## Context

ADR-008 hides Level 1 (identity verified) providers from the "Find a Provider" directory. Only Level 2 (skill verified) and Level 3 (trusted) providers appear. The product spec wants Level 1 shown, so new providers can earn while their portfolio is reviewed.

The current code filters with `level >= 2` in `src/pages/Provider/FindProviderPage.jsx`.

## Decision (proposed)

1. **Directory visibility (Option C).** The default search shows Level 2+. Level 1 providers appear only under an explicit "Identity Verified" tab or toggle. Level 1 is never mixed into the default list.
2. **Level 1 cap.** A requester may spend at most 50,000 NGN in total with one Level 1 provider in any rolling 30-day window. Enforced by the database trigger `trg_enforce_level1_cap` on `public.transactions`. Every write path is covered, so no client or agent route can bypass it. The cap applies only to Level 1 providers.
3. **Verified-only filter.** "Verified only" means Level 2+. Level 1 is excluded from it.
4. **Bayesian rating.** `(5 × 4.0 + sum of ratings) ÷ (5 + count)`, computed by the trigger `trg_refresh_provider_rating` on `public.reviews`. A new provider starts at 4.00, not 5.00.
5. **Launch search filters.** Four filters, served by `search_providers_rpc` (SECURITY INVOKER, so RLS applies): location radius, minimum level, category, and minimum rating.
6. **Verification expiry.** When `verification_expires_at` passes, the provider drops one level. `demote_expired_verifications()` is not yet scheduled.

## Server-only payment fields (SEC-3)

- The Flutterwave webhook is the only writer of `student_hostels.listing_paid`, `listing_paid_at` and `payment_ref`.
- `hostel_payments` status moves from `pending` to `success` or `failed` only in the webhook.
- The browser no longer writes either table. The owner RLS policy previously allowed any column update, so `trg_guard_listing_payment_fields` now blocks these changes for non-privileged roles.

## Identity numbers (SEC-1)

- NIN and BVN are never stored. The stored value is `identity_hmac`, an HMAC-SHA256 keyed with `IDENTITY_HMAC_KEY`, computed in `src/lib/identityHash.js`.
- A unique partial index on `identity_hmac` blocks a second provider account for the same identity.
- Key rotation breaks duplicate detection until hashes are recomputed. This needs its own runbook before rotation.

## Rate limiting (SEC-2)

`redisRateLimit(..., { failClosed: true })` denies requests in production when Redis is missing, unreachable or returns an unexpected response. It is applied to admin login and the virtual-account payment route. Other routes keep fail-open.

## Data retention

**Decided by the founder:** raw identity documents (ID image and selfie) are deleted **90 days after account deletion**.

How it is implemented:

- `trg_queue_identity_doc_purge` on `profiles` writes a row to `identity_doc_purge_queue` in the same transaction that `erase_account_data()` clears the document pointers. No deletion path can skip the queue.
- The daily cron (`cron-process-payouts`, which runs whether or not payouts are configured) calls `purgeIdentityDocs()`. It removes objects from the private `identity-docs` bucket once `purge_after` has passed, then sets `purged_at` and clears `storage_path`. Up to 200 rows per run, with at most 5 attempts per row.
- Queue rows are readable and writable only by the service role.

Not covered by this decision:

- **Replacement uploads.** A re-upload points the profile at a new path, and the old object is not queued, so it stays in the bucket until something else removes it. Only the paths current at deletion are queued. Needs a decision: either queue superseded paths when they are replaced, or accept the gap.
- **Student ID images** (`StudentVerifyPage`, `id_image_url`) are not on the erasure path. They need the same treatment.

**Still open for counsel.** AML/KYC record-keeping may require longer retention (see the questions below). If it applies, the 90-day rule is overridden for those records and this section changes.

Questions for counsel:
1. Is DealMatch, or its escrow activity, an entity subject to CBN or NFIU AML/CFT rules?
2. If so, which KYC records must be kept, for how long, and where?
3. Do the Nigeria Data Protection Act 2023 section references in internal drafts check out? Counsel should verify them against the Act.
4. Is a Data Protection Impact Assessment needed before identity verification goes live?

## Known gaps (not fixed here)

- **Rating farming (RATE-3).** Reviews now need a `transaction_id` for a COMPLETED transaction, enforced by trigger, and only linked reviews count toward rating. Legacy reviews without a `transaction_id` are excluded. Verify this in staging before closing.
- **Location is empty.** `verified_providers.location` has no writer yet, so the search returns nothing until providers set a location.
- **Find a Provider UI.** The page still reads `verified_providers` directly with `level >= 2`. It needs wiring to `search_providers_rpc` and the Option C tab. This is a UI change, and it must keep the existing brand and Figma design.
- **Cap wording at the UI.** The Level 1 cap error comes from the database and must be shown to the client in plain language.
- **Expiry scheduling.** `demote_expired_verifications()` must be called from an existing cron handler.
- **Level 0 providers.** Not capped or blocked by this migration. Decide whether level 0 should be listable at all.

## Consequences

- Positive: cold-start supply is addressed. High-value work stays with vetted providers. The cap and the listing unlock can't be bypassed from the browser.
- Negative: more trigger logic in the database. Those triggers need tests before launch.

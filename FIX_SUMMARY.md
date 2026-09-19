# DealMatch - Fix Pass Summary

This covers everything changed in this pass, organized by the original request list, plus
the role/status bug found and fixed along the way. Read the "New environment variables
required" section before deploying - several features are inert (fail safe, not silently
broken) without their keys set.

## 1. Real AI matching + location, for every service (not just Real Estate)

- `src/lib/ai.js` (new): the one place that calls a real embedding model -
  Pinecone's own hosted inference API (`multilingual-e5-large`, 1024 dims),
  not a separate provider, so this needs nothing beyond the
  `PINECONE_API_KEY` you already have. Replaces the `Math.random()` vector
  stubs that used to live in `api/match.js` and `api/index-property.js`.
  **Action required**: create (or recreate) your Pinecone index(es) with
  dimension `1024` and metric `cosine` - see the env var table below.
- `api/match.js`, `api/index-property.js`: now call the real embedding, and
  index/query `latitude`/`longitude` as Pinecone metadata, with a bounding-box
  geo filter (`boundingBoxFilter` in `ai.js`) - location-aware matching for
  properties, which didn't exist before at all.
- `api/platform.js`: two new resources, `index-listing` and `match-listings`,
  covering every `category_listings` row - i.e. every people-and-places
  service on the platform, not just Real Estate. Folded into `platform.js`
  (not standalone files) to stay under Vercel's serverless function count.
- `src/modules/listings/listingsService.js`: `createListing`/`updateListingStatus`
  now fire-and-forget index/re-index every listing automatically.
- `src/modules/matching/matchingService.js`: new `aiMatchListings()` client
  helper.
- `src/pages/Search/SearchPage.jsx` (new): the actual page that uses all of
  this - see item 4 below.

## 2. Optional payment for contact unlock (+ the requested "crazy idea")

- New migration: `20260915000003_contact_unlock_credits.sql` - a prepaid
  credit wallet (`unlock_credit_ledger`, `contact_unlocks`), `spend_unlock_credit()`,
  and `get_provider_contact()` (providers had **no** unlock mechanism at all
  before this - just a static "Phone locked" badge with nothing behind it).
  `get_property_contact()` is extended, not replaced, so full-escrow unlock
  still works exactly as before.
- `src/lib/paystack.js`: `buyUnlockCredits()` + `UNLOCK_CREDIT_PACKS` (₦500/1,
  ₦2,000/5 - bundling to reward repeat buyers).
- `src/components/ui/UnlockContactButton.jsx` (new): reusable button, wired
  into `ProviderProfilePage.jsx` and `RentalsPage.jsx`'s interest modal.
- `api/paystack-webhook.js`: new `contact_unlock_credits` case - credits are
  only ever granted after Paystack confirms the charge, same principle as
  every other payment type here.
- **The crazy idea** (described, not built - this is a new product decision,
  not a bug fix): sell unlock credits as **bundles with a "Skip the line"
  add-on** - when a listing has many simultaneous contact requests, let a
  buyer optionally pay a small premium to have their message shown to the
  provider/landlord first. This decouples revenue from deal-closing success
  entirely: DealMatch earns from *attention*, not just completed GMV, so
  income doesn't dry up in a slow month even if fewer deals close. Genuinely
  worth prototyping, but it's new scope, not something to silently ship
  inside a bug-fix pass.

## 3 & 6. Server-side payment enforcement before service release

- Audited `accept_bid()`, `confirm_transaction_buyer/provider()`, and the
  Paystack webhook's escrow-funding path - this was already solid (rate
  locked at deal creation, dual confirmation required, `status = 'FUNDED'`
  enforced before either party can confirm). No gap found here.
- The actual enforcement gap was in the **rental flow** (see item 7) and in
  **payout release never finishing** (see item 8) - both fixed.

## 4. Universal search

- `src/pages/Search/SearchPage.jsx` (new) + `/search` route: federates
  `universal_search()` (existing, now actually wired to a page) with the new
  AI/location matching. Replaces `HeroSearch`'s old client-side keyword guess
  between `/places` and `/providers`.

## 5. Homepage + HowItWorksFlip copy/behavior

- `HomePage.jsx`: hero headline/subheadline, single "Offer something" CTA,
  two-doors section, new trust section - all per the approved "after" copy.
- `HowItWorksFlip.jsx`: 4 steps (Tell us / Options / Choose / Done).
  **Correction applied**: an earlier draft of this added tap-to-flip: per
  explicit instruction, that was reverted. This is auto-cycle only, same as
  the original, just with the new 4-step copy.

## 7. Traced and fixed

- **Homepage search routing**: fixed, see item 4.
- **Rental flow (was WhatsApp-only, no escrow)**: `RentalsPage.jsx`'s
  interest modal used to save a lead and then open `wa.me` directly - the
  entire deal happened off-platform with no escrow and no payment
  enforcement. Now routes into the same `PropertyReserveModal` escrow flow
  `PropertyPage.jsx` already used for sales (same `properties` table, so the
  infrastructure applies unchanged), plus the optional credit-unlock path.
- **Provider/host flow**: `accept_bid`, verification levels, bidding were
  already solid. Payout automation was the real gap - see item 8.
- **Payment flow**: escrow funding and dual confirmation were solid.
  `release_held_payment()` had a literal `-- TODO Phase 2b` and never
  actually paid anyone - see item 8.

## 8. Automated payouts + admin UI

- New migration `20260915000002_automated_payouts.sql`: `payout_queue`
  table, `payout_accounts.bank_code`, `release_held_payment()` now enqueues
  instead of stopping.
- `api/platform.js`: `cron-process-payouts` (Vercel Cron, every 10 minutes -
  see `vercel.json`) creates a real Paystack transfer recipient + initiates
  the transfer. `paystack-banks` / `paystack-resolve-account` back the new
  bank picker in `PayoutSetupPage.jsx` (free-text bank name couldn't produce
  a Paystack bank code, which is required to pay anyone automatically).
- `api/paystack-webhook.js`: `transfer.success`/`transfer.failed` now
  actually finalize the payout (previously just `console.log`).
- **Admin UI** (`AdminPage.jsx`): new **Payouts** tab (verify/reject payout
  accounts, view/retry the automated queue, fulfill/reject manual withdrawal
  requests) and **Platform Fees** tab (create/expire/archive `commissions`
  rows - the backend rate-scheduling engine already existed, nothing in the
  admin UI ever wrote to it).

## Also fixed: the role/account_status bug (not on the original list)

Flagged during review of the Users admin screen: `profiles.role` was doing
double duty as both staff/persona identity and moderation status. Confirmed
as an active bug, not just messy: `unsuspend` did
`role = (role === 'suspended' ? 'buyer' : role)`, so suspending and then
unsuspending an admin/agent/verifier **permanently demoted them to buyer**.
Tracing every place that wrote `role = 'suspended'` (not just the
client-side ones - this took two passes to find them all) turned up four
occurrences total: the admin panel's suspend/unsuspend action, staff
deactivate, agent suspend/reinstate, and a **database trigger**
(`fn_process_complaint_resolution()` - an agent auto-suspends after 3
upheld complaints) that had the identical bug, entirely independent of any
client code.

Fixed, all in `20260915000000_fix_role_status_conflation.sql`:
- `role` is untouched otherwise - every persona value
  (buyer/seller/renter/landlord/investor/student/professional) and staff
  value (admin/agent/verifier/lender) still works exactly as before.
- `account_status` (active/suspended/deleted) is now the one place
  moderation status lives, and it's actually enforced (`AuthContext.jsx`
  signs a suspended/deleted user out on load - nothing checked this
  before).
- All four places that used to overwrite `role` on suspend now touch
  `account_status` instead, including the complaint-auto-suspend trigger
  and its dependent `v_agent_scorecard` view.
- Admin Users tab: separate Role and Status filters/columns.
- `VerifyIdentityPage.jsx`: removed dead routing to `/landlord`/`/lender`
  (not even registered routes, independent of the role fix) - now always
  lands on `/search`.

**A correction worth being upfront about**: an earlier pass of this fix
also tried to retire the persona values entirely, reasoning they didn't
fit a "two-door" model. That was wrong, based on an incomplete audit that
never actually opened `OnboardingPage.jsx` - which writes exactly those
values to `profiles.role` on every onboarding completion, and treats
`'professional'` as a real, currently-used role with its own
`professional_applications` table. That change was caught before it was
ever applied to a live database (you hadn't run the migrations yet) and
has been removed from this package entirely rather than patched over -
`profiles.role` here behaves exactly as it did in production before any
of this, plus the two real fixes above.

## New environment variables required

| Variable | Used by | Behavior if unset |
|---|---|---|
| `PINECONE_API_KEY` (existing) | AI matching (embeddings + vector search - no separate embedding provider needed) | AI matching skipped, keyword search still works |
| `PINECONE_INDEX_NAME` (existing) | Property matching | Must be an index with dimension **1024**, metric **cosine** (multilingual-e5-large's fixed output size) - if your existing `dealmatch-properties` index was created with a different dimension, recreate it |
| `PINECONE_LISTINGS_INDEX_NAME` | Universal listing matching | Defaults to `dealmatch-listings` - create this index too, same spec: dimension 1024, cosine |
| `CRON_SECRET` | `cron-process-payouts` | Payout cron refuses to run (fails closed, not open) |
| `PAYSTACK_SECRET_KEY` (existing) | Payout automation, bank list, account resolve | Payout cron skips, bank picker returns empty list |

No OpenAI key needed anywhere - deliberately avoided since you didn't already have that account set up.

## Verification performed

Every file touched in this pass was parsed with `esbuild` individually and
in bundle mode (resolves the full local import graph), and the whole app
was built end-to-end with `vite build` - it completes clean. This doesn't
replace running the real test suite or a staging deploy, which I'd
recommend before this goes to production, especially for the payout
automation (real money movement) and the role/status migration (touches
auth).

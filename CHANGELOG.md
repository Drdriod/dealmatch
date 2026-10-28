# DealMatch - Database Security Audit and Hardening (October 2026)

## Unreleased - 28 October 2026

- Docs: `docs/SITEMAP.md` (73 routes, 12 roles, admin tabs) and `docs/runbooks/full-stack-test-plan.md` (12 test seats, scripts per role, hostile and mobile tests, exit criteria).
- Testimonial submission fixed (migration `20261027000000`, applied 27 Oct): the INSERT policy no longer reads its own table.

## Unreleased - 25 October 2026

- Disputes and protected transactions: terms snapshot at funding, the `protected_transactions` view, append-only transaction and dispute logs, `open_dispute`, `add_dispute_note`, `decide_dispute` (a decision is recorded; money after a decision is still moved by staff), private `dispute-evidence` bucket (migration `20261022000000`). Screens: transaction detail, report a problem, case page, admin Disputes tab, trust pages (About, Contact, Help, Protection, Rules).
- Referral codes entered at sign-up are now saved (`apply_referral_code`, migration `20261024000000`). New sign-in page with the animated password rules and referral box.
- Virtual-account payments are retry-safe: paid and fulfilled are separate, one shared charge pipeline, a reconcile job every 10 minutes (GitHub Action) and an "I have already paid" button (migration `20261024020000`).
- Money that is taken but not applied goes on the refund list for every payment purpose, not only job escrow; it is logged as `unapplied` and earns no referral.
- First load: the Sentry SDK loads after the first paint (main download 220 KB to 104 KB). Sentry receives only the account id.
- CI: `npm run check` and the build run on every pull request (job `check`).
- Security: logged-out visitors can no longer read ownerless professional applications (migration `20261025020000`); staff-only functions are no longer callable by logged-out visitors (migration `20261025030000`).
- Category pages: `properties.category_id` is filled from the old `category` word by a trigger (migration `20261025010000`). Three missing foreign-key indexes added (migration `20261025000000`).

## Unreleased - Flutterwave V4

- Collections: each payment gets a Flutterwave V4 dynamic virtual account (bank transfer). The webhook marks it paid by account number and checks the amount against the expected amount. The V3 inline popup and `/api/payments/verify` are removed.
- Payouts: V4 recipients (`bank_ngn`, stored on `payout_accounts.gateway_recipient_code`) and instant transfers. Bank list and account resolve use V4 endpoints.
- Migration `20261009030000_flutterwave_virtual_accounts.sql` adds `payment_virtual_accounts` (RLS: payer reads own rows only).
- Env vars: `FLUTTERWAVE_V4_CLIENT_ID`, `FLUTTERWAVE_V4_CLIENT_SECRET`, `FLUTTERWAVE_BASE_URL`, `FLUTTERWAVE_SECRET_HASH`. Removed: `FLUTTERWAVE_SECRET_KEY`, `VITE_FLUTTERWAVE_PUBLIC_KEY`.
- Payment references are hyphenated (letters, digits, hyphens) to meet the V4 rule.

## Payment gateway: Paystack replaced by Flutterwave (October 2026)

- Card, bank transfer and USSD checkout now run through Flutterwave's inline
  checkout (`src/lib/flutterwave.js`). Payment and escrow logic is unchanged:
  the webhook still resolves transactions by reference, and only the webhook
  (or `/api/payments/verify`) can mark anything paid.
- `api/paystack-webhook.js` is now `api/flutterwave-webhook.js`. It checks the
  `verif-hash` header, then re-fetches every charge and transfer from the
  Flutterwave API before acting on it. Amounts are taken from that API response.
- Bank payouts are sent straight to bank code and account number through
  Flutterwave transfers. The Paystack transfer-recipient step is gone.
- Bank name lookup and account name checks use Flutterwave, at
  `/api/payout-banks` and `/api/payout-resolve-account`.
- `/api/payments/verify` verifies by Flutterwave transaction id and requires
  the tx_ref to match.
- Database: `payout_gateway` gains `flutterwave`. The `paystack` value stays,
  because existing payout rows use it. New rows default to `flutterwave`.
- Environment: `VITE_FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_SECRET_KEY` and
  `FLUTTERWAVE_SECRET_HASH` replace the Paystack variables. Point the
  Flutterwave dashboard webhook at `/api/flutterwave-webhook`.
- `ESCROW_WEBHOOK_SECRET` is now required. The old fallback to the Paystack
  key is removed.

- Admin access no longer depends on email. Authority comes only from
  `profiles.role`. Founder accounts become `superadmin` by matching verified
  login emails. Every founder-email check in functions and RLS is replaced.
- Platform revenue goes to the `superadmin` role, not to a profile that matches
  an email. (The previous lookup could be exploited.)
- Internal and service-only functions are no longer callable by clients or
  anonymous visitors: `release_held_payment`, `set_verification_level`,
  `wa_add_strike`, `account_deletion_blockers`, `erase_account_data`, and others.
- Cross-user reads of wallet, payout and unlock-credit data are refused unless
  the caller owns the data or is staff.
- Direct client writes are limited by column guards for escrow, listings,
  student verifications and disputes. Tenant move-in confirmation works again.
- `v_agent_scorecard` runs with the caller's privileges (it previously bypassed
  RLS). Anonymous table write access is removed except the enquiry form.
- Fixed: every write to `properties` failed because the sanitizer used a NUL
  check that PostgreSQL rejects.
- Migration `20261009000000_security_audit_hardening.sql`. Regression suite in
  `supabase/tests/security_hardening.sql`. Full write-up in
  `docs/security/2026-10-database-audit.md`, which supersedes
  `security_audit_report.md`.

# DealMatch - Crypto Payments Removed (October 2026)

- Cryptocurrency (USDT/USDC) payment removed entirely: payment component and
  library, Escrow page option, admin Crypto transactions tab and Crypto Wallets
  settings, `CRYPTO_PAYMENTS_ENABLED` flag, `paymentMethod` allow-list entry.
  Card and bank (Paystack) payments are unchanged.
- Database: migration `20261004000003_remove_crypto_payments.sql` revokes all
  client access to `crypto_payments` and `crypto_wallets`, clears wallet
  addresses and keeps existing rows as financial history. Dropping the tables
  is left as an optional, commented step.
- README and docs updated. This supersedes the "on hold" entry below.

# DealMatch - Crypto Payments On Hold, Company Details (October 2026)

- Crypto (USDT/USDC) payment is switched off while we confirm it meets Nigerian
  regulation and compliance requirements. Website: "Coming soon" with the
  reason, not usable. Android/iOS app: hidden. Database: user inserts into
  `crypto_payments` revoked. Single switch: `CRYPTO_PAYMENTS_ENABLED` in
  `src/lib/features.js`.
- README now records CAC RC 9655308, NDPC registration (Data Controller of
  Major Importance) and Nigeria Startup Act 2022 labelled-startup status.

# DealMatch - How It Works Brought Back, as Motion (September 2026)

Re-added a "How DealMatch Works" section, cut a few passes ago for being
fully redundant with the hero. This time it's not static text - it's an
auto-flipping, swipeable 3-card sequence (`HowItWorksFlip.jsx`):

- Find / Pay / Talk cards flip front-to-back in a continuous travelling
  sequence (one card at a time, looping) so the section keeps telling its
  own story without needing interaction - genuine motion, not a hover
  gimmick.
- Tapping a card flips it early/manually; it rejoins the automatic
  sequence on the next cycle rather than getting stuck.
- The row is swipeable on mobile via the same native scroll-snap `Rail`
  component already used for the Places/People rails - "flipping swipe"
  is literal: swipe between cards, each one flips.
- Respects `prefers-reduced-motion`: the autoplay loop is skipped
  entirely for those users, though tap-to-flip still works.
- Placed between the Places/People rails and Testimonials - after
  browsing, before social proof.

# DealMatch - Homepage Cleanup, FAQ Redesign, Auth Page Modernization (September 2026)

- **Cut two fully-redundant homepage sections**: "Every reason to hesitate,
  already removed" (4-card value stack) duplicated the compact mechanisms
  strip already shown right after the hero (same 4 claims - escrow,
  dual verification, physical inspection, AI+location matching - just at
  paragraph length instead of an icon strip). "How DealMatch Works"
  (3-step Find/Match/Talk tiles) duplicated the mechanism the hero's own
  "Pay into DealMatch first, then you get the number" and the two-door
  section already communicate. Both removed entirely, not trimmed -
  shortens hero-to-FAQ considerably. Testimonials kept as-is (functional,
  real DB-backed submission/moderation flow).
- **`FAQSection.jsx` redesigned** to match the rest of the site's visual
  language (terracotta icon-circle per question, rounded cards instead of
  bare underlined accordion rows, smooth expand animation) instead of
  plain black-on-cream text. Also fixed two answers that overclaimed
  beyond what's actually live: "Is DealMatch only for real estate"
  previously listed automotive/business-services/logistics/events/health
  as live categories (they're roadmap, not shipped); "what areas does
  DealMatch cover" implied national coverage with "strongest in major
  cities" (actual state: Uyo-first, deliberately, before expanding).
  Both now describe the real, current product.
- **Diagnosed a live bug report**: testimonial submission failing with a
  generic "Could not submit" toast on production. Root cause not fully
  confirmed (no direct DB/log access from this environment) but the error
  handler was silently swallowing the real Postgres/PostgREST error with
  no trace anywhere - fixed to console.error the raw error and match on
  error codes (42501 RLS, 23503 FK violation) rather than fragile message
  substring matching. **Action needed from you**: check Supabase Dashboard
  -> Logs -> Postgres Logs around the failed submission's timestamp for
  the actual error code/message, since that's the only way to confirm
  the root cause definitively.
- **`AuthPage.jsx` (Sign In / Create Account) modernized**: fixed the
  mobile vertical-centering bug that left a large empty void above the
  form (a form this long shouldn't center - it should top-align, which
  it now does on mobile while still centering on desktop next to the
  brand panel). Form now sits in an elevated white card with a soft
  shadow instead of floating directly on the page background. Desktop
  left panel swapped from a flat gradient-on-navy block to a real photo
  (reusing the same hero-place-house.webp asset as the homepage) with a
  dark veil, so auth feels like the same product as the homepage instead
  of a generic template bolted on afterward. All form logic, validation,
  the OTP flow, and Google OAuth are untouched - this was a visual-shell
  redesign only.

# DealMatch - Real Hero/Empty-State Images (September 2026)

Extracted and cleaned 5 images from the reference sheet supplied
(1005443737.png - the clean "asset sheet" version, not the composited
mockup) to replace the temporary gradient placeholder:

- `public/home/hero-place-shortlet.webp`, `hero-person-plumber.webp`,
  `hero-place-house.webp`, `hero-person-teacher.webp` - wired into
  `HomePage.jsx`'s `HERO_IMAGES` array, rotating every 6s (pauses on
  hover/focus), alternating Place/Person to match the hero copy.
- `public/home/places-empty-room.webp` - wired into `PlacesRail.jsx`'s
  empty state ("the room we want"), replacing the generic placeholder.
- Each source image had a caption label (e.g. "1. Place - Shortlet /
  Apartment Interior") baked into its bottom-left corner from the
  reference sheet; patched out with a mirrored-and-blurred sample of the
  photo immediately above it (reads as foreground bokeh, not an edit) -
  see the crop/patch script for the exact regions if the source sheet
  changes and this needs redoing.
- **Known limitation**: extracted resolution is ~800x280 per hero image,
  well under the brief's 2400x1350 spec - fine as a real visual upgrade
  over the placeholder, but will look soft on a large desktop monitor.
  Swap in true high-resolution photography when available; same array,
  same rotation/pause logic, no other code changes needed.

# DealMatch - Homepage Redesign: Photo-First, Places/People Rails (September 2026)

Implemented the agreed homepage direction (photo-first hero, Netflix-style
Places/People rails, no category creep) as four reusable components plus
the assembled homepage, per the visual/motion implementation brief.
Homepage-only - no verification SQL, paid professional_applications, or
Find a Provider filters touched.

- **New shared components**: `PlaceCard.jsx` and `PersonCard.jsx`
  (`src/components/cards/`) - photo-dominant, Verified badge, area, price,
  unconditional "Phone locked" (contact only ever unlocks via funded
  escrow), "View place/profile →". `PersonCard` sources exclusively from
  the real `verified_providers` table (level >= 2, the free Skill Verified
  path) - never the separate catalog/category_listings artisan schema,
  never the paid property-professional vertical.
- **`Rail.jsx`**: native `overflow-x-auto` + scroll-snap horizontal rail
  (real touch momentum on mobile, ~3 cards + peek on desktop, arrows just
  scroll the same element). Never autoplays - only the hero does.
- **`HeroSearch.jsx`**: large search input, rotating placeholder cycling
  only through examples DealMatch actually supports today, respects
  `prefers-reduced-motion`, routes to `/places?q=` or `/providers?q=` on a
  simple keyword heuristic (no new backend search - out of scope for this
  ticket).
- **`FindOfferCard.jsx`** + **`PostChoiceModal.jsx`**: the "What are you
  here to do?" two-door section; "I have something" opens a real chooser
  (List a place / Offer a skill) instead of guessing which one it means -
  the desktop equivalent of the mobile tab bar's Post chooser.
- **`PlacesRail.jsx`** / **`PeopleRail.jsx`**: real data via new
  `src/lib/homeFeed.js` fetchers (deliberately duplicated from, not
  imported from, RentalsPage/FindProviderPage's own queries, so this
  ticket never touches those pages' behaviour). Functional empty states -
  "List a place" / "Offer a skill" CTAs that actually work today, not
  stubs - so nothing needs revisiting later.
- **`PhotoPlaceholder.jsx`**: honest temporary placeholder (gradient +
  icon, tagged `TEMP_PLACEHOLDER`) standing in for the hero photo and the
  Places-row empty-state photo until real photography is supplied.
- **Fixed a second pre-existing broken link**: `ProviderProfilePage.jsx`
  already existed fully built (reviews, stats, portfolio section) but was
  never registered in `App.jsx`, so every "View profile" / "View" click
  404'd. Added the route, and fixed it to read the real
  `level_data.category/area/price_cents` fields (it was reading an
  unpopulated `profile.category_label` column instead).
- **`HomePage.jsx` rebuilt**: full-bleed photo hero (headline "See the
  place. See the person.", sub "Pay into DealMatch first. Then you get the
  number.", HeroSearch, two buttons to /places and /providers) replaces
  the old paragraph-heavy hero. Two-doors section, Places rail, People
  rail replace the old ad-hoc fork + three-category-rail block (which
  included Automotive and a catalog-sourced "Skilled artisans" rail -
  both dropped per the agreed two-door-only scope). Lower sections (value
  stack, how it works, testimonials, FAQ, final CTA) left intact.
- Colours locked to the brief's exact hex values (`#F8F1E9` / `#C45C26` /
  `#1A1A1A`) in every new component, distinct from - but compatible with -
  the app's existing Tailwind theme tokens used elsewhere.

# DealMatch - Engineering Brief Closeout (September 2026)

Closed the remaining gaps between the "Align production with the DealMatch
product" engineering brief and what was actually wired up, focusing on
broken links between flows rather than visual redesign (per brief scope).

- **Broken skilled-professional onboarding link**: `OnboardingPage.jsx` sent
  users who chose the skilled-people path to `/apply-professional` (the
  legacy paid ₦25,000/month surveyor/agent flow) after identity
  verification, while `ProfilePage.jsx`/`DashboardPage.jsx` already pointed
  the same users at `/verify-skill` (the real free, portfolio-first Skill
  Verified flow). Fixed both `returnTo` targets to `/verify-skill`.
- **`/professionals` now redirects to `/providers`** instead of rendering
  the legacy Agents/Surveyors/Inspectors/Valuers page with the retired
  ₦25,000/month banner - it's fully unreachable now, not just unlinked.
- **`properties` insert "null character not permitted" bug was still live**
  on the actual "List a place" path: the `stripControlChars` fix in
  `supabase.js` existed but only guarded the unused `createProperty()`
  helper - `ListRentalPage.jsx` called `supabase.from('properties').insert()`
  directly, bypassing it. Exported `stripControlChars` and applied it there.
- **Paid property-professional approvals never populated
  `verified_providers`**, so even the "Advanced" filter inside `/providers`
  could never show them. Migration
  `20260906000000_paid_professional_verified_providers_sync.sql` extends
  the existing auto-approve trigger to call `set_verification_level(2, ...)`
  the same way the free Skill Verified path already does.
- Request flow chrome: "Post a Job" → "Post a Request" everywhere
  (header, Dashboard, empty-state CTAs); default location placeholder/value
  changed from "Ikeja, Lagos" to Uyo; description placeholder now matches
  the brief's own example ("I need a plumber around Ewet").
- `SkillVerificationPage.jsx` now collects **area** and **price / open
  price**, and `FindProviderPage.jsx` cards now render skill, area, and
  price - closing the gap against the brief's required card fields.
- Rebuilt `MobileTabBar.jsx`: Places / People / Post / Inbox / Profile,
  with Post as a centre-raised action opening a List a place / Offer a
  skill / I need someone chooser, replacing the old Home/Explore/Post/
  Messages/Profile bar. Desktop nav unchanged.
- `RentalsPage.jsx` empty states (both swipe and grid view) now invite
  listing a place instead of only offering to refresh/search again.

# DealMatch - Production Hardening Pass (August 2026)

This pass closed the gap between the product handoff spec and what had actually shipped, fixed a serious latent bug in the escrow/money flow, and hardened two completely-open API endpoints. Full narrative detail is in `README.md` under "August 2026 Production Hardening Pass" - this is the flat list for a quick diff review.

## Money-flow bugs (found while fixing the spec gaps, not part of the original ask)

- **`escrow_transactions` was missing four columns** (`payment_ref`, `funded_at`, `released_at`, `created_at`) that existing webhook handlers and a baseline-schema trigger already referenced. Every escrow confirmation - Paystack and crypto, on every category using this table - was silently failing at the query step. Added via migration.
- **`api/paystack-webhook.js` selected two columns that were never named that** (`platform_fee`, `amount` → real names are `platform_amount`, `gross_amount`) and set `status: 'confirmed'` while the RLS policy and every read path expect `'funded'`. Fixed both.
- **`EscrowPage.jsx` never wrote an `escrow_transactions` row before opening Paystack.** The webhook resolves rows strictly by `payment_ref`, written server-side beforehand - correct anti-fraud design, just never implemented for the property vertical. Added `start_property_escrow_payment()` RPC + `PropertyReserveModal.jsx`.
- **Near-miss caught mid-fix:** `confirmed_at` on `escrow_transactions` means "tenant confirmed move-in" and has its own auto-release trigger. An early draft set it at payment-funding time, which would have skipped the entire escrow protection window. Corrected before shipping.
- **`AdminPage.jsx`'s Transactions → Escrow tab had the identical wrong-column-name bug**, plus an ambiguous `profiles(full_name)` embed (4 FKs from `escrow_transactions` to `profiles`). Fixed and pinned to `seller_id`.

## Security fixes

- **`PropertyPage.jsx` contact leak**: `getProperty()` no longer selects `profiles.phone`. New `get_property_contact()` `SECURITY DEFINER` RPC is the only path to it - owner, staff, or funded-escrow counterparty only.
- **`api/send-email.js` / `api/send-whatsapp.js` had zero auth, zero rate limit, and trusted a client-supplied recipient.** Both rewritten: session required, recipient resolved server-side from `userId` only, rate-limited per user + per IP, HTML-escaped, logged to new `outbound_message_log` table.
- **`npm audit`**: fixed `dompurify` (moderate) and `fast-uri` (high) via `npm audit fix`. One moderate `react-router-dom` advisory remains, deferred as a planned v6→v7 migration (see README for reasoning) - not something to silently ignore, flagged explicitly.

## Product/spec gaps closed

- Guest checkout (`GuestAuthModal.jsx`) - phone-OTP, no forced onboarding, wired into `PropertyPage.jsx` and `JobPostingPage.jsx`.
- Verification write-path (`verification_submissions` table + 3 RPCs) - ADR-008's Identity→Skill→Trusted ladder now has an actual submission/approval flow. `SkillVerificationPage.jsx` is the portfolio-first Level 2 submission UI.
- `FindProviderPage.jsx` (`/find-provider`) - filter chips, spec-ordered cards, Level 2+ providers only.
- `WalletPage.jsx` (`/wallet`) - unified escrow/job/referral money view.
- `ManageListingsPage.jsx` (`/manage-listings`) - seller dashboard across `properties` + `category_listings`.
- Admin CRM: **Skill Verify** tab (review queue) + **Pipeline** tab (`admin_deal_pipeline` view).
- Routing: `/find-place`, `/find-provider`, `/post-job`, `/jobs/:id`, `/wallet`, `/manage-listings`, `/verify-skill` were referenced in `Navbar.jsx` but never registered - every primary nav link 404'd. Fixed. `/browse` is now public (guest browsing).
- `Navbar.jsx` color palette reconciled to the one locked in `tailwind.config.js`.

## Housekeeping found and fixed along the way

- `check:fitness` was documented in the README but never wired into `package.json` scripts, and the CI workflow it claimed existed (`.github/workflows/fitness-functions.yml`) didn't. Both added.
- Running the (now-wired-up) fitness check for the first time surfaced a **BLOCKING serverless-function-count failure (12/11)** - pre-existing, not introduced by this pass. Fixed by folding the standalone honeypot (`api/properties-export.js`) into `api/platform.js` as a `resource=properties-export` case, preserving the exact same public URL via a `vercel.json` rewrite.
- Two pre-existing module-boundary violations surfaced by the same check: `sitemapService.js` reading `forum_threads` directly (added `listThreadSlugsForSitemap()` to `forumService.js`), and my own new `ManageListingsPage.jsx` reading `category_listings` directly (routed through `listingsService.js`'s existing `listMyListings()`/`updateListingStatus()` instead).

## Files changed

**New:**
- `supabase/migrations/20260812000000_production_hardening.sql`
- `src/components/ui/GuestAuthModal.jsx`
- `src/components/ui/PropertyReserveModal.jsx`
- `src/pages/Provider/FindProviderPage.jsx`
- `src/pages/Wallet/WalletPage.jsx`
- `src/pages/ManageListings/ManageListingsPage.jsx`
- `src/pages/Verification/SkillVerificationPage.jsx`
- `.github/workflows/fitness-functions.yml`
- `CHANGELOG.md` (this file)

**Rewritten:**
- `api/send-email.js`
- `api/send-whatsapp.js`

**Modified:**
- `api/paystack-webhook.js` (column names, status value, comments)
- `api/platform.js` (honeypot folded in)
- `src/App.jsx` (routing)
- `src/lib/supabase.js` (`getProperty()` no longer selects phone)
- `src/lib/notifications.js`, `src/lib/whatsapp.js`, `src/lib/events.js` (auth-required send-email/send-whatsapp contract)
- `src/pages/Property/PropertyPage.jsx`
- `src/pages/Jobs/JobPostingPage.jsx`
- `src/pages/Admin/AdminPage.jsx` (two new tabs, escrow query fix)
- `src/modules/listings/listingsService.js` (`listMyListings` category join option)
- `src/modules/forum/forumService.js` (`listThreadSlugsForSitemap`)
- `src/modules/sitemap/sitemapService.js` (uses the above instead of a direct query)
- `src/components/layout/Navbar.jsx` (color palette)
- `vercel.json` (honeypot rewrite)
- `package.json` (`check:fitness` script)
- `README.md`

**Removed:**
- `api/properties-export.js` (folded into `api/platform.js`)

## Verification performed

- `npm run build` - clean, no errors
- `npm run check:fitness` - PASS (module boundaries clean, 11/11 serverless functions)
- `npm audit --omit=dev` - 1 moderate advisory remaining (documented, deferred)
- Manual read-through of every new/changed SQL statement against the actual column list in `supabase/migrations/20260711000000_production_baseline_schema.sql` (not assumed from memory)

## What this pass did NOT do (flagged, not hidden)

- No PostGIS lat/lng column on `profiles` - "Within 5km" filtering and the Find Provider map are honest placeholders, not faked pins.
- `react-router-dom` v6→v7 migration deferred (see README).
- Email/WhatsApp notification triggering is still client-initiated (recipient resolved server-side, but the trigger comes from the browser). Moving this fully server-side is a larger change noted for a future pass.
- Manual Supabase Studio step still required: enable the Phone auth provider for guest checkout to send real SMS codes.

---

# Dashboard & Profile Rebuild (August 2026, second pass)

Follow-up spec: unify "Find a Place"/"Find a Provider", make the Dashboard support both sides equally, real stats, and a Provider section on Profile.

## Security finding (already-deployed, fixed forward)

- **`admin_deal_pipeline` was missing `security_invoker = true`.** Postgres views default to the *owner's* privileges; Supabase's `postgres` role can bypass RLS. This view is queried directly from the browser in the admin Pipeline tab, not through a server-checked route - meaning any authenticated user who found the view name could potentially have seen every deal platform-wide. Fixed via `ALTER VIEW ... SET (security_invoker = true)` in the new migration, since the original file is already live and wasn't edited in place.
- **Related:** `transactions` (ADR-009) had no staff-read RLS policy at all. Once `security_invoker` was correctly enforced, the admin Pipeline tab would have silently shown an incomplete picture to staff (legacy escrow only). Added the missing `transactions_select_staff` policy.

## New

- `profiles.offers_services` - a real, user-settable "Become a Provider" boolean, replacing the previous inferred-only signal. Saying yes is intent only; never grants status or bypasses verification.
- `rental_enquiries.user_id` (nullable) + "see own" RLS policy - this table was guest-only by design with no attribution path and no policy letting a user read their own rows.
- `my_requests` view (`security_invoker = true`) - unions `rental_enquiries`, `professional_requests`, and `transactions(requester_id)` into one read model.
- `src/pages/Dashboard/DashboardPage.jsx` - full rebuild: two primary action cards (Find a Place / Find a Provider), 4-stat row, My Activity feed with empty-state CTAs, quick-links grid, quieter Coming Soon tiles.
- `src/pages/Profile/ProfilePage.jsx` - full rebuild: badges (Identity always, Skill only if provider), verification status card, editable details, conditional Provider section (sourced from the most recent Skill submission), relabeled Payout Details, bottom nav actions.

## Modified

- `src/pages/Rentals/RentalsPage.jsx` - enquiry insert now passes `user_id` when a session exists.
- `src/pages/List/ListPropertyPage.jsx` - added a "For Rent" option that redirects to `/list-rental` instead of duplicating its logic; the sale-only composer previously had no way to discover the rental flow existed.

## New migration

- `supabase/migrations/20260813000000_dashboard_profile_spec.sql` - everything above. Deliberately a new file, not an edit to `20260812000000_production_hardening.sql`, since that one is already applied to production.

---

# Official Logo Integration (August 2026, third pass)

The official DealMatch logo (two-tone "matched" mark + wordmark) was provided as a source image and integrated across the app, plus a real bug found while doing it.

## Bug found and fixed along the way

- **PWA icon set was broken.** `icon-96.png`, `icon-128.png`, `icon-144.png`, `icon-152.png` were not valid image files at all (`PIL.UnidentifiedImageError` on open - likely corrupted or placeholder text saved with a `.png` extension). `icon-384.png` and `icon-512.png` *were* valid PNGs but at the wrong dimensions entirely (72×72 and 96×96, not 384×384/512×512 as their filenames claimed). The favicon itself was a generic placeholder SVG (`favicon.svg` - a terracotta square with a serif "D"), not the real brand. None of this would have been obvious from the running app - a browser just silently falls back to a blank/default icon when a declared manifest icon fails to load. All regenerated at correct pixel dimensions from the real logo; a properly safe-zoned `icon-512-maskable.png` was added (previous manifest just reused the same "any"-purpose icon for maskable, which risks the mark getting clipped when Android applies a circular mask); `icon-192.png` was added (a size most install flows expect that the manifest never declared); `favicon.svg` removed and replaced with real PNG favicon links.

## Assets added

- `public/brand/dealmatch-icon-transparent.png` - the icon mark only (the two "matched" halves + connecting bridge), transparent background, used inline across the app on both light and dark surfaces.
- `public/brand/dealmatch-logo-full.png` - the full lockup (mark + wordmark + tagline), cream background, kept for future marketing/share-card use.
- `public/icon-{96,128,144,152,192,384,512}.png` + `icon-512-maskable.png` - regenerated PWA/favicon icon set, correct sizes, real logo.

## Where the logo now appears

- **`LoadingScreen`** (the full-screen loader) - the icon mark now sits inside the pulsing ring with a gentle breathing animation, replacing a generic house icon. Subtitle updated from the outdated "Nigeria's Property Platform" to match the logo's own tagline, "Nigerian Marketplace Matching Platform."
- **`PageSkeleton`** (lightweight in-app navigation loader) - small breathing version of the mark inside the spinner.
- **Navbar, Footer, Auth page** (both the desktop left panel and - previously missing entirely - a mobile-only header, since the desktop panel is `hidden lg:flex` and mobile users were seeing no logo at all on the sign-in screen).
- **Favicon, browser tab icon, PWA home-screen icon, `apple-touch-icon`, `og:image`/`twitter:image` share previews** - all now the real logo instead of the placeholder.

## Not yet done

- The rest of the app's brand mentions (page titles inside Dashboard/Profile cards, etc.) still use text-only "DealMatch" without the icon mark - only the primary brand-identity surfaces above were updated. Say if you want the mark added more broadly (e.g. every card header, empty states) versus keeping it to primary navigation/loading surfaces as a deliberate restraint against over-using it.

---

# Android & iOS App Shells (August 2026, fourth pass)

Added Capacitor-based native app projects for both platforms. Full detail and next steps in `MOBILE_APPS_SETUP.md` - summary here.

## What's done

- `capacitor.config.ts` - points both native WebViews at the live production site (not a locally bundled copy), so every existing relative `/api/*` call keeps working unmodified, and every future `git push` to `main` is automatically what the native apps show too.
- `android/` - full Android Studio project. Real app icons at all 5 densities (legacy + adaptive icon foreground/background), real splash screens (11 density/orientation variants), `CAMERA` permission declared, hardware back-button wired to navigate WebView history / exit at root instead of Capacitor's default (exit on any back press).
- `ios/` - full Xcode project. Real 1024×1024 App Store icon (opaque, no alpha - Apple requires this), real launch screen images, `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` added to `Info.plist` - without these iOS kills the app instantly on first camera/photo access, not just an App Store guideline issue.
- `src/main.jsx` - native-only wiring (splash screen hide-on-ready, back-button handler), guarded behind `Capacitor.isNativePlatform()` so it's a complete no-op on the plain website build.
- `public/brand/` logo assets reused as the source for every generated icon/splash size across both platforms.

## What's NOT done, and can't be from here

- **No compiled `.apk`/`.aab`/`.ipa`.** Attempted the Android build in this environment; it failed on `./gradlew tasks` with a 403 fetching the Gradle distribution itself - this sandbox's network is allowlisted to package registries only (npm, PyPI, etc.), not `services.gradle.org` or Google's Maven repo. iOS is a harder wall: Xcode is macOS-only, no sandbox gets around that. Both should build normally on a real machine with normal internet access - see `MOBILE_APPS_SETUP.md` for exact commands.
- **No store accounts, no submissions.** Requires a human with legal/business authority (Apple Developer Program, $99/yr; Google Play Console, $25 one-time) and store listing assets (screenshots, descriptions, privacy policy URL, content rating) that are editorial decisions, not something to generate unilaterally.
- **Push notifications** - not included. Would meaningfully help the app read as "more native" to Apple's reviewers (see the review-risk note in `MOBILE_APPS_SETUP.md`) but is a separate, real piece of work (`@capacitor/push-notifications` + Firebase Cloud Messaging).

## Safety fix along the way

- `android/.gitignore` had its keystore exclusion (`*.jks`/`*.keystore`) commented out by default in Capacitor's scaffold template. Enabled it - a release-signing keystore committed to git is a permanent, unfixable problem (Google ties an app's identity to its signing key forever). Documented in the setup guide to generate the keystore outside the repo entirely regardless, since gitignore is a safety net, not a plan.

---

# Signup Flow Fixes (August 2026, fifth pass)

Three issues reported from live testing: a stale-looking Google search snippet, an overly long password error message, and email verification appearing to fail even though it actually succeeded.

## Root cause found: a guaranteed-crash typo, not a race condition

`OnboardingPage.jsx` rendered `<BellConcierge>` for the "Short-term Stay" goal option under the Renter role - but `BellConcierge` was never imported, and doesn't even exist in `lucide-react` under that name (the real icon is `ConciergeBell`, reversed). This is a genuine `ReferenceError` at render time, not a timing issue: `npm run build` doesn't catch it (Vite doesn't statically flag an undefined JSX identifier at build time), so it silently shipped and only threw when a specific user actually reached that screen. Confirmed via `node -e` that `BellConcierge` isn't in the icon library at all.

This explains the "OTP went through but showed something went wrong" report exactly: `AuthPage.jsx`'s `handleVerifyOtp()` correctly verified the code and called `navigate('/onboarding')` - the account WAS confirmed - but `OnboardingPage` then threw on render, tripping the app's `ErrorBoundary` (App.jsx) instead of showing the onboarding flow. The ErrorBoundary does already have a "Go home" button, so there was a way out, just not the intended flow.

**Also swept the rest of the codebase for the same bug class** (an icon-like JSX component used but never imported) - wrote a script checking every `.jsx` file's icon usages against its own imports and local definitions, manually verified all 8 initial matches, and confirmed all 8 were false positives (import aliasing like `Map as MapIcon`, or destructured-and-renamed props like `{ icon: Icon }`) - `BellConcierge` was the one real instance.

## Fixed

- `src/pages/Onboarding/OnboardingPage.jsx` - `BellConcierge` → `ConciergeBell`, properly imported.
- `src/pages/Auth/AuthPage.jsx` - the signup form's password field now shows "At least 8 characters, with a mix of letters and numbers" underneath it, matching the spec's request for a visible password-requirements label. Generalized the existing `parseSignInError()` helper into `parseAuthError()`, used consistently across sign-up, sign-in, OTP resend, and Google OAuth error paths - previously, any Supabase Auth error outside a few hand-matched cases was shown to the user completely raw. Supabase's password-policy error text (if leaked-password protection or character-class requirements are enabled on the project) can be a long technical paragraph; now maps to a short, consistent message instead.

## Not a bug - explained, not fixed

- The Google search result / AI Overview showing "Nigeria's Smart Property Platform" copy is **Google's stale cached index**, not a live issue - `index.html`'s actual `<title>`, meta description, Open Graph tags, and JSON-LD are already correct ("DealMatch: Matched, Not Just Posted", multi-category copy). Nothing to fix in code; request re-indexing via Google Search Console (Search Console → URL Inspection → Request Indexing) to speed up Google picking up the current copy.

---

# Password Requirements Checklist (August 2026, sixth pass)

Follow-up to the previous pass's password hint - a single sentence ("mix of letters and numbers") wasn't clear enough; asked for explicit symbol/uppercase/lowercase/number requirements instead.

## Added

- `PASSWORD_RULES` - a single source of truth (5 rules: 8+ characters, uppercase, lowercase, number, symbol) used by both the live checklist and the pre-submit validation, so the two can't silently drift out of sync the way the old length-only check and Supabase's actual server-side policy could.
- Live checklist under the signup password field: each rule shown with a hollow circle that fills to a checkmark and turns green as the person types and satisfies it - directly addresses "people still get confused" by showing progress per-rule rather than one static sentence.
- Pre-submit validation now checks all 5 rules (was length-only before), so a weak password is caught client-side with the same friendly message instead of round-tripping to Supabase and coming back as a raw server error.

## Worth checking on your end

This client-side rule set (8+ chars, upper, lower, number, symbol) is a reasonable default, but I don't have visibility into your actual Supabase Auth password policy (Authentication → Policies → Password Requirements in Supabase Studio). If that's configured differently - stricter, more lenient, or checking something else like leaked-password protection - the client and server could still disagree on edge cases. Worth a quick look to confirm they match, so no one can pass the client-side checklist and still get bounced by a server-side rule the checklist didn't warn them about.

---

# "What's on DealMatch" Homepage Carousel (August 2026, seventh pass)

Feedback: the homepage hero is abstract brand copy ("Tell Us What You Need. We'll Find Who Has It.") without concretely naming what's actually on the platform - a first-time visitor could reasonably not know if this is a real estate site, a job board, or something else entirely.

## Added

- `src/components/ui/WhatIsDealMatchCarousel.jsx` - a simple, single-card-at-a-time carousel naming the platform's five real categories (Real Estate, Rentals & Shortlets, Skilled Artisans & Services, Automotive, Talent & Teacher Recruitment), each pulled from the actual seeded `categories` table rather than invented, each linking straight to its real, working browse page. Auto-advances every 4 seconds, pauses on hover/touch, has arrow and dot navigation. Deliberately restrained animation (fade + slight slide, matching the existing `PropertyCarousel`'s transition style) so it doesn't compete with the hero above it.
- Placed immediately after the hero section on `HomePage.jsx`, before anything else - the highest-impact spot for answering "what is this site" before a visitor has to scroll or parse abstract copy.

## Not changed

- The hero's headline/copy itself is untouched - this adds a concrete, factual follow-up right beneath it rather than rewriting the brand messaging, which is more of an editorial call than something to change unprompted.

---

# Carousel Fixes + Real Photo Backgrounds (August 2026, eighth pass)

Follow-up feedback on the carousel from the previous pass: remove em dashes, the Teachers slide didn't open anything when clicked, and both the hero and carousel would feel more real with an actual background image instead of flat color/gradient.

## A real, related bug found while investigating the Teachers click

Traced why clicking "Talent & Teacher Recruitment" appeared to do nothing: the routing itself works correctly (`/marketplace/teachers` resolves through `MarketplacePage.jsx`'s dispatcher exactly like any other category), but nothing else in the app shows evidence that this category has any real listings yet - unlike Real Estate, Rentals, Artisans, and Automotive, which all already power working discovery rails elsewhere on the homepage with real fetched data. A category with zero listings still technically "opens a page," but a blank result reads as broken to a first-time visitor. **Removed it from the carousel** rather than guess at a fix - better to feature four categories with proven content than five where one is empty.

## A second, bigger bug found while sourcing the real photos

`getProperties()` in `src/lib/supabase.js` - the function that powers `featuredProps` on the homepage, which in turn feeds the existing "Featured Deals" `PropertyCarousel` further down the page - only ever did `select('*')` on the `properties` table. It never joined `property_images`. That means `p.images` has been `undefined` for every property this function has ever returned, and `PropertyCarousel`'s own image logic (`p.images?.find(i => i?.is_primary)?.url`) has been silently falling through to its no-image placeholder for every single card, on every load, since this was built - not something either of us would have caught just by looking at the homepage, since the placeholder state looks intentional, not broken. Fixed the query to properly join `property_images` (confirmed public-read RLS already permits this, no policy change needed).

## Real image sourcing: what I could and couldn't safely do

Tried sourcing real estate/artisan/automotive photography through image search first. Every result was either a copyrighted real-estate-listing photo (owned by other brokers/photographers, not something I should hotlink into your production site) or came back empty when I tried steering toward properly-licensed stock sources. Rather than gamble with unclear licensing on your live site, used your platform's own actual listing photos instead - genuinely real, unambiguously yours, and dynamic (always reflects current listings, never goes stale like a static asset would).

- **Hero background**: a real, live property photo now sits beneath the existing gradient at low opacity (25%) - visible as texture, doesn't compete with the dark text sitting on top of it. Falls back to just the existing gradient/particle background if no listing has a photo yet.
- **Carousel - Real Estate and Rentals slides**: same real photo, full-strength with a dark gradient scrim for text contrast (matches how the site's other photo-backed cards handle text-over-image).
- **Carousel - Artisans and Automotive slides**: kept the icon-on-color-block treatment, deliberately, since `category_listings` doesn't have a simple image field wired up yet (its own homepage rail doesn't show images either) - faking a photo for two of four slides while the other two are real would be inconsistent in a way that undermines the "make it feel real" goal, not serve it.

## Fixed

- Removed all em dashes from the carousel's visible copy (the three slide descriptions) - replaced with commas/colons.
- Header copy updated from "five kinds of match" to "four," matching the now-four real slides.

---

# Copywriting Framework Pass: Hero, Value Stack, Flip-Grid Carousel (August 2026, ninth pass)

Applied a five-method copywriting framework end to end (Kennedy hook, Schwartz awareness-stage sequencing, Ogilvy specificity, Hormozi value-stacking, Wizard of Ads emotional arc) at the direction: problem-aware/solution-unaware audience, real proof points only, "multi-category" framing instead of a hardcoded category count, and the carousel rebuilt as a flipping grid instead of a static single-slide carousel.

## A real problem found and fixed before writing a word of the new copy

The homepage's stats bar (`loadRealStats()`) queries real, live counts, not fake numbers, but that also means the literal "0+ Properties Listed / 0+ Verified Users / 0 Deals Closed" in a screenshot was genuinely what's showing in production right now. Shipping new trust-building copy directly above a live "0 Deals Closed" would have undercut the whole exercise. Fixed: below a real-traction threshold (currently 5+ properties or 3+ closed deals, swap this out once usage clears it), the stats bar now shows four mechanism-based trust badges instead (Escrow-Protected, Identity + Skill Verified, Physically Inspected, AI + Location Matched): all true on day one regardless of user count, unlike volume claims.

## Hero (Kennedy hook + Schwartz problem-aware opening)

- Eyebrow badge: "Trusted Supply. Real Demand. Matched." → "Escrow-Protected. Verified Twice. Never Blind."
- Headline: "Tell Us What You Need. We'll Find Who Has It." (abstract) → "You Send the Money First. Then You Find Out If They're Real." (names the actual pain immediately, second person, per Kennedy's "feel understood immediately")
- Subhead now opens on concrete, recognizable scenarios (fake agents, artisans who vanish after a deposit, landlords who don't exist) before bridging to the mechanism (escrow, verification): the Schwartz problem-aware → solution-aware move happens within two sentences, not assumed already understood.

## New section: value stack + emotional close (Hormozi + Ogilvy + Wizard of Ads)

Added directly below the hero, before the category grid. Four stacked, concrete mechanisms: each framed as a specific risk removed, not a vague reassurance, using only things that are actually true and already built: escrow holding funds until confirmation, the real dual identity+skill verification ladder (not a single checkmark), physical inspection on real estate listings, and AI/geo matching. Closes on one line tying back to the hero's opening pain ("No more sending money and hoping... no more guessing if the person on the other end is real"): the Wizard of Ads old-pain-to-new-relief arc, stated once, briefly, not stretched into paragraphs.

## Carousel rebuilt as a flip-grid, not a single-slide carousel

- 2×2 grid, all four real categories visible at once (Real Estate, Rentals & Shortlets, Artisans & Services, Automotive: Teachers still excluded, same reasoning as the previous pass: no proven live listings yet).
- Each card independently flips (CSS 3D `rotateY`, `backface-visibility: hidden`) between an icon-on-color-block front and a photo-or-detail back face, on its own staggered timer (0ms/900ms/1800ms/2700ms offsets) so the grid never flips in visible unison: reads as continuously alive rather than a single timed event. Real Estate/Rentals show a real property photo on the back face (same licensing reasoning as the hero: your own listing photos, not stock imagery); Artisans/Automotive show a detail line instead, same honesty tradeoff as before.
- Every card is a real link on both faces: clicking mid-flip still navigates correctly.
- Header copy: "One platform, four kinds of match" → "One platform. Multi-category matching." per the instruction to say "multi" rather than hardcode a count that changes as real categories go live.


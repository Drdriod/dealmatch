# DealMatch: Matched, Not Just Posted

> DealMatch matches real demand with trusted supply across property, skilled trades, professional services, logistics, and more. Not a directory, a matching engine.

**Live:** https://www.dealmatch.com.ng
**Company:** DealMatch (dealmatch.com.ng) is a product of **DEALMATCH TECHNOLOGY LIMITED**, CAC registered (RC 9655308)
**Founded:** 2026 | Uyo, Akwa Ibom State, Nigeria

---

## Company and Compliance

| | |
|---|---|
| Legal entity | DEALMATCH TECHNOLOGY LIMITED, which owns and operates dealmatch.com.ng and the DealMatch apps |
| Corporate Affairs Commission | Registered, **RC 9655308** |
| Data protection | Registered with the Nigeria Data Protection Commission (NDPC) as a **Data Controller of Major Importance** |
| Startup status | Labelled startup under the **Nigeria Startup Act 2022** |
| Location | Uyo, Akwa Ibom State, Nigeria |

**Payments:** DealMatch accepts card and bank payments only, through Flutterwave. Cryptocurrency payment is not offered and has been removed from the code. Existing historical records (if any) are retained in the database with all client access closed (migration `20261004000003_remove_crypto_payments.sql`).

User data deletion: users can delete their own account in the app (Profile) or at `/delete-account`. See `supabase/migrations/20261003000001_account_deletion.sql`.

---

## What DealMatch Does

DealMatch is a multi-category, intent-driven matching platform. A user says what they need or what they offer, DealMatch matches them against verified supply or demand, and contact stays masked until an escrow payment confirms the deal. Real Estate is the original, most mature vertical; Skilled Artisans, Automotive, Professional & Business Services, Logistics & Mobility, Education, Events, and Health & Wellness are built on the same schema-driven catalog and matching engine. A Community Forum sits alongside the marketplace as the discovery/SEO layer, answering real questions and linking into the transacting flow.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS + Custom Design System |
| Animation | Framer Motion |
| Backend/DB | Supabase (PostgreSQL + PostGIS + RLS) |
| Auth | Supabase Auth (OTP + Google OAuth) |
| Matching | Pinecone Vector Search (Real Estate) + PostGIS/JSONB RPC (all other categories) |
| Search | Postgres full-text search, federated across every category in one RPC |
| Maps | Google Maps (`@react-google-maps/api`) |
| Payments | Flutterwave V4: bank transfer to a dynamic virtual account per payment; bank payouts and account checks via Flutterwave V4 |
| Hosting | Vercel (CI/CD via GitHub) |
| PWA | Service Worker + Web App Manifest |
| Analytics | PostHog |
| Error Tracking | Sentry |
| Architecture governance | Custom fitness function script + GitHub Actions (see below) |

---

## Project Structure

```
src/
├── modules/              # Framework-agnostic domain services (the module system)
│   ├── catalog/          # Category definitions, JSON Schemas, verification policy
│   ├── listings/         # category_listings CRUD
│   ├── matching/         # Geo + attribute matching (new categories) and RPC calls
│   ├── forum/             # Forum categories, threads, posts, SSR renderer
│   ├── search/            # Universal search (federated RPC call)
│   └── sitemap/           # Dynamic sitemap.xml generation
├── components/
│   ├── layout/            # Navbar, Footer, AppShell, MobileTabBar
│   └── ui/                 # MarketplaceMap, PropertyMap, SearchPalette,
│                            # WhatsAppButton, ScrollReveal, AnimatedStat,
│                            # GuestAuthModal (guest phone-OTP checkout),
│                            # PropertyReserveModal (escrow-gated booking), etc.
├── context/
│   ├── AuthContext.jsx     # Global auth state
│   └── ThemeContext.jsx    # Theme management
├── lib/
│   ├── supabase.js         # Browser DB client
│   ├── supabaseServer.js   # Server-side DB client (Vercel functions, process.env)
│   ├── schemaValidation.js # Ajv validation against each category's JSON Schema
│   ├── apiMiddleware.js    # withSecurity() wrapper (auth, rate limit, origin check)
│   ├── redis.js            # Rate limiting
│   ├── flutterwave.js      # Payment processing (Flutterwave V4 virtual accounts)
│   ├── pinecone.js         # AI vector matching (Real Estate)
│   └── referral.js         # 3-level cash + points system
├── pages/
│   ├── Home/                # Landing page (Netflix-style category rails)
│   ├── Marketplace/         # Schema-driven browse, composer, listing detail, search
│   ├── Forum/                # Community forum (SEO/AEO discovery layer)
│   ├── Browse/                # Real Estate search + swipe (public - guest browsing)
│   ├── Property/               # Property detail page (guest-friendly reserve/contact)
│   ├── Provider/                # ProviderProfilePage + FindProviderPage (spec 3.2)
│   ├── Jobs/                     # JobPostingPage - post job / bid engine (guest-friendly)
│   ├── Wallet/                    # WalletPage - unified escrow/job/referral money view
│   ├── ManageListings/            # ManageListingsPage - seller's listing dashboard
│   ├── Verification/               # VerificationPage (admin legacy) + SkillVerificationPage
│   ├── Rentals/, Hotels/, StudentHostels/, Professionals/
│   ├── Auth/, Onboarding/, Matches/, List/, Escrow/, Tenancy/
│   ├── Messages/, Dashboard/, Profile/, Referral/
│   ├── LandlordDashboard/, LenderDashboard/, Agent/, Admin/
│   └── Legal/, PostVerification/
└── App.jsx                  # Routes + lazy loading

api/
├── platform.js               # Single consolidated serverless function (see below)
├── admin/, agent/             # Legacy dedicated endpoints
├── send-email.js, send-whatsapp.js  # Auth-required, rate-limited, audit-logged (Aug 2026 hardening)
└── (all other resources route through platform.js via vercel.json rewrites)

scripts/
└── check-architecture-fitness.mjs  # Module boundary + function-count checks (npm run check:fitness)

supabase/migrations/           # Timestamped, run in filename order
```

---

## August 2026 Production Hardening Pass

A full review against the product handoff spec (guest checkout, dual verification, Find Provider experience, admin CRM, demand-side job posting) found several gaps between the intended product and what shipped, plus one serious latent bug in the money flow. All of the below are implemented, not just documented, and are shipped in `supabase/migrations/20260812000000_production_hardening.sql` plus the application code in this release.

**Fixed - real bugs, not just gaps:**
- **Property contact leak.** `PropertyPage.jsx` used to join `profiles(phone)` directly and open WhatsApp with it unconditionally. RLS happened to block the join for non-owners in practice, but that was incidental, not designed - any future policy change could have turned it into a real leak. Replaced with `get_property_contact()`, a `SECURITY DEFINER` RPC that only returns a phone number to the property's owner, staff, or a party to a **funded** escrow transaction on that exact property.
- **Escrow could never actually be confirmed (property vertical) - a deeper bug than it first looked.** Two compounding issues, both now fixed:
  1. `EscrowPage.jsx` took payment via the payment gateway (then Flutterwave) but never wrote an `escrow_transactions` row first, so the webhook had no `payment_ref` to resolve against. Fixed with `start_property_escrow_payment()` (mirrors ADR-009's `start_escrow_payment` pattern) and a new `PropertyReserveModal.jsx` that calls it before opening Paystack.
  2. Even when a row existed, `escrow_transactions` was missing four columns that existing code already assumed: `payment_ref`, `funded_at`, `released_at`, `created_at`. Both `api/paystack-webhook.js` and `api/escrow-webhook.js` (crypto) resolve rows by `payment_ref` and reference `funded_at`; the baseline schema's own `fn_check_deed_completion()` trigger sets `released_at`. None of these columns existed, so every escrow confirmation attempt - Paystack **and** crypto, on every category that uses this table - failed at the query step with a Postgres "column does not exist" error, silently logged and swallowed. `api/paystack-webhook.js` was also selecting `platform_fee`/`amount`, columns that were never named that (the real names are `platform_amount`/`gross_amount`), and writing `status: 'confirmed'` while the RLS policy and `get_property_contact()` both expect `'funded'` - fixed all three. One near-miss caught during the fix: `confirmed_at` on this table means "tenant confirmed move-in" and has its own auto-release trigger - setting it at payment-funding time (an early draft of this fix did) would have skipped the entire escrow protection window by triggering instant auto-release. Left untouched; only `status`/`funded_at` are set when a payment lands.
- **`/api/send-email` and `/api/send-whatsapp` had no auth, no rate limit, and trusted a client-supplied recipient.** Anyone who found the URL could relay unlimited email/WhatsApp through DealMatch's Resend/WhatsApp Cloud API credits to any address. Both now require a valid Supabase session, resolve the recipient server-side from `userId` only, rate-limit per user and per IP, HTML-escape interpolated content, and log every send to `outbound_message_log`.

**Added - spec gaps closed:**
- **Guest checkout** (`GuestAuthModal.jsx`): lightweight phone-OTP sign-in, no forced onboarding wizard, wired into `PropertyPage.jsx` (reserve / save) and `JobPostingPage.jsx` (post a job). Requires Supabase Auth's Phone provider (e.g. Twilio) to be enabled - see Environment Variables below; falls back to a clear "continue with email" prompt if it isn't configured yet.
- **Dual verification write-path** (`verification_submissions` table + `submit_verification()` / `review_verification_submission()` / `demote_verification_level()` RPCs): ADR-008's Identity → Skill → Trusted ladder existed but nothing ever wrote to `verified_providers.level`. `SkillVerificationPage.jsx` (`/verify-skill`) is the portfolio-first Level 2 submission flow; approval only ever happens through the staff-checked RPC, never a direct client write.
- **Find a Provider** (`FindProviderPage.jsx`, `/find-provider`): filter chips (Available now / Highest rated / Within 5km), card order per spec (Identity → Badge → Distance/Rating → Price → dual CTA), lists Level 2+ providers only (matches ADR-008's "Level 2 required to appear in matching" rule). Note: "Within 5km" is approximated by city match, not a true radius - `profiles` has no lat/lng column yet; see Known Follow-Ups.
- **Wallet** (`WalletPage.jsx`, `/wallet`): unified view of escrow funds in flight, completed job payments, and referral earnings/loyalty points, reading existing RLS-scoped tables - no new write path.
- **Manage Listings** (`ManageListingsPage.jsx`, `/manage-listings`): seller's dashboard across both `properties` and `category_listings`, with pause/reactivate/remove (soft-delete via status, since both tables are referenced by financial history).
- **Admin CRM**: two new tabs - **Skill Verify** (the Level 2 review queue) and **Pipeline** (`admin_deal_pipeline` view, unifying the legacy escrow world and the ADR-009 transactions world into one Enquiry → Negotiation → Paid (Escrow) → Completed → Commissioned/Lost board).
- **Routing**: `/find-place`, `/find-provider`, `/post-job`, `/jobs/:id`, `/wallet`, `/manage-listings`, `/verify-skill` were referenced in `Navbar.jsx` but never registered in `App.jsx` - every primary nav link 404'd. Fixed; `/browse` is now a public route (RLS already permits anonymous reads of active listings) so guest browsing works before any account exists.
- **Design system**: `Navbar.jsx` had drifted onto a second, slightly different hex palette than the rest of the app (`tailwind.config.js`'s locked `terracotta`/`cream`/`deep` tokens). Reconciled to one palette.

**Known follow-ups (flagged, not silently worked around):**
- No PostGIS geography/lat-lng column on `profiles` yet, so true radius search for providers isn't possible - "Within 5km" and the Find Provider map are placeholders until that column + index ships (same pattern `properties`/`category_listings` already use).
- `react-router-dom` has an open `npm audit` advisory (moderate, open-redirect via backslash in `<Link>`/`useNavigate`) that requires a v6→v7 major upgrade to fully clear; deferred as a planned, tested migration rather than bundled into this pass, since a rushed major-version router upgrade is a bigger production risk than the advisory itself in an app with no untrusted redirect targets and no React Router SSR usage.
- The email/WhatsApp notification-triggering model is still client-initiated (a logged-in user's browser calls the endpoint on their own behalf, with the recipient resolved server-side). The more robust long-term design is triggering these entirely server-side from the webhook/RPC that causes the event, removing the client from the loop altogether - noted for a future pass.

---



## Dashboard & Profile rebuild (August 2026, second pass)

A follow-up spec asked for the Dashboard and Profile to stop feeling like a property-only tool and properly support both "Find a Place" (shortlets + all rentals + housing) and "Find a Provider" (skilled people/services) equally. Implemented, plus two real security/data findings caught while building it:

**Security finding, already-deployed:** `admin_deal_pipeline` (added in the previous pass) was missing `security_invoker = true`. Postgres views default to running with the *view owner's* privileges - Supabase's `postgres` role can bypass RLS - so any authenticated user who found the view name could potentially have queried it directly and seen every deal platform-wide (buyer/seller/requester/provider identities, amounts). It's queried directly from the browser in the admin Pipeline tab, not through a server-checked route, so this mattered. Fixed forward via `ALTER VIEW ... SET (security_invoker = true)` in the new migration (the original file is already applied to production and wasn't edited in place, to avoid drift between what's deployed and what's in the repo).

**Related gap caught while fixing it:** `transactions` (ADR-009) had no staff-read RLS policy at all - only participant (`requester_id`/`provider_id`) access. Once `security_invoker` correctly started enforcing RLS as the caller, the admin Pipeline tab would have silently shown only the legacy escrow half of the picture to staff. Added the missing `transactions_select_staff` policy.

**New, real "Become a Provider" toggle:** `profiles.offers_services` (boolean, user-settable). Previously "is this person a provider" was only inferable from a `verified_providers` row (staff-approved) or a `verification_submissions` row (self-submitted evidence) - there was no way to express "yes, I want to" as a first step. Saying yes here is a statement of intent only; it never grants provider status or bypasses verification - clicking it immediately routes into the real `/verify-skill` submission flow.

**Unified "My Requests":** a request could live in one of three separate tables depending on what was asked for (`rental_enquiries`, `professional_requests`, or `transactions` where the user is `requester_id`). Added `my_requests`, a `security_invoker` view unioning all three, so the Dashboard issues one query instead of three. `rental_enquiries` also had no `user_id` column at all (guest-only by design) - added it (nullable) plus a "see own" RLS policy, and updated `RentalsPage.jsx`'s enquiry insert to attribute it when a session exists.

**"Find a Place" unification:** `properties.category` already had `rental`/`shortlet`/`hotel` values and `/rentals` already browsed rental+shortlet together - so this mostly already existed, it just needed a front door. The Dashboard's primary "Find a Place" card now points there. Student Housing stays a separate, clearly-badged "Coming Soon" tile rather than being folded into the same page, since its actual browse page is still a placeholder (confirmed by reading the page, not assumed).

**Also fixed:** `/list` (the sale-only property composer) had no way to discover long-term rental listing existed as a separate flow at `/list-rental` - added a "For Rent (annual / long-term) →" option that redirects there instead of duplicating its lease-term/deposit logic. The Dashboard's quick-links grid was missing Rentals entirely (existed and was fully routed, just unlinked from anywhere a user would land).

---

## Why One Serverless Function

The deployment plan caps the number of serverless functions. Rather than one file per endpoint, everything (categories, listings, matching, forum, search, sitemap, bot-facing SSR) is dispatched through `api/platform.js` via a `?resource=` or `?render=` query param, with `vercel.json` rewriting the real user-facing URLs (`/api/categories`, `/api/forum/threads`, `/sitemap.xml`, etc.) to that one function. A CI check (`.github/workflows/fitness-functions.yml`) fails the build if the function count exceeds budget.

Note: the bot-facing render path (`?render=html`, used for search/AEO crawlers) is deliberately **not** wrapped in the same auth/origin middleware as the rest of the API, since that middleware would 403 every crawler by design. See the comments in `api/platform.js` before changing that.

---

## Key Features

- **Schema-driven marketplace**: every category's browse filters and listing composer are generated from its JSON Schema. Adding a category is a database insert, not a new page.
- **Universal search**: one Postgres RPC federates full-text search across every category and the legacy Real Estate tables in a single query.
- **Community Forum**: category-organized Q&A/discussion, server-rendered for crawlers (bot-facing HTML with `QAPage`/`DiscussionForumPosting` structured data) while real users get the React SPA.
- **Marketplace map**: Google Maps pane on category browse (persistent on desktop, collapsible on mobile) and listing detail, backed by explicit `lat`/`lng` RPC columns rather than raw PostGIS geography.
- **Guest checkout**: browse, save, reserve, or post a job without a full account - a lightweight phone-OTP (`GuestAuthModal.jsx`) instead of the full signup wizard, defers onboarding indefinitely.
- **Escrow-gated contact**: no phone number or contact detail surfaces until payment is placed in escrow, on any category - enforced by a `SECURITY DEFINER` RPC (`get_property_contact()` for Real Estate; the transactions/bids RLS policies for every other category), not just hidden in the UI.
- **Dual verification (Identity + Skill)**: `verified_providers.level` (ADR-008) climbs Pending → Identity Verified → Skill Verified → Trusted through a staff-reviewed submission queue (`verification_submissions`), portfolio-first for Skill - photos of real work outrank certificates.
- **Find a Provider**: filter chips (Available now / Highest rated / Within 5km), verified-first ordering, dual CTA (Request Bid / View Profile).
- **Wallet**: one view of escrow funds in flight, completed job payments, and referral earnings across every category.
- **Verified Listings**: every Real Estate listing physically inspected by a DealMatch agent; other categories use identity + evidence-based verification.
- **3-Level Referral**: 8% / 4% / 2% cash + loyalty points for deeper network.
- **Availability Manager**: real-time hotel room sync prevents double bookings.
- **Admin Panel**: listing approval, identity + skill verification queues, unified deal pipeline (Enquiry → Negotiation → Paid Escrow → Completed → Commissioned), agent management.
- **PWA**: installs on any phone, works offline.

---

## Revenue Model

| Stream | Rate |
|--------|------|
| Property Sale | 1.5% of sale price |
| Annual Rental | 3% of first year rent |
| Short-let / Hotel | 5% per booking |
| Escrow | 1% per party, capped at N70,000 |
| Professional Subscription | N25,000/month |
| Rental Listing Fee | N15,000 per listing |
| Premium Listing | N50,000 one-time |
| Availability Manager | N5,000/month per hotel |

Monetisation for the newer categories (Artisans, Logistics, Professional Services, etc.) is a separate, not-yet-finalised discussion.

---

## Referral & Loyalty System

### Cash Chain (3 levels)
| Level | Rate | Type |
|-------|------|------|
| Level 1 | 8% of DM commission | Cash |
| Level 2 | 4% of DM commission | Cash |
| Level 3 | 2% of DM commission | Cash |

### Loyalty Points (Level 4+)
| Level | Points per deal |
|-------|----------------|
| Level 4 | 60 points |
| Level 5 | 40 points |
| Level 6 | 25 points |
| Level 7 | 15 points |
| Level 8 | 10 points |
| Level 9 | 5 points |
| Level 10+ | 2 points |

**Conversion:** 100 points = N10,000 cash (minimum 100 to redeem)

### Tiered Referral (Protects Margin on Small Transactions)

| Tier | DealMatch Commission | Referral Payout |
|------|----------------------|------------------|
| Full Chain | N50,000 and above | Full 8% / 4% / 2% cash |
| Flat Tier | N5,000 - N49,999 | Flat N500 cash per referrer (L1/L2/L3) |
| Points Only | Below N5,000 | No cash. L1/L2/L3 earn 15/10/5 points instead |

Configuration lives in `src/lib/referral.js`:
```
FULL_CHAIN_THRESHOLD = 50000
FLAT_TIER_THRESHOLD  = 5000
FLAT_REFERRAL_AMOUNT = 500
```

### Agent Structure
- Field Agent: N3,000 per verified listing
- Senior Agent: N500 override per their agents' verifications
- Regional Coordinator: performance bonus per region targets

---

## Environment Variables

Set these in Vercel, scoped per environment (Production vs. Preview, so a sandbox branch never touches production data):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FLUTTERWAVE_V4_CLIENT_ID=      # V4 Live/Sandbox API keys page (OAuth client credentials)
FLUTTERWAVE_V4_CLIENT_SECRET=
FLUTTERWAVE_BASE_URL=         # sandbox: https://developersandbox-api.flutterwave.com  live: https://f4bexperience.flutterwave.com
FLUTTERWAVE_SECRET_HASH=       # the webhook secret hash set in the Flutterwave dashboard; checked against the flutterwave-signature header
VITE_PINECONE_API_KEY=
VITE_PINECONE_INDEX=
VITE_GOOGLE_MAPS_API_KEY=
VITE_APP_URL=https://www.dealmatch.com.ng
RESEND_API_KEY=
WHATSAPP_CLOUD_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
VITE_SENTRY_DSN=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=
```

**Guest checkout requires one manual Supabase Auth setup step** that can't be done via migration: enable the **Phone provider** (Authentication → Providers → Phone) with an SMS provider such as Twilio configured. Until that's on, `GuestAuthModal.jsx` falls back to directing people to the full `/auth` email signup instead of failing silently.

---

## Database Setup

Run every file in `supabase/migrations/` **in filename order** (they're timestamped, so alphabetical order is correct order) in the Supabase SQL Editor. For a brand-new project (staging or otherwise), the very first file is a full production schema dump; if you need a single-paste version with Supabase's internal system schema already stripped out (recommended for a fresh project), ask for the generated staging bootstrap bundle rather than pasting the raw dump directly, since the raw dump includes `psql`-only meta-commands (`\restrict`/`\unrestrict`) that fail in the SQL Editor.

The full list of migrations, in order, with what each did and whether it is applied to production, is `docs/runbooks/production-migration.md`. Files that must not run live in `supabase/parked/`. One thing a SQL migration cannot do: enable the **Phone** auth provider in Supabase Studio (Authentication, Providers) if you want guest checkout to send SMS codes.

After the migrations run, verify with:
```bash
npm run check:fitness
```
This checks module boundaries and the serverless function count budget, not the database itself, but it's the fastest signal that the codebase side of a deploy is sound before you test against the database you just migrated.

---

## Deployment

Push to `main` on GitHub and Vercel auto-deploys to production. For anything not yet production-ready, push to a feature branch instead (for example `sandbox-marketplace`): Vercel builds a Preview deployment automatically, and as long as that branch's environment variables point at a separate staging Supabase project (not production), nothing you test there touches live data.

```bash
# Local development
npm install
npm run dev

# Production build test
npm run build

# Architecture fitness checks (module boundaries, function count)
npm run check:fitness
```

### Android & iOS apps

DealMatch ships as native Android and iOS app shells (Capacitor), wrapping the live website rather than bundling a local copy - see `capacitor.config.ts` for why. Both native projects live in `android/` and `ios/`, fully scaffolded and branded (real icons, splash screens, camera permissions), but **not compiled** - that needs Android Studio (Android) or a Mac with Xcode (iOS), neither of which this dev environment has access to. Full build and store-submission walkthrough, including a real Apple review-risk consideration worth reading before your first iOS submission: **[`MOBILE_APPS_SETUP.md`](./MOBILE_APPS_SETUP.md)**.

---

## Security

- Supabase RLS on every table, including every new category-system table and the new `verification_submissions` / `outbound_message_log` tables
- Contact reveal (Real Estate) goes through `get_property_contact()`, a `SECURITY DEFINER` RPC scoped to owner/staff/funded-escrow-counterparty - never a raw client join on `profiles.phone`
- Escrow rows are written server-side (via `start_escrow_payment()` / `start_property_escrow_payment()`) *before* payment starts, so `payment_ref` always exists for the webhook to resolve against - no client-controlled escrow amounts or party IDs
- Verification level (`verified_providers.level`) only moves via a staff-checked `SECURITY DEFINER` RPC (`review_verification_submission()`); no client UPDATE policy exists on that table at all
- `/api/send-email` and `/api/send-whatsapp` require an authenticated session, resolve the recipient server-side only (never a client-supplied address), rate-limit per user and per IP, and log every send
- Input sanitization on all form inputs
- Rate limiting on auth (5 attempts/minute), on the bot-facing render path (separately, since that path can't use the normal auth-based rate limiter), and now on both outbound message endpoints
- Security headers: HSTS, X-Frame-Options, CSP, X-XSS-Protection
- Flutterwave webhook verification (flutterwave-signature HMAC-SHA256 over the raw body, then each event re-read from the Flutterwave V4 API) and escrow webhook signature verification (fail-closed - a missing/invalid signature is rejected, not silently skipped)
- No secrets in client code
- Module boundary enforcement: no file outside a module's own directory queries a table that module owns (enforced by `npm run check:fitness`, wired into CI)
- `npm audit`: clean except one moderate `react-router-dom` advisory requiring a v6→v7 major upgrade, deferred as a planned migration - see "Known follow-ups" above

---

## Admin Access

Admin panel at `/admin`, restricted to the registered admin email.
Agent dashboard at `/agent`, restricted to users with `role = 'agent'`.

---

## One Account Per Person

DealMatch enforces single-account-per-individual through three layers:

1. **Phone uniqueness**: database constraint blocks duplicate phone numbers across all profiles
2. **Email uniqueness**: Supabase Auth enforces unique emails natively
3. **Device fingerprinting**: `src/lib/deviceFingerprint.js` generates a stable hash from device characteristics at signup; a second signup attempt from the same device is blocked with a clear message

---

*DealMatch Technology Limited, Uyo, Akwa Ibom, Nigeria*

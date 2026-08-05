# DealMatch: Matched, Not Just Posted

> DealMatch matches real demand with vetted supply across property, skilled trades, professional services, logistics, and more. Not a directory, a matching engine.

**Live:** https://www.dealmatch.com.ng
**Company:** DealMatch Technology Limited (CAC Registration in Progress)
**Founded:** 2026 | Uyo, Akwa Ibom State, Nigeria

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
| Payments | Paystack (card/bank) + USDT crypto |
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
│                            # WhatsAppButton, ScrollReveal, AnimatedStat, etc.
├── context/
│   ├── AuthContext.jsx     # Global auth state
│   └── ThemeContext.jsx    # Theme management
├── lib/
│   ├── supabase.js         # Browser DB client
│   ├── supabaseServer.js   # Server-side DB client (Vercel functions, process.env)
│   ├── schemaValidation.js # Ajv validation against each category's JSON Schema
│   ├── apiMiddleware.js    # withSecurity() wrapper (auth, rate limit, origin check)
│   ├── redis.js            # Rate limiting
│   ├── paystack.js         # Payment processing
│   ├── pinecone.js         # AI vector matching (Real Estate)
│   └── referral.js         # 3-level cash + points system
├── pages/
│   ├── Home/                # Landing page (Netflix-style category rails)
│   ├── Marketplace/         # Schema-driven browse, composer, listing detail, search
│   ├── Forum/                # Community forum (SEO/AEO discovery layer)
│   ├── Browse/                # Real Estate search + swipe
│   ├── Property/               # Property detail page
│   ├── Rentals/, Hotels/, StudentHostels/, Professionals/
│   ├── Auth/, Onboarding/, Matches/, List/, Escrow/, Tenancy/
│   ├── Messages/, Dashboard/, Profile/, Referral/
│   ├── LandlordDashboard/, LenderDashboard/, Agent/, Admin/
│   └── Legal/, PostVerification/
└── App.jsx                  # Routes + lazy loading

api/
├── platform.js               # Single consolidated serverless function (see below)
├── admin/, agent/             # Legacy dedicated endpoints
└── (all other resources route through platform.js via vercel.json rewrites)

scripts/
└── check-architecture-fitness.mjs  # Module boundary + function-count checks (npm run check:fitness)

supabase/migrations/           # Timestamped, run in filename order
```

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
- **Escrow-gated contact**: no phone number or contact detail surfaces until payment is placed in escrow, on any category.
- **Verified Listings**: every Real Estate listing physically inspected by a DealMatch agent; other categories use identity + evidence-based verification.
- **3-Level Referral**: 8% / 4% / 2% cash + loyalty points for deeper network.
- **Crypto Payments**: USDT on TRC20, BEP20, ERC20 alongside Paystack.
- **Availability Manager**: real-time hotel room sync prevents double bookings.
- **Admin Panel**: full listing approval, crypto verification, agent management.
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
VITE_PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=
VITE_PINECONE_API_KEY=
VITE_PINECONE_INDEX=
VITE_GOOGLE_MAPS_API_KEY=
VITE_APP_URL=https://www.dealmatch.com.ng
RESEND_API_KEY=
VITE_SENTRY_DSN=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=
```

---

## Database Setup

Run every file in `supabase/migrations/` **in filename order** (they're timestamped, so alphabetical order is correct order) in the Supabase SQL Editor. For a brand-new project (staging or otherwise), the very first file is a full production schema dump; if you need a single-paste version with Supabase's internal system schema already stripped out (recommended for a fresh project), ask for the generated staging bootstrap bundle rather than pasting the raw dump directly, since the raw dump includes `psql`-only meta-commands (`\restrict`/`\unrestrict`) that fail in the SQL Editor.

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

---

## Security

- Supabase RLS on every table, including every new category-system table
- Input sanitization on all form inputs
- Rate limiting on auth (5 attempts/minute) and on the bot-facing render path (separately, since that path can't use the normal auth-based rate limiter)
- Security headers: HSTS, X-Frame-Options, CSP, X-XSS-Protection
- Paystack webhook signature verification
- No secrets in client code
- Module boundary enforcement: no file outside a module's own directory queries a table that module owns (enforced by `npm run check:fitness`, wired into CI)

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

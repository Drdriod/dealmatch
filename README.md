# DealMatch — Smart Property Matching Platform

> Nigeria's AI-powered real estate marketplace. Find, verify, and close property deals securely.

**Live:** https://www.dealmatch.com.ng  
**Company:** DealMatch Technology Limited (CAC Registration in Progress)  
**Founded:** 2026 | Uyo, Akwa Ibom State, Nigeria

---

## What DealMatch Does

DealMatch connects property buyers, sellers, landlords, tenants, hotels, and real estate professionals on one verified platform. Every listing is physically inspected before going live. Every payment is protected by escrow. Every professional is vetted before listing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS + Custom Design System |
| Animation | Framer Motion |
| Backend/DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (OTP + Google OAuth) |
| AI Matching | Pinecone Vector Search |
| Payments | Paystack (card/bank) + USDT crypto |
| Hosting | Vercel (CI/CD via GitHub) |
| PWA | Service Worker + Web App Manifest |
| Analytics | PostHog |
| Error Tracking | Sentry |

---

## Project Structure

```
src/
├── components/
│   ├── layout/          # Navbar, Footer, AppShell
│   ├── matching/        # SwipeCard, MatchToast
│   ├── maps/            # PropertyMap
│   └── ui/              # CryptoPayment, LiveVerification,
│                        # CommissionAgreement, SearchPalette,
│                        # WhatsAppButton, ScrollReveal, AnimatedStat
├── context/
│   ├── AuthContext.jsx  # Global auth state
│   └── ThemeContext.jsx # Theme management
├── lib/
│   ├── supabase.js      # DB client with cache + timeout
│   ├── paystack.js      # Payment processing
│   ├── pinecone.js      # AI vector matching
│   ├── referral.js      # 3-level cash + points system
│   ├── crypto-payment.js # USDT payment config
│   ├── sanitize.js      # Input sanitization
│   ├── rateLimit.js     # Brute force protection
│   ├── security.js      # Security utilities
│   └── posthog.js       # Analytics
├── pages/
│   ├── Home/            # Landing page
│   ├── Auth/            # Login, OTP, Google OAuth, Callback
│   ├── Onboarding/      # New user setup
│   ├── Browse/          # Property search + swipe
│   ├── Property/        # Property detail page
│   ├── Matches/         # AI match results
│   ├── List/            # 5-step property listing
│   ├── Rentals/         # Rental search + listing
│   ├── Hotels/          # Hotel + short-let booking
│   ├── StudentHostels/  # Student accommodation
│   ├── Mortgage/        # Mortgage applications
│   ├── Escrow/          # Escrow payment system
│   ├── Tenancy/         # Digital tenancy agreements
│   ├── Professionals/   # Directory + booking
│   ├── Availability/    # Hotel room management
│   ├── Referral/        # 3-level referral + points
│   ├── Messages/        # In-app messaging
│   ├── Earn/            # Earnings dashboard
│   ├── Dashboard/       # User dashboard
│   ├── Profile/         # Profile + verification
│   ├── LandlordDashboard/ # Landlord management
│   ├── LenderDashboard/ # Lender management
│   ├── Agent/           # Agent verification dashboard
│   ├── Admin/           # Admin panel (owner only)
│   ├── Legal/           # Privacy Policy + Terms
│   └── PostVerification/# Post-signup verification
└── App.jsx              # Routes + lazy loading
```

---

## Key Features

- **AI Property Matching** — Pinecone vector search learns user preferences
- **Swipe Interface** — Browse properties like a mobile-first experience
- **Verified Listings** — Every listing physically inspected by a DealMatch agent
- **Escrow System** — 1% per party (capped N70,000) held until deal confirmed
- **3-Level Referral** — 8% / 4% / 2% cash + loyalty points for deeper network
- **Crypto Payments** — USDT on TRC20, BEP20, ERC20 alongside Paystack
- **Availability Manager** — Real-time hotel room sync prevents double bookings
- **Professional Directory** — Surveyors, lawyers, inspectors, lenders
- **Admin Panel** — Full listing approval, crypto verification, agent management
- **PWA** — Installs on any phone, works offline

---

## Revenue Model

| Stream | Rate |
|--------|------|
| Property Sale | 1.5% of sale price |
| Annual Rental | 3% of first year rent |
| Short-let / Hotel | 5% per booking |
| Escrow | 1% per party, capped N70,000 |
| Professional Subscription | N25,000/month |
| Rental Listing Fee | N15,000 per listing |
| Premium Listing | N50,000 one-time |
| Availability Manager | N5,000/month per hotel |

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

### Agent Structure
- Field Agent: N3,000 per verified listing
- Senior Agent: N500 override per their agents' verifications
- Regional Coordinator: Performance bonus per region targets

---

## Environment Variables

Set these in Vercel dashboard under Settings > Environment Variables:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PAYSTACK_PUBLIC_KEY=
VITE_PINECONE_API_KEY=
VITE_PINECONE_INDEX=
VITE_APP_URL=https://www.dealmatch.com.ng
PAYSTACK_SECRET_KEY=
```

---

## Database Setup

Run these SQL files in Supabase SQL Editor in order:

1. `src/lib/professional-schema.sql`
2. `src/lib/crypto-schema.sql`
3. `src/lib/availability-schema.sql`
4. `src/lib/referral-schema.sql`

---

## Deployment

Push to `main` branch on GitHub. Vercel auto-deploys.

```bash
# Local development
npm install
npm run dev

# Production build test
npm run build
```

---

## Security

- Supabase RLS on all tables
- Input sanitization on all form inputs
- Rate limiting on auth (5 attempts/minute)
- Security headers: HSTS, X-Frame-Options, CSP, X-XSS-Protection
- Paystack webhook signature verification
- No secrets in client code

---

## Admin Access

Admin panel at `/admin` — restricted to the registered admin email.  
Agent dashboard at `/agent` — restricted to users with `role = 'agent'`.

---

*DealMatch Technology Limited — Uyo, Akwa Ibom, Nigeria*

---

## One Account Per Person

DealMatch enforces single-account-per-individual through three layers:

1. **Phone uniqueness** — Database constraint blocks duplicate phone numbers across all profiles
2. **Email uniqueness** — Supabase Auth enforces unique emails natively
3. **Device fingerprinting** — `src/lib/deviceFingerprint.js` generates a stable hash from device characteristics at signup. If the same device tries to register a second account, signup is blocked with a clear message.

Run `src/lib/one-account-schema.sql` in Supabase SQL Editor to activate phone uniqueness constraint and device check functions.

---

## Tiered Referral System (Protects Margin on Small Transactions)

Referral payouts scale with transaction size so DealMatch never loses money on small bookings:

| Tier | DealMatch Commission | Referral Payout |
|------|----------------------|------------------|
| Full Chain | N50,000 and above | Full 8% / 4% / 2% cash |
| Flat Tier | N5,000 - N49,999 | Flat N500 cash per referrer (L1/L2/L3) |
| Points Only | Below N5,000 | No cash. L1/L2/L3 earn 15/10/5 points instead |

This means hotel bookings, short small transactions, and tiny services still reward sharing (via points) without ever putting DealMatch's margin at risk. Margin stays above 84% across every transaction type, from a N10,000 hotel booking to a N60,000,000 property sale.

Configuration lives in `src/lib/referral.js`:
```
FULL_CHAIN_THRESHOLD = 50000
FLAT_TIER_THRESHOLD  = 5000
FLAT_REFERRAL_AMOUNT = 500
```

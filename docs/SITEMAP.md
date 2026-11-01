# DealMatch sitemap and role map

Generated from `src/App.jsx` and the production database on 2026-10-28. DealMatch is a trust-first two-door marketplace: **Places** and **People**, with **DealMatch Protection** (protected payment) across both. See `docs/runbooks/full-stack-test-plan.md` for how each area is tested.

The "Route guard" column is the guard on the route itself. A page marked public may still ask the visitor to sign in, or check the account role, inside the page.

## Account roles (profiles.role, enforced by a database check)

`buyer`, `seller`, `renter`, `landlord`, `agent`, `investor`, `student`, `professional`, `lender`, `verifier`, `admin`, `superadmin`.
The admin console opens for `admin`, `superadmin`, `agent` and `verifier`, or an email on the allow list. Production today: 15 buyers, 1 seller, 1 superadmin.

## Public pages

| Route | Page | Door |
|---|---|---|
| `/` | Home | both |
| `/places`, `/rentals` | Places results (rentals) | Places |
| `/hotels` | Hotels and shortlets | Places |
| `/student-hostels` | Student hostels | Places |
| `/property/:id` | Listing detail | Places |
| `/browse`, `/search` | Browse, universal search | both |
| `/category/:slug` | Category page (80+ categories) | both |
| `/providers`, `/provider/:id` | Find a provider, provider profile | People |
| `/request` | Post a request (job posting) | People |
| `/marketplace/*`, `/forum/*` | Marketplace, community forum | both |
| `/escrow`, `/tenancy` | Escrow explainer and tenancy tools | both |
| `/how-it-works`, `/protection`, `/help`, `/rules`, `/about`, `/contact` | Trust and help pages | both |
| `/terms`, `/privacy`, `/delete-account` | Legal and account deletion | both |
| `/mortgage` | Coming-soon page (mortgage is not live) | n/a |
| `/wa/link` | Link a WhatsApp number to an account | both |
| `/auth`, `/auth/callback`, `/auth/reset-password`, `/auth/reset` | Sign in, sign up, recovery | n/a |
| `/staff/accept-invite` | Accept a staff invite | admin |

Redirects: `/login`, `/signup`, `/start`, `/properties`, `/find-place`, `/find-provider`, `/post-job`, `/jobs`, `/professionals`, `/admin-login`.

## Signed-in pages

| Route | Page | Who |
|---|---|---|
| `/onboarding` | Choose intent and finish profile | everyone |
| `/dashboard`, `/profile`, `/messages`, `/matches` | Dashboard, profile, messages, swipe matches | everyone |
| `/verify`, `/verify-identity`, `/verify-skill` | Verification levels, identity, skill verification | everyone, providers |
| `/student-verify`, `/list-hostel` | Student verification, list a hostel | student, landlord |
| `/list`, `/list-rental`, `/manage-listings`, `/availability` | List a property, manage listings, availability | landlord, seller, agent |
| `/landlord` | Landlord dashboard | landlord |
| `/provider`, `/apply-professional`, `/payout-setup` | Provider workspace, apply as professional, payout setup | professional |
| `/jobs/:id` | Job or request detail, quotes and bids | customer, provider |
| `/wallet` | Wallet, withdrawals, loyalty, unlock credits | everyone |
| `/referrals`, `/referral` | Referral code and earnings | everyone |
| `/transactions/:ref` | Protected transaction detail and timeline | the two parties |
| `/disputes/new`, `/disputes/:id` | Open a dispute, case view and evidence | the two parties |
| `/lender` | Lender dashboard (mortgage applications) | lender |
| `/agent` | Agent dashboard | agent |

## Staff pages

| Route | Page |
|---|---|
| `/staff-gate-7f3k` | Staff sign-in (not linked anywhere) |
| `/admin/*` | Admin console |
| `/admin/payment-test` | Payment test page (sandbox) |

Admin console tabs: Overview, Analytics, Users, Properties, Professionals, Skill verification, Identity, Student verifications, Student hostels, Transactions, Disputes, Payouts, Platform fees, Monetisation, Pipeline, Mortgage, Complaints, Enquiries, Testimonials, Announcements, Agent scores, Staff, Settings.

## Domain areas behind the pages (public tables)

Listings and media (properties, property_images, room_categories, student_hostels, institutions); people and trust (profiles, professionals, verified_providers, verification_submissions, student_verifications, reviews); money (transactions, transaction_events, escrow_transactions, payments, payment_virtual_accounts, payment_refunds, payout_accounts, payout_queue, withdrawal_requests, wallet_ledger, unlock_credit_ledger, loyalty_points, referral_transactions, platform_fees); disputes (disputes, dispute_events); requests and offers (professional_requests, bids, contracts, deal_agreements); messaging (messages, notifications, wa_* tables); staff and audit (admin_audit_log, staff_invites, admin_login_attempts).

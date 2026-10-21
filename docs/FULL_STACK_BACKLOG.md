# Full-stack backlog: what is missing, and how to solve it

As of 2026-10-21. Written so each item can be handed to someone else without needing this chat.

**Where it comes from.** The founder's *Complete Product Wireframe & Build Specification* (sitemap, page specs,
flows A to E, design system, data model, state machine, acceptance checklist), compared with the app as it is
today. The spec itself says to mark every item Live, Partial, Missing or Deferred before building. This does that.
It also folds in the October page audit, the database security audit, ADR-009 and `docs/OPEN_ITEMS.md`.

**How the statuses were decided.** From the code (routes in `src/App.jsx`, pages, repositories), the production
database (tables, constraints, grants, row counts, read-only on 2026-10-21) and the docs. **No page was opened in
a browser for this**, so "Partial" means the code exists, not that it works well. Production holds almost no data
(17 profiles, 0 listings, 0 payments, 0 escrows, 3 job transactions), which makes database changes cheap now and
expensive later.

**Size** is a rough guess for one competent developer: S up to 1 day, M 2 to 4 days, L 1 to 2 weeks.

**Hackathon** column: Y means the Meta hackathon demo benefits directly.

## 1. Scorecard against the spec's sitemap

| Area | Live | Partial | Missing |
|---|---|---|---|
| Public and marketing (15 pages) | 8 | 2 | 5 (Protection, About, Help, Contact, Rules) |
| Auth and onboarding (10) | 7 | 1 | 2 (consent preferences, verification checklist) |
| Customer workspace (14) | 3 | 5 | 6 |
| Provider workspace (16) | 5 | 4 | 7 |
| Checkout and transaction (11) | 0 | 4 | 7 |
| Admin and operations (17) | 8 | 3 | 6 |

The strong side is discovery, onboarding, listings, verification and admin basics. The weak side is the middle of
the product: **what a customer or provider sees once money has moved** (transaction detail, timeline, completion,
cancellation, refund, dispute). That is also where the spec says trust is won.

## 2. UI and UX

### Public and trust pages
| ID | Gap (spec reference) | Status | Evidence | How to solve | Skill | Size | Hackathon |
|---|---|---|---|---|---|---|---|
| UX-1 | **DealMatch Protection page** (sitemap, section 3) | Missing | No route. Protection wording exists only in `FAQSection.jsx`, `PropertyReserveModal.jsx` and notifications | One static page at `/protection`: what is held and when it is released (from the real flow), fees from the fee registry, what is not covered, the dispute path. Every sentence must match what the code does. Counsel reads it first | Content, frontend, counsel | S | Y |
| UX-2 | Help centre and FAQ, Contact and Support, About, Marketplace rules | Missing | No routes. FAQ is a home-page section. Support is a WhatsApp number | Four static pages with footer links. Contact is WhatsApp plus email. The rules page defines what listings and providers may not do, which report moderation then uses | Content, frontend | S | Y |
| UX-3 | Footer links to delete-account, Protection, Help, Rules | Missing | `Footer.jsx` has no `/delete-account` link. The app stores require one | Add the links. The deletion page already exists | Frontend | S | |
| UX-4 | Places and People "two doors" read the same everywhere (section 3, Home) | Partial | `/places`, `/providers`, `/find-provider` exist, `/professionals` redirects | Design review of home, navbar and landing pages for one consistent wording | Designer | S | |

### Account
| ID | Gap | Status | Evidence | How to solve | Skill | Size | Hackathon |
|---|---|---|---|---|---|---|---|
| UX-5 | Notification and consent preferences | Missing | Consent is captured only inside the WhatsApp bot | Settings page. Store choices in a `profiles` jsonb plus a consent log with a version number | Frontend, DB | M | |
| UX-6 | Settings and Security (password, MFA, sessions) | Missing | Only `/profile`. MFA exists for staff only | Page built on Supabase auth: MFA enrol, session list, password change | Frontend | M | |

### Transaction experience (the biggest gap)
| ID | Gap | Status | Evidence | How to solve | Skill | Size | Hackathon |
|---|---|---|---|---|---|---|---|
| UX-7 | **Protected transaction detail and timeline**, for customer, provider and admin | Missing | No `/transactions/:id`. `/escrow` lists funded escrows only. `/jobs/:id` is the job post | One page over a single read model (DB-3). Shows parties, amount, agreed terms, a timeline using the server state, the next action and a support link. Actions depend on role | Designer, full-stack | L | |
| UX-8 | My bookings and requests, with a detail page | Partial | `my_requests` view feeds `/dashboard`. No detail page | Link every row to UX-7 | Frontend | S after UX-7 | |
| UX-9 | **Checkout**: summary, agreed terms, fees, protection acknowledgement, pay, processing, confirmation | Partial | A bank-transfer overlay in `flutterwave.js`, `PropertyReserveModal`, `EscrowPage`. No agreed-terms step. No card or USSD option | One checkout component for every purpose. Terms snapshot (DB-5). Fees from the registry. Bank transfer now, card and USSD later through Flutterwave V4 methods. A processing screen that polls payment status | Designer, full-stack | L | |
| UX-10 | **Dispute submission, case page, evidence upload** | Missing | No page. The `disputes` table has no UI | `/disputes/new?transaction=` and `/disputes/:id`. Evidence goes to a private bucket with a folder policy. Case timeline | Designer, full-stack | L (needs DB-6) | |
| UX-11 | Cancel and refund by the customer | Missing | Only the admin "Money to return" list | A "Cancel or report a problem" action on UX-7, using a written cancellation policy per category. Refund goes through `payment_refunds` | Counsel, full-stack | M, policy first | |
| UX-12 | Notifications page | Partial | `NotificationBell` only | `/notifications`: list, read state, deep links (the factory already sets a `link`) | Frontend | S | |
| UX-13 | Saved listings and providers | Partial | Likes (`swipes`) and `/matches`, properties only | `favorites` table and a saved tab for places and people | Full-stack | M | |
| UX-14 | Reviews: prompt after completion, "my reviews" | Partial | A review needs a COMPLETED transaction (trigger). No prompt or my-reviews page found | Prompt on UX-7 once completed. List given and received | Frontend | M | |

### Provider workspace
| ID | Gap | Status | Evidence | How to solve | Skill | Size | Hackathon |
|---|---|---|---|---|---|---|---|
| UX-15 | **Provider (People) workspace** | Missing | No provider dashboard. `/dashboard` only offers "Become a provider" | `useProviderDashboard` (the loader pattern from the other four dashboards) and a page: new requests, upcoming work, earnings and payout state, profile completion, verification tasks | Designer, frontend | M to L | Y |
| UX-16 | Request inbox and quotes | Partial | `bids` and jobs live inside `JobPostingPage` | Move into the provider workspace. Accept, decline and quote states appear in UX-7 | Frontend | M | |
| UX-17 | "View my public profile as a client" | Missing | | A link on the provider workspace | Frontend | S | |
| UX-18 | Precise service area for providers | Partial | A trigger sets a state-level point. Nothing writes a precise one | Map pin or postcode field, then an RPC `set_provider_location` with a precision value | Full-stack | M | Y |

### Admin
| ID | Gap | Status | Evidence | How to solve | Skill | Size |
|---|---|---|---|---|---|---|
| UX-19 | Disputes queue and case page | Missing | No tab | Tab plus repository (the pattern exists). Decisions need a reason and write an audit row | Frontend | M, needs DB-6 |
| UX-20 | Reports moderation | Missing | `reports` table and `ReportModal` write to it. No tab reads it | Queue, resolve with a reason | Frontend | S to M |
| UX-21 | Audit-log viewer | Missing | `auditLog()` writes. Nothing reads | Read-only tab with filters by actor, target, date | Frontend | S |
| UX-22 | Categories and attributes manager | Missing | 80 categories editable only in SQL | Tab for pillar, order, active. Attribute schemas later | Frontend | M |
| UX-23 | Support tickets, CMS | Missing, Partial | No tickets table. Announcements and Testimonials tabs exist | After DB-7 | Frontend | M |
| UX-24 | Admin hygiene | Open | `NAV_ITEMS` is not filtered by role. `/verify` sits outside `MfaGate`. Founder emails are checked in the browser (`App.jsx`, `AdminPage.jsx`, 8 tabs) | One permission map. Filter the nav from it. Wrap `/verify` in `MfaGate`. Replace email checks with role checks | Frontend | M |
| UX-25 | **Admin Mortgages, Student hostels, Student IDs fail** | Broken | See DB-1 | Fixed by DB-1 | | |

### Across the whole app
| ID | Gap | Status | Evidence | How to solve | Skill | Size | Hackathon |
|---|---|---|---|---|---|---|---|
| UX-26 | **Loading, empty, error and offline states on every primary page** (spec section 5, acceptance 9) | Partial | The pattern (`useLoader`, `LoadNotice`) covers the 4 dashboards. Other pages copy data into state and drop `error`, so a failed read looks like "nothing here" | Roll the pattern out page by page: Browse, Rentals, Hotels, Search, Matches, Messages, Wallet, Escrow, Jobs, provider pages, admin tabs. One small pull request per page. A good job for a junior developer | Frontend | S each, L total | Y |
| UX-27 | **Mobile, accessibility and visual QA** | Missing | The page audit says pages were never run in a browser at mobile widths with real data. My browser harness is in a temporary folder, not the repo | Commit the harness to `e2e/`. Playwright smoke test at 360, 768 and 1280 px. An axe accessibility scan. Status labels must carry text, not only colour | QA, frontend | M | Y |
| UX-28 | Placeholders and dead pages | Decision | `/mortgage` and student hostels show "Coming soon". `/tenancy` is routed and unlinked. `ProfessionalsPage` and `PropertyCarousel` are unrouted | None of these is in the spec's sitemap. Hide them from navigation and delete the dead code until the flow is real | Frontend | S | |

## 3. Database

| ID | Gap | Status | Evidence | How to solve | Size |
|---|---|---|---|---|---|
| DB-1 | **Three admin screens read through the wrong foreign key** | Broken, confirmed on production | `student_hostels.owner_id`, `student_verifications.user_id`, `mortgage_applications.user_id` point at `auth.users`. The admin repositories embed `profiles(...)`. PostgREST has no relationship to follow, so the read errors. Every auth user has a profile (0 without) | Migration: add a foreign key from each of those columns to `profiles(id)` (NOT VALID, then VALIDATE). Rolled-back dry run, owner applies. Same fix for `disputes`, `transactions` and `escrow_transactions.tenant_id` before they are embedded | S |
| DB-2 | Contact and internal columns of `properties` readable by a direct API call | **Written and dry-run, waiting for the PR #17 deploy** | Migration 18 (`20261020000000_properties_column_exposure.sql`): column-level SELECT for `anon` and `authenticated`, 36 public columns granted, 9 withheld, `my_assigned_property_ids()` for the agent dashboard. Dry run on production 2026-10-21 passed 35 of 35 and was rolled back. Code, fitness checks 7 and 9 and tests are in the branch | Owner applies it after PR #17 deploys and before real listings go in (runbook section 7) | Done, apply pending |
| DB-15 | **`properties.status` refuses `under_verification`** | Broken, found 2026-10-21 | The verification flow writes that status in three places (`api/agent`, `VerificationPage`, `AgentDashboardPage`) and `properties_status_check` does not list it | Migration 19 (`20261020010000_properties_status_under_verification.sql`), written, not yet dry-run. Run it in the SQL editor | S |
| DB-16 | **Listings could not be published with photos** | Fixed in code, found 2026-10-21 | Both listing forms sent `images` inside the `properties` insert. That is not a column, so the database refused the insert, and nothing wrote `property_images`. Production has 0 listings and 0 photos, which fits | `src/lib/listingWrite.js` saves the listing, then its photos, and removes the listing again if the photos fail. Unit-tested. Not yet run in a browser against a real database: do it in the smoke test | Done, verify |
| DB-3 | **One read model for protected transactions** | Missing | Two state machines: `transactions` (OPEN, PENDING, FUNDED, COMPLETED, DISPUTED, CANCELLED) and `escrow_transactions`, plus `bookings` for hotels. The spec's states (processing, in progress, awaiting completion, release pending, refund pending, needs attention) do not exist | Do not merge the tables. Add a view `protected_transactions` that maps each source to the spec's display states and a next action, and an append-only `transaction_events` table fed by triggers | L |
| DB-4 | **Money units** | Inconsistent | `payments.amount` is naira (numeric). `payment_refunds.amount_kobo`, `transactions.amount_cents`. Spec section 8 wants minor units | `payments` has 0 rows, so change it now: add `amount_kobo`, switch the webhook and the admin readers, drop `amount` later. After real payments it becomes a risky backfill | M |
| DB-5 | Terms snapshot at agreement | Missing | `deal_agreements` and `contracts` have 0 rows and nothing in `src` or `api` reads them | Decide: use or drop them. Add `terms_version`, `terms_snapshot` (jsonb) and `agreed_at` to the transaction when it is created | M |
| DB-6 | Disputes model | Partial | `disputes` links to `property_id` and `booking_id` only. No transaction link, no assignee, no decision fields, no event history. Evidence is an array of URLs | Add `transaction_id`, `assigned_to`, `decision`, `decision_reason`, `decided_at`. New `dispute_events` (append-only). Private evidence bucket with a folder policy | M |
| DB-7 | Support tickets, preferences, saved items | Missing | No tables | `support_tickets` with messages, `profiles.preferences`, `favorites` | S to M |
| DB-8 | **Audit log can be edited** | Open | `admin_audit_log`: `authenticated` holds UPDATE and DELETE grants, `anon` holds SELECT, there is no trigger, and both `meta` and `metadata` columns exist. Row-level security stops most of it today, but nothing makes the log tamper-proof, which spec section 4E requires | Revoke UPDATE, DELETE and the anon grant. A trigger that raises on UPDATE and DELETE, even for the service role. One metadata column plus `previous_state`, `new_state`, `reason` | S |
| DB-9 | Requests and reviews are spread over several tables | Decision | Requests: `bookings`, `transactions`, `rental_enquiries`, `professional_requests`, `wa_requests`, `property_interest` (joined by view `my_requests`). Reviews: `reviews`, `property_reviews`, `professional_reviews` | Keep the tables. Add one read view per concept. Merge only if you accept a large code change | S |
| DB-10 | Listings are never assigned a category | Missing | Nothing writes `properties.category_id`. The listing form sets only the old `category` text. Category pages stay empty | A category picker in the listing form and a backfill from the old text | M |
| DB-11 | Messaging model | Decision | `messages` has a text `thread_id` and no threads table. No page creates a thread. The recipient can edit and delete (audit F5) | Decide thread per pair, per listing or per transaction. Add `threads` and members, make messages append-only, add to the realtime publication | M |
| DB-12 | Migration replay and staging parity | Open | Four migrations fail on a clean replay. Staging has not had files 9 to 17. No `supabase/config.toml` | Fix the order in `20260731000017`. Forward-fix `transactions.listing_id`. Add the config. Run `supabase db reset` in CI | M |
| DB-13 | Policy debt | Deferred | 313 overlapping permissive policies, about 10 on `properties` alone | One policy per table per command, checked against `supabase/tests/security_hardening.sql` | L |
| DB-14 | Daily reconciliation | Missing | Only payout reconciliation exists (`cron-process-payouts`). `ARCHITECTURE.md` section 11 describes webhook events versus virtual accounts versus escrow | A cron route, a `reconciliation_reports` table, a Sentry alert on mismatch | M |

## 4. Analytics (spec section 9)

| ID | Gap | Status | How to solve | Size |
|---|---|---|---|---|
| AN-1 | The spec lists about 30 events. 16 exist: sign up and in, subscription started and completed, search, property viewed, liked, passed, super-liked and listed, professional viewed and contacted, onboarding started and completed, match viewed and contacted. Missing: filter, saved item, request, quote, checkout, payment succeeded and failed, protected transaction, completion, release, refund, dispute, provider onboarding, verification, request accepted | Missing | A typed event catalogue in `src/lib/events.js`. Server-side capture from the webhook. No money amounts, as `ARCHITECTURE.md` section 11 requires | M |

## 5. Platform and operations

Covered in `docs/OPEN_ITEMS.md`: merge PR #17, secret rotation, CI, the unapplied-money rule for the other
payment types, the virtual-account retry gap, the sandbox payment test, stale docs, the parked taxonomy migration,
Sentry email, `select('*')` leftovers.

## 6. Suggested order

1. **Before real users or real money.** DB-2, DB-15, DB-16 (verify), DB-1, DB-4, DB-8, UX-1, UX-3, and OPEN_ITEMS A1, A2, B2, B3.
2. **Trust in the transaction.** DB-3, DB-5, DB-6, then UX-7, UX-9, UX-10, UX-19, UX-11.
3. **Provider side.** UX-15 to UX-18, DB-10, DB-11.
4. **Quality.** UX-26, UX-27, AN-1, DB-12, DB-14.
5. **Later.** UX-5, UX-6, UX-12 to UX-14, UX-22, UX-23, DB-13.

## 7. Who to source

| Skill | Items | What to give them |
|---|---|---|
| Product designer (Figma) | UX-1, UX-7, UX-9, UX-10, UX-15, and the admin additions | The specification document, this file, the terracotta brand assets. Ask for the states in spec section 7 designed for mobile first |
| Frontend developer (React) | Most UX items | `docs/architecture/design-patterns.md` (rules for new code). The loader pattern and `LoadNotice`. `npm run check` must pass |
| Database engineer (Postgres, Supabase) | DB-1 to DB-14 | The rule in the runbook: every change is a migration, tested in a rolled-back dry run, and applied by the owner. They write; you apply |
| QA and accessibility | UX-26, UX-27 | Real devices, 360 px width, a screen reader pass |
| Content and counsel | UX-1, UX-2, UX-11, the legal questions in ADR-009 | The actual custody and release flow, so wording matches the code |
| DevOps | CI, local stack, DB-12 | `supabase/config.toml`, a workflow running `npm run check` |
| You | Real listings, agents, decisions D1 to D6 in the page audit | |

**Handover rules for anyone who touches the code.** Run `npm run check` before opening a pull request. Pages never
call the database directly (a fitness check fails if they do). Public property reads use the named column list in
`src/lib/propertyColumns.js`, never `*`. New payment behaviour needs a test in `chargePurposes.test.mjs` or the
webhook test. Update the matching row in `docs/` in the same pull request. Keep each pull request to one item from
this list, and put its ID in the title.

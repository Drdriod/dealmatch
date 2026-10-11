# DealMatch Architecture (Full Stack)

Status: draft for review. As of 2026-10-11, `origin/main` at `048f402`.
This document replaces the "Event-Driven Microservices" proposal for the current stage. It keeps the parts of that proposal that fit our platform and drops the parts that do not.

## 1. Principles

1. **One deployable, clear modules.** A modular monolith on Vercel plus Supabase. Bounded contexts are folders and rules, not separate deployments.
2. **Money stays in Postgres.** Escrow, payments and payouts use Postgres transactions, constraints and append-only ledger rows. No second database for money.
3. **Server decides, browser displays.** Any change to payment, escrow, unlock or verification status is written by a server function or webhook, never by the browser.
4. **Stay under the function budget.** Hobby allows 12 functions per deployment. We use 10. New endpoints are new `resource` values in existing dispatchers.
5. **Reuse before adding.** Check the existing tables before creating new ones (see section 4).

## 2. Stack

| Layer | Technology | Where it runs |
|---|---|---|
| UI | React 18.2, Vite 5.2, Tailwind 3.4, react-router 6.22, framer-motion 11 | Browser (static, Vercel CDN) |
| Routing and SEO | `vercel.json` rewrites, `sitemap.xml` and forum HTML rendered for crawlers | Vercel edge |
| API | `api/platform.js` (resource dispatch), `api/admin/[resource].js`, `api/agent/[action].js`, webhooks, `send-*`, `match`, `index-property`, `validate-invite` | Vercel serverless (Node) |
| Auth and DB | Supabase Auth, Postgres 15 with RLS, 58 migrations in `supabase/migrations` | Supabase |
| Storage | Supabase Storage (property images, verification documents) | Supabase |
| Cache, rate limit | Upstash Redis (REST) | Upstash |
| Vector search | Pinecone (`api/match.js`, `api/index-property.js`, `src/lib/ai.js`) | Pinecone |
| Messaging | WhatsApp via Graph API, Twilio SMS, Resend email | Third party |
| Payments | Flutterwave V4 (virtual accounts, transfers). Sandbox now, live later | Flutterwave |
| Scheduled work | Vercel Cron: `cron-process-payouts` daily at 03:00 UTC | Vercel (Production only) |
| Observability | Sentry (10% traces in production), PostHog | Third party |

## 3. System Context

```
            Browser (React SPA)                    WhatsApp / SMS / Email
                  |  HTTPS                                ^        ^
                  v                                       |        |
     +-------------------------+                          |        |
     | Vercel                  |----------- send-* ------+        |
     |  - static SPA           |                                   |
     |  - rewrites + SEO       |                                   |
     |  - api/ functions (10)  |<------ webhooks -- Flutterwave ---+
     |  - cron (payouts)       |
     +-----------+-------------+
                 |  service role (server only)
     +-----------v-------------+        +-----------+     +-----------+
     | Supabase                |        | Pinecone  |     | Upstash   |
     |  - Auth, RLS            |        | (vectors) |     | (Redis)   |
     |  - Postgres + PostGIS   |        +-----------+     +-----------+
     |  - Storage              |
     +-------------------------+
```

## 4. Domains Inside the Monolith

Each domain has a module folder, an owner, and a rule for which tables it may write. Other domains read through the module's functions, not by writing its tables directly.

| Domain | Module (`src/modules/*`, `api/`) | Primary tables (existing) | Writes |
|---|---|---|---|
| Place (properties, stays, hostels) | properties, hostels | `properties`, `property_images`, `bookings`, `student_hostels`, `hostel_enquiries`, `hostel_payments` | Owner, admin |
| People (providers, talent) | providers, matching | `verified_providers`, `professionals`, `professional_applications`, `reviews`, `matches` | Provider, admin |
| Trust and identity | verification | `verification_sessions`, `verification_submissions`, `student_verifications` | Server only (after provider check) |
| Fulfilment (jobs, bookings) | jobs | `bookings`, `deal_agreements`, `contracts` | Server state machine (section 6) |
| Escrow and payments | payments | `escrow_transactions`, `payments`, `payment_virtual_accounts`, `transactions`, `payout_queue`, `payout_accounts`, `withdrawal_requests`, `unlock_credit_ledger`, `wallet_ledger`, `commission_wallet_ledger` | Server and webhook only |
| Messaging | messaging, wa_* | `messages`, `notifications`, `wa_requests`, `wa_contacts`, `wa_message_log`, `outbound_message_log` | Server, plus user for own messages |
| Agents (AI dispatch) | agent | `agent_accounts`, `agent_assignments`, `agent_payments`, `agent_scores` | Agent endpoint only, with guardrails (section 7) |
| Admin and audit | admin | `admin_audit_log`, `admin_login_attempts`, `platform_settings`, `disputes`, `complaints` | Admin role only |

Rule: a module may not write another module's tables. If it needs to, it calls that module's function. Enforce in code review and with a lint rule later.

## 5. Data

- **Spatial.** PostGIS is already in use (`multicategory_catalog`, `fix_match_listings_latlng`). Confirm a GIST index on each geography column that powers radius search. Use it for the match candidate query before any feature store.
- **Ledger rule.** Money movement is recorded as rows, never edited in place. Corrections are reversing rows. Balances are sums or a maintained view, reconciled against Flutterwave events.
- **Idempotency.** Every money write carries a unique reference (Flutterwave `reference`, our `idempotencyKey`). Webhooks store the event id and skip duplicates.
- **RLS.** Client-facing tables have RLS on. Money tables allow read for the owner and no client write at all.
- **Status values.** Keep status as `text` with a `CHECK` constraint (the current pattern), not a Postgres enum, so adding a status is one migration.

## 6. Job and Escrow Flow (state machine in Postgres)

One state machine is enforced by a server function that checks the current state and the allowed next states. Each step is a single transaction. Compensation runs as a new transition, not a rollback across services.

```
REQUESTED -> MATCHING -> DISPATCHED -> IN_PROGRESS -> COMPLETED -> SIGNED_OFF
    |            |            |              |             |
    +--------> CANCELLED <----+--------------+             +--> DISPUTED -> SIGNED_OFF | CANCELLED
```

Escrow steps, each in its own transaction, each with an idempotent reference:

1. **Lock.** Client pays into a virtual account. Webhook `charge.completed` creates an `escrow_transactions` row as `LOCKED` and advances the job to `DISPATCHED`.
2. **Work.** Job moves through `IN_PROGRESS` and `COMPLETED`.
3. **Release.** Client signs off (or auto-release after the dispute window). Server writes the payout queue row, then `transfer.completed` marks it `RELEASED`.
4. **Refund or dispute.** `DISPUTED` freezes the release. Admin resolves to release or refund, with an audit row.

If a payout fails, the queue row is retried with the same reference. Never create a new reference for the same payout (open decision in the project status doc).

## 7. Agent Guardrails

The agent may propose and request actions. It may not move money on its own above the limits below.

| Amount (NGN) | Rule |
|---|---|
| up to 100,000 | Agent may request. Server validates and executes. Logged with reasoning. |
| 100,000 to 500,000 | Client must confirm in-app before execution. |
| above 500,000 | Human admin approval (`hitl_approved`) required. |

Implementation: a plain validation function in `api/agent/[action].js` with unit tests. Agent calls go through the same server functions as the UI, so the same checks apply. Reject with a clear reason; never fall through.

## 8. Matching

Two stages, kept simple until volume justifies more:

1. **Retrieve.** PostGIS radius query + category + verification filter, plus Pinecone similarity for free-text needs. Return 100 to 500 candidates.
2. **Rank.** A scoring function in code (rating, response, distance, price fit, verification level). Return top 10.

Features come from Postgres columns and views. A feature store is out of scope until there is a measured need.

Find a Provider shows Level 2 and above by default. Level 1 (identity verified) providers appear only on the explicit "Identity verified" tab (ADR-009, Option C). Search runs server-side through `search_providers_rpc`.

## 9. Security

- Service-role key on the server only. Never in `src/`.
- Webhook signature check (`flutterwave-signature`, HMAC-SHA256). Return 500 if any required env var is missing (current behaviour, keep).
- Admin routes: role check, MFA gate, audit row per action.
- CSP, HSTS, `X-Frame-Options: DENY` in `vercel.json`.
- Fix the Redis rate limiter: it currently fails open when Upstash is not configured. In production it should fail closed for payment and auth endpoints.
- Hostel listing fee is currently unlocked by the browser (`ListHostelPage.jsx`). Move to the webhook (section 6).
- Rotate the Flutterwave sandbox client secret (it was shared during setup).

## 10. Environments and Deployment

| Environment | Source | Database | Flutterwave | Notes |
|---|---|---|---|---|
| Local | `vercel dev` | `supabase start` (real Supabase stack, migrations applied) | sandbox keys | Replaces the Docker Compose file |
| Preview | PR branches | Staging Supabase project | sandbox | Deployment protection on until testing is done |
| Production | `main` | Production Supabase | sandbox now, live later | Cron runs here only |

Live switch checklist: live keys from an activated business account, `FLUTTERWAVE_BASE_URL=https://f4bexperience.flutterwave.com`, live webhook secret, Paystack variables removed, deployment protection on.

## 11. Observability

- Sentry for errors and traces on API and webhook routes. Alert on webhook failures and payout queue age.
- PostHog for product events. Do not send money amounts or personal data to third parties beyond what is needed.
- A daily check: webhook events received vs `payment_virtual_accounts` paid vs `escrow_transactions` locked. Mismatches are reported.

## 12. What We Are Not Adopting (and when to reconsider)

| Proposal | Decision | Reconsider when |
|---|---|---|
| Kafka event backbone | Not now. Use DB writes and webhooks. | Several consumers need the same events, or event volume exceeds what cron and webhooks handle. |
| Separate services per domain | Not now. Modular monolith. | Team has more than one squad working on the same deploy queue, or a domain needs independent scaling. |
| DynamoDB jobs store | Not adopted. Jobs live in Postgres. | Never for money. Revisit only for high-volume non-financial events. |
| QLDB escrow ledger | Not adopted. Postgres ledger with append-only rows. | Verify AWS QLDB support status first; it has been announced as end-of-support. |
| Feast feature store | Not now. Postgres views and code scoring. | Measured ranking latency or feature reuse across several models. |
| Python services and MCP servers | Not adopted. Keep Node. Port guardrails into `api/agent`. | Only if a Python-only capability is needed. |
| GraphQL gateway | Not adopted. REST-style resources. | Several clients need flexible queries. |
| Docker Compose local stack | Replaced by `supabase start` + `vercel dev`. | Never. |

## 13. Roadmap (full stack)

| # | Work | Layer | Depends on |
|---|---|---|---|
| 1 | Sandbox webhook round trip: set `FLUTTERWAVE_SECRET_HASH` on Production, redeploy, test with a fresh account | API, webhook | Flutterwave support reply |
| 2 | Move hostel fee unlock to webhook; remove browser writes | API, DB, UI | 1 |
| 3 | Job state machine as a single server module with transition tests | API, DB | none |
| 4 | Escrow release and refund paths, with dispute freeze and audit rows | API, DB, admin UI | 1, 3 |
| 5 | Payment screens: hostel fee, property checkout, transaction history, payout status | UI | 1, 4 |
| 6 | Agent guardrails in `api/agent` with tests | API | 3 |
| 7 | Find a Provider filters, after the ADR-008 decision | UI, DB (PostGIS index check) | product decision |
| 8 | Fail-closed rate limit for payment and auth routes | API | none |
| 9 | Local dev via `supabase start`; retire Docker Compose | Tooling | none |
| 10 | Measure live page load; decide on code splitting | UI | none |
| 11 | Rewrite `docs/PROJECT_STATUS.md` from this document | Docs | none |
| 12 | Live switch (section 10 checklist) | All | 1 to 5 passing on sandbox |

## 14. Open Decisions

1. Find a Provider: follow ADR-008 (exclude level 1) or the spec (include level 1)?
2. Overpayment: refund, credit, or hold for the client?
3. Virtual account expiry: how long, and what happens to a late transfer?
4. Payout retry: confirm the reference stays the same across retries.
5. Hero headline: keep Fraunces (`feat/flutterwave-v4-sandbox`) or revert?
6. Auto-release window after `COMPLETED`: how many days before funds release without sign-off?

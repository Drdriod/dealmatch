# ADR-010: Design Patterns and Payment Boundaries

## Status

**Accepted for the code already in the repository (2026-10-14).** The remaining work is listed in `docs/architecture/design-patterns.md`. This ADR records decisions, not a plan to rewrite the app.

## Context

Payments, payouts and notifications had their logic spread across API handlers, browser pages and a single large webhook file. Three problems followed:

- Flutterwave paths and request shapes appeared in several files, so a provider change meant many edits.
- Payout status could be set to any value by any writer, including the browser.
- Notification copy was written inline in many places, so wording drifted and was hard to test.

The app runs as a modular monolith on Vercel with 10 serverless functions against a budget of 11, so new endpoints cannot simply be added.

## Decisions

1. **Adapter for Flutterwave (`src/lib/paymentGateway.js`).** Only this module knows Flutterwave's paths. It takes the HTTP client as a parameter, so tests use a fake. A fitness check (`scripts/check-architecture-fitness.mjs`, check 4) blocks raw Flutterwave paths elsewhere.
2. **Single state table for payouts (`src/lib/payoutStates.js`).** Allowed moves are listed once. `movePayout` writes conditionally (`WHERE status IN (from)`), so a stale decision cannot overwrite a row that has moved on. The same table is enforced by a database trigger in `20261014000000_payout_state_guard.sql`, which is written but not yet applied to production. A test reads the SQL and fails if it drifts from the JS table.
3. **Registry for payment purposes (`src/lib/paymentPurposes.js`).** Each purpose has one handler. Unknown purposes return 400. New channels register; the dispatcher does not change. Lookup uses own properties only, so names such as `constructor` cannot reach prototype code.
4. **Strategy for transfer outcomes (`TRANSFER_STRATEGIES` in the webhook).** Success, failure and reversal each have one handler. The switch dispatches by table.
5. **Factory for notifications (`src/lib/notificationFactory.js`).** One table of kinds holds the copy. `insertNotification` logs and returns `false` on failure instead of throwing, so a notification problem never fails a money write. Check 5 blocks inline inserts.
6. **Repositories for page data.** `src/data/*Repository.js` hold queries for a feature. Pages call functions and do not build queries. Wallet, Referral, Notifications and Monetisation are done. Check 6 is a ratchet: the count of direct database calls may fall but not rise (baseline 256 in 43 files).
7. **Money decisions stay in Postgres.** Guard triggers, a `payment_refunds` table with a dedupe key, and SECURITY DEFINER functions with a fixed `search_path` hold the rules. The server and webhook are the only writers of money status. The client does not write payment rows.
8. **Recorded facts over assumptions.** Performance decisions are made from measurements. Current figures (2026-10-14): AdminPage chunk about 156 KB (lazy, loaded only by admins), Supabase vendor chunk about 212 KB, PostHog about 211 KB (preload for analytics pages only, not on first paint), 49 lazy routes, 38 `select('*')` queries that should be narrowed.

## Consequences

- Adding a provider or channel is a change in one module, plus tests.
- Money writes are checked in two places: server code and database. A bug in one is caught by the other.
- The fitness script reports FAIL for three module-boundary violations that predate this work (`category_listings` in `api/platform.js` and `ProviderProfilePage.jsx`, and `categories` in `AdminPage.jsx`). They are listed in the baseline and should be fixed, not hidden.
- Repository extraction is incremental. Until AdminPage is split, the ratchet stops growth but does not reduce the count much.
- The payout trigger adds a production migration that needs owner approval.

## Alternatives considered

- **Event bus or microservices for payments.** Rejected for now. Webhooks and database writes are enough at current volume (ADR-related note in `docs/ARCHITECTURE.md` section 12).
- **A full ORM layer.** Rejected. Supabase's query builder already gives typed-enough access, and a repository per feature is smaller.
- **Database enum for statuses.** Rejected. `text` with a `CHECK` constraint lets a status be added in one migration.

## Revisit when

- AdminPage is split and the ratchet baseline falls below 200.
- Payout volume makes the daily cron window too short.
- A second payment provider is added. The adapter then needs an interface, not just one implementation.

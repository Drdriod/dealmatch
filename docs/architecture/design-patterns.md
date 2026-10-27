# Design patterns in DealMatch

This document records which design patterns the codebase uses, where, and what
is still to do. Update it when a pattern is applied or a new one is added.

## Applied

| Category | Pattern | Where | Purpose |
|---|---|---|---|
| Structural | Adapter | `src/lib/paymentGateway.js` | The only module that knows Flutterwave's paths and request shapes. Payment start, webhooks and payouts call named operations. Takes the client as a parameter, so tests can use a fake. |
| Behavioural | State | `src/lib/payoutStates.js` | Allowed payout status moves in one table. `movePayout` checks the table and makes a conditional write. |
| Behavioural | Strategy | `api/flutterwave-webhook.js` (`TRANSFER_STRATEGIES`) | One handler per transfer outcome: success, failure, reversal. |
| Creational | Registry | `src/lib/paymentPurposes.js` | Each payment purpose has one handler. `registerPaymentPurpose` adds a channel without touching the dispatcher. |
| Creational | Factory | `src/lib/notificationFactory.js` | Builds every server-side notification from one table of kinds. Copy is pinned by tests. |
| Creational | Registry (charge purposes) | `src/lib/chargePurposes.js` | Each confirmed-charge purpose has one handler. Used by the webhook. |
| Structural | Repository | `src/data/monetisationRepository.js` | The Monetisation tab's database access. The page never builds a query. |
| Structural | Repository (server) | `src/data/`: `webhookRepository`, `escrowRepository`, `accountRepository`, `identityDocsRepository`, `paymentVirtualAccountRepository`, `payoutQueueRepository`, `maintenanceRepository`, `listingRepository`, `adminApiRepository`, `agentVerificationRepository`, `outboundMessageRepository`, `inviteRepository`, `propertyRepository` | Database access for the API routes and cron jobs. Functions take the client as an argument, so tests pass a fake. Failed writes are returned to the caller, which fails the request. |
| Structural | Repository (client) | `src/data/`: `dashboardRepository`, `landlordRepository`, `lenderRepository`, `agentDashboardRepository`, `rentalsRepository`, `hotelsRepository`, `matchesRepository`, `walletRepository`, `referralRepository`, `notificationsRepository`, `messagesRepository`, `profileRepository` and the other `*Repository.js` files that import `supabase` | Database access for pages and components. A page asks for what it shows and never builds a query. Results keep the Supabase `{ data, error }` shape. |
| Behavioural | Loader (data hooks) | `src/lib/loader.js`, `src/hooks/useLoader.js`, `useUserDashboard`, `useLandlordDashboard`, `useLenderDashboard`, `useAgentDashboard` | Loading, error and data state for a dashboard, outside the layout code. The newest request wins, a failed reload keeps the data on screen, and a failed query is reported instead of shown as 0. `LoadNotice` shows it. `loader.js` has no React in it, so the rules are tested in `loader.test.mjs`. |
| Structural | Column allow-list | `src/lib/propertyColumns.js` | The `properties` columns any visitor may read. A test requires every baseline column to be classed public or private. |
| Structural | Facade (existing) | `src/lib/platformFees.js`, `src/lib/notifications.js` | Hide fee lookup and notification delivery behind small functions. |

Tests for these live next to the code (`src/lib/*.test.mjs`) and share the
in-memory Supabase fake in `src/lib/testing/fakeSupabase.mjs`.

Run them with: `npm test` (it passes `--experimental-test-module-mocks`, which the webhook
handler test needs). `npm run check` runs the fitness checks and then the tests.

## Still to do

Counts are from a scan on 2026-10-14, updated as items are completed. They are a starting point, not a target.

1. **Admin console. Done.** `src/pages/Admin/AdminPage.jsx` is 144 lines. Each of the 22
   tabs in `src/pages/Admin/tabs/` is its own file, and none makes a direct table or RPC
   call; they read through the `admin*Repository` files in `src/data/`.
2. **Other pages and components. Done for `src/pages` and `src/components`.** Check 6
   counts direct `supabase`/`svc` table and RPC calls in `src/pages`, `src/components` and
   `api/`: it is 0 and the baseline is empty, so a new one fails the check. What is
   still direct, counted on 2026-10-19 with the same pattern: 52 in `src/lib` (the
   `supabase.js` helpers, `chargePurposes.js`, `homeFeed.js`, `categoryFeed.js` and
   similar), 27 in `src/modules` (forum 12, catalog 6, listings 6, matching 2, search 1;
   the WhatsApp module uses its own client, so it is not in this count), 2 in `src/hooks`
   and 1 in `src/context`. These are feature services and helpers rather than pages.
   Whether they should move behind repositories too is a decision for the owner, not a gap in the pattern.
3. **Webhook `charge.success` case. Done.** The six purpose handlers moved to
   `src/lib/chargePurposes.js` (registry, own-property lookup), with tests in
   `src/lib/chargePurposes.test.mjs` and a handler-level test in
   `src/lib/flutterwaveWebhook.test.mjs`. Decided 2026-10-20: a transaction escrow charge
   that cannot fund a job is no longer logged as a success. If there is no job with that
   reference, the job is OPEN or CANCELLED, or the amount is wrong, the payments row says
   `unapplied` (admin revenue counts `success` only; the payments column has no CHECK, so no
   migration), the money goes on the refund list under `unapplied:<reference>` (reason
   `overpaid`, with a note saying why), and the payer is told when our own job row names them.
   A job that is already FUNDED, COMPLETED or DISPUTED is a repeat delivery and changes
   nothing. A failed read of the job, or a failed write of the refund row, throws so the
   webhook answers 500. Admin screens: the Flutterwave list now reads columns that exist
   (it selected `payment_type`, which the table does not have, so a failed read looked like
   an empty list), shows `unapplied` rows in their own colour outside the total, and the
   refund list says "Not applied" with the note.
4. **API database calls. Done.** Every table and RPC call in `api/` goes through a
   repository in `src/data/`. The ratchet has no `api/` entries, and a new direct call in
   `api/` fails the check. The one call outside the repositories is `platform.js`
   removing identity-document files from Supabase Storage (storage, not a table).
   Changed on the way:
   - The agent submit counts an attempt only from the value it read, and consumes a
     session only while it is active. Two submits racing on one session: before, both
     were accepted; now one is accepted and the other gets 409 or 410 (checked with a
     concurrent harness against a stub Supabase).
   - The escrow webhook returns 500 when a write fails, so the sender retries. Release and
     refund apply only to a funded escrow; anything else is logged and not applied. If a
     `funded` event was ever missed, that escrow cannot be released until it is corrected.
   - Admin user search strips the characters PostgREST uses for filters, so search text
     cannot add filter clauses.
5. **Client notifications. Done.** The only client-side insert is in the `notifications.js`
   facade, which is the allowed site (check 5 enforces it). Realtime reads still use the client.
6. **Dashboards. Done.** The user, landlord, lender and agent dashboards read through
   repositories and through one data hook each (`src/hooks/use*Dashboard.js`). The hook
   owns loading and error state. The page lays out what it gets, and shows `LoadNotice`
   when the main read failed (an error with Try again) or a side figure failed (named,
   so a failed count is not read as a real 0). Before, every page copied `data` into
   state and dropped `error`. The landlord dashboard also stopped asking for the owner's
   property ids twice. Verified in a browser with injected failures (17 checks:
   normal load, main read failing, side read failing, retry, role redirects, request
   count). Plain hooks, no query library: a cache would only matter if two components
   shared the same data, and none do. TanStack Query (MIT licence) is the option if that changes.
7. **Database enforcement of payout states. Done.** Migration
   `20261014000000_payout_state_guard.sql` enforces `PAYOUT_TRANSITIONS` in the database.
   Applied by the owner and confirmed on production on 2026-10-20 (runbook row 17). The
   admin Payouts tab can now only make the one move an admin may make, failed to pending,
   and its Retry write is conditional on the row still being failed.
8. **Browsers read named `properties` columns only. Code done; the database change
   (migration 18) is written and waits for the PR #18 deploy.** The "Active properties
   are public" policy chooses rows, not columns, so a direct API call could read
   `contact_phone`, `contact_email`, `payment_ref`, the verification record and the agent
   assignment of every active listing. Migration `20261020000000_properties_column_exposure.sql`
   removes table-level SELECT from `anon` and `authenticated` and grants the 36 public
   columns only. It was dry-run on production on 2026-10-21 (35 of 35 behaviour checks,
   rolled back); apply it as runbook section 7 says. What this means in code:
   - Name the columns (`src/lib/propertyColumns.js`). `select('*')`, an empty `select()`
     and a head-count `*` are refused. Counts use `select('id', { count: 'exact', head: true })`.
   - A filter needs the same privilege as a read, so nothing in the browser filters on a
     private column. The agent dashboard asks `my_assigned_property_ids()` instead.
   - A new column is not readable until a migration grants it. `propertyColumns.test.mjs`
     fails if the code and the migration disagree. Fitness check 7 refuses `*`, and check 9
     refuses any select, embed or filter that names a private column.
   - Writes are unchanged. The guard trigger still decides who may write a private column.
   - Contact still goes through `get_property_contact` (owner, staff, funded escrow or a
     credit unlock), and the interest modal and Matches page use only the DealMatch
     WhatsApp number (`src/lib/contact.js`).
   Audit of stored data before the change: 0 listings, so nothing had leaked yet.
9. **Known architecture violations: none.** The three older module-boundary violations
   (`category_listings` in `api/platform.js` and `ProviderProfilePage.jsx`, `categories` in
   `AdminPage.jsx`) are cleared. All nine fitness checks pass and the direct-database-call
   baseline is empty (`scripts/architecture-baseline.json` is `{}`), so any new direct call fails
   `npm run check`.

10. **Virtual-account payments are retry-safe. Done and deployed (PR #22, migration `20261024020000` applied 2026-10-25); still needs the GitHub secrets and a sandbox test.** "Paid" and "fulfilled" are separate facts on `payment_virtual_accounts`
    (`fulfilled_at`). A paid account that is not fulfilled is an unfinished delivery: the webhook
    retry, the payer's "I have paid" check (`verify-payment`) and the background job
    (`cron-reconcile-virtual-accounts`) all finish it through one path,
    `src/lib/chargePipeline.js`, one runner at a time (a 5 minute lease). Each gateway charge is
    counted once (`counted_charge_ids`), and money that arrives after an account expired is granted
    or put on the refund list instead of being dropped. Handlers are safe to repeat because every
    money write is conditional on the current status. Referral payout has no unique key, so it
    runs only for the first run that records the payment; a database constraint is still open.
    The 10 minute rhythm needs the `CRON_SECRET` and `SITE_URL` GitHub secrets (see
    `.github/workflows/reconcile-payments.yml`). The payer's "I have already paid" button on the
    bank-transfer screen calls `verify-payment` (`src/lib/transferCheck.js` turns the answer into
    what the screen shows). Money that was taken but not applied is handled the same way for every
    purpose (`returnUnapplied` in `src/lib/chargePurposes.js`): refund list, `unapplied` in the
    payments log, no referral.
11. **CI runs the tests, the fitness checks and the build on every pull request. Done** (`.github/workflows/check.yml`, job `check`, PR #20). The branch ruleset that requires `check` is an owner step in GitHub settings.

## Rules for new code

- Name the columns in every new read (`select('id, title')`), never `select('*')`. Fitness check 10 is a ratchet: each file's count of wildcard reads may go down, never up (`scripts/select-star-baseline.json`, 35 today in 21 files, mostly repositories for the owner's own rows). Lower the baseline with `node scripts/check-architecture-fitness.mjs --update-baseline`.
- Talk to a service (Flutterwave, WhatsApp, Pinecone, email) only through an adapter.
- Put database queries for a feature in its repository, not in the page or the API route.
- Use a registry or table when a `switch` on a type or status would grow.
- Use a state table when a status can only move in certain ways.
- Build notifications through the factory. Never write the copy inline.
- Read `properties` with named columns (`PROPERTY_PUBLIC_COLUMNS`), never `select('*')`, unless the code serves the owner, an assigned agent or staff and is on the allow-list in check 7.
- Give a dashboard a data hook built on `useLoader`. Report a failed read with `LoadNotice`; do not turn it into an empty list or a 0.

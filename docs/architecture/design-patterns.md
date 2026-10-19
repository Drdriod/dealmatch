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

Run them with: `node --test src/lib/*.test.mjs`

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
   `src/lib/chargePurposes.js` (registry, own-property lookup), with 19 tests in
   `src/lib/chargePurposes.test.mjs`. Known behaviour kept on purpose: a transaction
   escrow that does not match (no row, not PENDING, amount mismatch) still writes the
   payments row, as before. Review whether that row should say `success` for a job that
   was not funded.
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
7. **Database enforcement of payout states.** The admin Payouts tab writes status
   straight from the browser. Migration `20261014000000_payout_state_guard.sql` enforces
   `PAYOUT_TRANSITIONS` in the database. It is written and dry-run, and awaits owner
   approval (runbook row 17). Until it is applied, the browser path is open.
8. **Wildcard property reads. Done in the client; the database change is open.**
   The "Active properties are public" policy exposes every column of an active listing,
   so `select('*')` returned `contact_phone`, `contact_email`, `payment_ref` and the
   verification notes to anonymous visitors. Public reads now name their columns
   (`propertyColumns.js`), the interest modal and Matches page use only the DealMatch
   WhatsApp number (`src/lib/contact.js`), and fitness checks 7 and 8 stop it coming
   back. Still open, owner decision: the policy itself still allows a direct API call
   with `select=*` to read those columns. Closing that needs a column-level grant or a
   public view, and only after confirming nothing else reads the table with `*`. Audit
   what is stored first:
   `select count(*) filter (where contact_phone is not null), count(*) filter (where contact_email is not null) from properties where status = 'active';`
9. **Known architecture violations.** Three module-boundary violations remain from
   before this work (`category_listings` in `api/platform.js` and
   `ProviderProfilePage.jsx`, and `categories` in `AdminPage.jsx`). They are not
   introduced by these patterns.

## Rules for new code

- Talk to a service (Flutterwave, WhatsApp, Pinecone, email) only through an adapter.
- Put database queries for a feature in its repository, not in the page or the API route.
- Use a registry or table when a `switch` on a type or status would grow.
- Use a state table when a status can only move in certain ways.
- Build notifications through the factory. Never write the copy inline.
- Read `properties` with named columns (`PROPERTY_PUBLIC_COLUMNS`), never `select('*')`, unless the code serves the owner, an assigned agent or staff and is on the allow-list in check 7.
- Give a dashboard a data hook built on `useLoader`. Report a failed read with `LoadNotice`; do not turn it into an empty list or a 0.

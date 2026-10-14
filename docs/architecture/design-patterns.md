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
| Structural | Facade (existing) | `src/lib/platformFees.js`, `src/lib/notifications.js` | Hide fee lookup and notification delivery behind small functions. |

Tests for these live next to the code (`src/lib/*.test.mjs`) and share the
in-memory Supabase fake in `src/lib/testing/fakeSupabase.mjs`.

Run them with: `node --test src/lib/*.test.mjs`

## Still to do

Counts are from a scan on 2026-10-14, updated as items are completed. They are a starting point, not a target.

1. **Admin console (largest).** `src/pages/Admin/AdminPage.jsx` is about 3,400 lines
   with roughly 70 direct database calls outside the Monetisation tab. Split it into
   one module per tab, each with its own repository under `src/data/`.
2. **Other pages and components. In progress.** Repositories now exist for Wallet,
   Referral, Notifications, Messages, the user Dashboard and the Landlord Dashboard.
   Still direct: Jobs/JobPosting (11 calls), StudentVerify, ProviderProfile, FindProvider,
   Auth, Rentals, Verification, Profile, ManageListings, Home and several smaller files.
   Direct calls across `src` are down from 256 to 225 (ratchet baseline).
3. **Webhook `charge.success` case. Done.** The six purpose handlers moved to
   `src/lib/chargePurposes.js` (registry, own-property lookup), with 19 tests in
   `src/lib/chargePurposes.test.mjs`. Known behaviour kept on purpose: a transaction
   escrow that does not match (no row, not PENDING, amount mismatch) still writes the
   payments row, as before. Review whether that row should say `success` for a job that
   was not funded.
4. **API database calls.** About 77 direct calls in `api/`. Move the payment-related
   ones behind the same repositories.
5. **Client notifications. Done.** The only client-side insert is in the `notifications.js`
   facade, which is the allowed site (check 5 enforces it). Realtime reads still use the client.
6. **Dashboards. In progress.** User and Landlord dashboards read through repositories.
   Still to do: a data hook per dashboard (loading and error state out of the layout code),
   and the Lender and Agent dashboards (the Agent dashboard has about 10 direct calls).
7. **Database enforcement of payout states.** The admin Payouts tab writes status
   straight from the browser. Migration `20261014000000_payout_state_guard.sql` enforces
   `PAYOUT_TRANSITIONS` in the database. It is written and dry-run, and awaits owner
   approval (runbook row 17). Until it is applied, the browser path is open.
8. **Known architecture violations.** Three module-boundary violations remain from
   before this work (`category_listings` in `api/platform.js` and
   `ProviderProfilePage.jsx`, and `categories` in `AdminPage.jsx`). They are not
   introduced by these patterns.

## Rules for new code

- Talk to a service (Flutterwave, WhatsApp, Pinecone, email) only through an adapter.
- Put database queries for a feature in its repository, not in the page.
- Use a registry or table when a `switch` on a type or status would grow.
- Use a state table when a status can only move in certain ways.
- Build notifications through the factory. Never write the copy inline.

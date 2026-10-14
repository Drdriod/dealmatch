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
| Structural | Repository | `src/data/monetisationRepository.js` | The Monetisation tab's database access. The page never builds a query. |
| Structural | Facade (existing) | `src/lib/platformFees.js`, `src/lib/notifications.js` | Hide fee lookup and notification delivery behind small functions. |

Tests for these live next to the code (`src/lib/*.test.mjs`) and share the
in-memory Supabase fake in `src/lib/testing/fakeSupabase.mjs`.

Run them with: `node --test src/lib/*.test.mjs`

## Still to do

Counts are from a scan on 2026-10-14. They are a starting point, not a target.

1. **Admin console (largest).** `src/pages/Admin/AdminPage.jsx` is about 3,400 lines
   with roughly 70 direct database calls outside the Monetisation tab. Split it into
   one module per tab, each with its own repository under `src/data/`.
2. **Other pages and components.** About 190 direct `supabase.from` / `supabase.rpc`
   calls across 40 files in `src/pages` and `src/components`. Move each feature's
   calls into `src/data/<feature>Repository.js`, starting with Wallet, Dashboard,
   Messages and Referral.
3. **Webhook `charge.success` case.** About 345 lines inline in `api/flutterwave-webhook.js`.
   Split it into one handler per purpose, reusing the purpose names from
   `paymentPurposes.js`, and dispatch through a table as the transfer cases do.
4. **API database calls.** About 77 direct calls in `api/`. Move the payment-related
   ones behind the same repositories.
5. **Client notifications.** Five direct `notifications` inserts in `src`. Route them
   through one client-side notification helper.
6. **Dashboards.** Four dashboards (user, agent, landlord, lender) each load data
   inline. A shared data hook per dashboard would keep the layout code separate
   from loading and error handling.
7. **Database enforcement of payout states.** The admin Payouts tab writes status
   straight from the browser. A database trigger that enforces `PAYOUT_TRANSITIONS`
   would close that path. This needs a migration and owner approval.
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

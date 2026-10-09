# Pages audit: wiring, logic, UX and database connection (October 2026)

Scope: every routed page in `src/App.jsx`, the data calls each page makes, and whether
those calls succeed against the database schema and RLS as it stands after
`20261009000000_security_audit_hardening.sql`. Companion to
`docs/security/2026-10-database-audit.md`, which holds the security findings.

Method: read-only review of the route table, each page's Supabase calls, and the
API handlers they depend on, cross-checked against the scratch database (`dm_audit`,
built from the migration chain). The security regression suite
(`supabase/tests/security_hardening.sql`) passes 45/45 after the fixes below.
Pages were not exercised in a browser, so UX findings are from code and markup,
not from a visual walkthrough.

Status key: **Fixed** (in this change), **Open** (confirmed, not yet changed),
**Decision** (needs a product call before changing).

---

## 1. Fixed in this change

| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| P1 | High | `FindProviderPage.jsx:68`, `ProviderProfilePage.jsx:45,81`, `RentalsPage.jsx:301`, `src/lib/homeFeed.js`, `src/lib/supabase.js` (seller lookup) | Visitor-facing pages read other users' rows from `profiles`. Profiles RLS only allows self or staff, so provider cards, provider profiles, reviewer names and the rental "host verified" badge were empty for anyone else. | New `public_profiles` view (safe display columns only, owner-run, excludes deactivated accounts), granted to `anon` and `authenticated`. Pages now read the view. |
| P2 | High | `src/lib/supabase.js` `getProperty` | The property page used `profiles(full_name, avatar_url)` as an embed. The embed returned null for visitors, so the seller card never rendered. The gallery was also empty because `getProperty` did not join `property_images`, while `PropertyPage.jsx:151` renders `property.images`. | `getProperty` joins `images:property_images(...)` and resolves the seller name through `public_profiles`. |
| P3 | High | `properties.status` CHECK; `AdminPage.jsx` (pause, reject, restore) | The admin console writes `paused`, `rejected`, `pending_review`, `rented` and `inactive`. The CHECK allowed only `active, pending, sold, removed`, so those admin actions failed. | CHECK widened to the full vocabulary used by the UI. Owner guard unchanged (owners still only pause/remove, and re-list after approval). |
| P4 | High | `AdminPage.jsx:1476` (mortgage status) | Every mortgage status update writes `updated_at`, which the table did not have. Every update failed. | `mortgage_applications.updated_at` added (`timestamptz`, default `now()`). |
| P5 | Critical | `api/paystack-webhook.js` (`contact_unlock_credits`) | The webhook trusted `metadata.user_id` and `metadata.credits` from the payment payload. A forged or replayed event could grant unlock credits to any account. | Credits derived server-side from the paid amount (`1 → 500`, `5 → 2000` naira in kobo). Buyer must match the Paystack customer email. Idempotent on `payment_ref`. Not yet committed at time of writing. |
| P6 | High | `process_referral_payouts_for_transaction` | Agents could trigger referral payouts through the RPC because the guard allowed `is_admin_staff()`. | Guard now `admin`, `superadmin` or `is_superadmin()` only. |
| P7 | High | Storage policy `Staff delete identity docs` | Agents could delete identity documents from the `identity-docs` bucket. | Delete limited to `admin`, `verifier` and `superadmin`. |

## 2. Open: confirmed, not yet changed

| # | Severity | Where | Finding | Suggested fix |
|---|---|---|---|---|
| O1 | High | `payments` table; payment flows | Code writes `payments.payment_type`, which the table does not have. Those inserts fail. | Add the column (with a CHECK matching the flows), then re-run the payment paths. |
| O2 | High | `AdminPage.jsx` (student hostels, mortgage, student IDs) | Admin screens embed `profiles` through foreign keys to `auth.users`. PostgREST cannot embed `profiles` through those, so the joined fields come back empty or the query errors. | Select from `profiles` in a second query keyed on the user id, or add an FK to `profiles`. |
| O3 | High | `EscrowPage.jsx` (pay flow) | The pay flow does not create the escrow row, so payments do not link to an escrow. The "ActiveEscrowSection" is not rendered. | Create the escrow row in the pay step, or in the webhook on `charge.success`. |
| O4 | High | `WalletPage` | Uses column names that do not exist (`balance`, `amount`, `transactions(description)`). | Align to `available_wallet_balance()` and the real ledger columns. |
| O5 | High | `ListHostelPage` | Sends `listing_paid` from the client and lets the owner activate their own hostel. Revenue gate can be bypassed. | Activation through the payment webhook or an admin action only. Owner may set `paused` only. |
| O6 | High | `/messages` (messaging module) | Cannot create threads. Realtime subscribes to a table that is not in the `supabase_realtime` publication. | Add the table to the publication and fix thread creation (see D5). |
| O7 | Medium | `App.jsx` `/verify` route | Legacy identity route is `ProtectedRoute` only, so it bypasses `MfaGate`. | Route through the same gate as other staff routes, or remove it. |
| O8 | Medium | `AdminPage.jsx` navigation | Admin nav items are not filtered by role, so agents see links that then fail or show empty states. | Filter nav by role (superadmin, admin, verifier, agent). |
| O9 | Medium | Admin nav: "Agent scores", "Complaints" | Nav entries point to routes that do not exist. | Remove the entries or add the pages. |
| O10 | Medium | `App.jsx` | `/agent` and `/lender` have no links from the nav. `/tenancy` and `/mortgage` have no links either. | Link from the relevant dashboards or remove. See D4. |
| O11 | Low | Footer | `/delete-account` is not linked from the footer, which the account-deletion policy expects. | Add the footer link. |
| O12 | Low | `ProviderProfilePage.jsx` | Reads `profile.last_active_at` and `profile.avg_reply_minutes`, which are not columns. Those values always render empty. | Remove the fields or add the columns. |
| O13 | Low | Hotels UI | Shows a 12% fee label while the Terms say 8%. See D1. | Follow D1. |
| O14 | Medium | Schema replay (fresh builds) | `transactions.listing_id` is `BIGINT` (`20260731000014`), but `category_listings.id` is `UUID`. This breaks `admin_deal_pipeline` (`20260812000000`). Four migrations also fail on a clean replay: `20260711000000` (stub collisions), `20260731000017` (`reviews`/`provider_stats` ordering), `20260812000000` (uuid = bigint) and `20260813000000` (`my_requests`). | Make `transactions.listing_id` UUID in a new migration, fix the ordering in `20260731000017`, and make view creation idempotent. Verify on a fresh replay, not on the shared dev database. |
| O15 | Medium | Escrow page copy | "DealMatch Protection" section (approved copy in chat) is not implemented. | Implement after the copy is confirmed. |

## 3. Decisions needed (not changed)

| # | Question | Why it matters |
|---|---|---|
| D1 | Platform fee: which rate is correct? The UI and Terms say 8%, the code uses 12%, and the webhook uses 1.5% for sales and 3% for rentals. | Money is calculated from this. Affects revenue split, receipts and the Terms. |
| D2 | Can agents approve identities and dismiss complaints? | Today the database allows it. Changing it changes agent workflows. |
| D3 | Can agents read identity documents (finding F4)? | Recommendation is admins and verifiers only. Field agents may need it. |
| D4 | Keep the `/tenancy` and `/mortgage` routes, or remove them? | Both are unlinked and partly broken (O1, O4 area). |
| D5 | Messaging design: one thread per pair of users, per listing, or per escrow? | Determines the thread schema and RLS. |
| D6 | Enforce MFA (`aal2`) in database helpers, or keep it as a UI gate only? | Currently the UI gate is the only control. |

## 4. Coverage notes

- Routes checked: every route in the `App.jsx` `<Route>` set and the array-defined set (about lines 640–730), including `AdminRoute`, `ProtectedRoute`, `MfaGate` and `PublicOnlyRoute` wrappers.
- Each page's Supabase reads and writes were compared to the live scratch schema. Column and table names not present in the schema are listed above.
- Not verified in a browser: visual layout, mobile widths, empty states under real data, and the Paystack round trip (needs live keys).

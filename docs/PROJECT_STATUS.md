# DealMatch: project status, context and goals

Last updated: 10 October 2026. Branch: `feat/flutterwave-gateway` (head `875405b`).

This is the working record for the current phase. It says what we've done,
what we deliberately left alone, what is still open, and what we're aiming
for. Keep it current when the state changes. Secrets never go in this file.

---

## 1. Context

DealMatch is a marketplace for Nigerian property, rentals, student hostels,
services and professionals. Buyers and renters pay for protection: money
sits in escrow until the deal is confirmed. Verified people and places get
a badge.

Stack:
- Frontend: React and Vite, Tailwind, framer-motion, deployed on Vercel.
- Backend: Supabase (Postgres with row-level security, auth, storage).
- Serverless: Vercel functions in `api/`. `api/platform.js` dispatches many
  resources through `?resource=` to stay inside the function-count limit.
- Payments: Flutterwave V4. Paystack has been removed.

Why this phase exists: the database had security gaps, several pages were
broken for visitors, and payments were moving from Paystack to Flutterwave.

---

## 2. Done

### Security (PR #12, branch `security/db-hardening`)
- Admin checks are role-based. A superadmin role and an `is_superadmin()`
  helper were added. Founder migration handled.
- Column guard triggers on sensitive profile columns (SECURITY INVOKER, so
  they fire under the calling role).
- Table privileges cleaned up. The public views run as owner.
- `supabase/tests/security_hardening.sql`: 45 checks, all passing on the
  scratch database `dm_audit`. Run it on local or staging only (it ends in
  ROLLBACK).
- Full findings: `docs/security/2026-10-database-audit.md`.

### Page audit fixes (commit `4efdffe`)
- P1: visitor-facing pages read from the `public_profiles` view, so
  provider cards, profiles and reviewer names render for anyone.
- P2: property page joins the image gallery and the seller name.
- P3: property status vocabulary widened so admin actions save.
- P4: `mortgage_applications.updated_at` added.
- P5: unlock credits derived server-side from the paid amount, and the
  buyer must match the payer's email. Idempotent on payment reference.
- P6: referral payout RPC limited to admin and superadmin.
- P7: identity-document deletion limited to admin, verifier and superadmin.
- Full list: `docs/audit/PAGES_AUDIT_2026-10.md`.

### Flutterwave V4 (commits `e04c5ce`, `52baccd`)
- Collections: each payment gets a dynamic virtual account (bank transfer).
  The payer sees the account number, bank, amount and expiry, and the screen
  polls `/api/payments/status`. The webhook marks payments paid.
- Payouts: V4 recipient per payout account (stored on
  `payout_accounts.gateway_recipient_code`), then an instant transfer. The
  cron pays queued rows in batches of 20.
- Bank list and account-name check use V4 endpoints.
- New migration `20261009030000_flutterwave_virtual_accounts.sql`
  (`payment_virtual_accounts`, RLS: payers read their own rows only).
- Webhook: verifies `flutterwave-signature` (HMAC-SHA256 of the raw body),
  re-reads each event from the V4 API, matches a credit by virtual account
  number, and flags underpayments.
- Removed: `api/payments/verify.js`, the V3 popup, the V3 CSP entries, and the
  env vars `FLUTTERWAVE_SECRET_KEY` and `VITE_FLUTTERWAVE_PUBLIC_KEY`.

### Hero motion and display type (commit `875405b`)
- `src/components/home/HeroHeadline.jsx`: four motion layers (trigger,
  rules, feedback, loops and modes), reduced-motion safe.
- Headline font changed to Fraunces (`font-headline`).

---

## 3. Deliberately not touched

These stay as they are until we decide otherwise.

- **Escrow logic.** The payment and escrow rules are unchanged, per the
  instruction to keep the payment logic the same. `api/escrow-webhook.js`
  still funds escrow on `charge.success` with `metadata.type = escrow_payment`.
- **Fee rates (D1).** The UI and Terms say 8%, the code uses 12%, and the
  webhook uses 1.5% for sales and 3% for rentals. Not changed until decided.
- **Visual redesign beyond the hero.** Navbar, footer, mobile tab bar, auth
  page and the other pages are unchanged. Scope is still an open question
  (see section 5).
- **Paystack history.** The `paystack` value stays in the `payout_gateway`
  enum for old records. It's not used by new code.
- **Other gateway-dependent flows.** Wallet, hostel listing fee and
  professional subscriptions use the new collection path. Their own pages
  were not re-audited.

---

## 4. Still to work on

### Before the sandbox test
- Set Vercel env vars for the Preview environment: `FLUTTERWAVE_V4_CLIENT_ID`,
  `FLUTTERWAVE_V4_CLIENT_SECRET`, `FLUTTERWAVE_BASE_URL` (sandbox URL),
  `FLUTTERWAVE_SECRET_HASH`, plus the rest listed in `missing_env_vars.md`.
- Point the sandbox webhook at the Preview deployment of the branch.
- Apply migration `20261009030000` to the staging Supabase project.

### Confirm in sandbox
- Charge status value: `succeeded` or `successful`.
- Event names: `charge.completed` and `transfer.disburse` (or the actual name).
- Whether the recipient call needs a `name` field.
- Virtual account amount units (naira is assumed).

### Known risks (must fix or accept before live)
- **Payout retry reuses the reference.** A failed transfer is retried with the
  same reference, which Flutterwave may reject as a duplicate, and the
  idempotency key may replay the old result. Needs a per-attempt design that
  stays safe if the process crashes mid-send.
- **Overpayment handling.** Confirm how the webhook treats a credit larger than
  the expected amount.
- **Virtual account expiry.** Set to 24 hours. Product decision still open.
- **No automated tests yet for the webhook or the payment routes.** Add stub
  tests: raw-body signature, match by account number, underpayment, duplicate
  delivery, transfer success and failure.
- **Payment status unit test.** Confirm the modal stops polling after paid
  and after expiry.

### Open audit items (from `docs/audit/PAGES_AUDIT_2026-10.md`)
- O1 `payments.payment_type` column missing (payment inserts fail).
- O2 admin screens embed `profiles` through the wrong foreign keys.
- O3 escrow row not created in the pay step.
- O4 wallet page uses column names that don't exist.
- O5 hostel owners can activate their own listings (revenue gate bypass).
- O6 messaging cannot create threads, and realtime table not in publication.
- O7 `/verify` route bypasses the MFA gate.
- O8 admin nav not filtered by role.
- O9 nav links to routes that don't exist.
- O10 `/agent`, `/lender`, `/tenancy`, `/mortgage` have no links.
- O11 `/delete-account` not linked from footer.
- O12 provider profile reads columns that don't exist.
- O13 hotels UI shows 12% (tied to D1).
- O14 schema replay breaks on a clean build (listing_id type, ordering).
- O15 "DealMatch Protection" escrow copy not implemented.

### Decisions needed (from the audit)
- D1 platform fee rate.
- D2 can agents approve identities and dismiss complaints.
- D3 can agents read identity documents.
- D4 keep `/tenancy` and `/mortgage` or remove them.
- D5 messaging thread model (per pair, per listing, or per escrow).
- D6 enforce MFA (`aal2`) in database helpers or keep it a UI gate.

### Owner actions outstanding
- Regenerate any secret that appeared in dashboard screenshots.
- Confirm the Flutterwave webhook secret hash and client credentials are set
  in Vercel, not in code.

---

## 5. Goals

### Near term
1. Pass the sandbox checks in section 4.
2. Fix or formally accept the known payout and overpayment risks.
3. Merge `feat/flutterwave-gateway` into `main` through a reviewed pull
   request. Keep `main`'s current production deployment until then.
4. Go live with small first payouts and watch the webhook logs.

### UX redesign (scope to confirm)
The brief has five areas. Each needs a decision on scope before work starts.
1. **Data and input.** Shorter forms, numeric keyboards and autofill for
   phone and OTP, inline validation, invite code visible but optional.
2. **Content structure.** One primary action per screen, value statement
   short, form reachable without scrolling past a long hero on phones.
3. **Navigation.** Fewer top-level items, role-aware menu, a mobile tab bar
   of four or five items.
4. **Incentivization.** Benefits stated next to the action that needs them
   (protected payment, verified badge, invite rewards).
5. **Hierarchy.** Clear type scale, contrast that passes WCAG AA, one visual
   path per screen.

Recommended first pass: the shared shell (Navbar, MobileTabBar, Footer,
tokens) plus the auth page, then the rest of the site.

### Motion system
Four layers, documented in `HeroHeadline.jsx`: trigger, rules, feedback,
loops and modes. Applied to the hero only. Next: apply the same rules to
cards, buttons and the search results.

---

## 6. Working notes

- Branch for current work: `feat/flutterwave-gateway`. Security PR #12 is on
  `security/db-hardening`.
- Never force-push. If the stop hook reports unpushed commits, refresh the
  tracking ref with
  `git fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>`, then
  recheck.
- `gh pr create` returns a GraphQL 403 in this environment. Use
  `gh api -X POST repos/Drdriod/dealmatch/pulls` with the body from a file.
- Scratch database: `dm_audit` (PostgreSQL 16). Start with
  `pg_ctlcluster 16 main start`.
- Commit messages end with the Co-Authored-By and Claude-Session lines.

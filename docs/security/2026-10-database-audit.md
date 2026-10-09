# DealMatch Database Security Audit — October 2026

**Scope:** Supabase Postgres schema (all 53+ migrations, RLS policies, SECURITY DEFINER functions, triggers, storage buckets, realtime publication, table and function privileges), plus the Vercel API handlers that front the database.
**Method:** Full migration replay into a scratch PostgreSQL 16 cluster with Supabase-compatible stub schemas (`auth`, `storage`, `realtime`, `net`) and roles (`anon`, `authenticated`, `service_role`). Every RLS policy, function body and privilege was exported and reviewed. The fixes were then verified by running role-impersonated attack scripts (`SET ROLE authenticated/anon` with forged JWT claims) against the migrated database.
**Supersedes:** `security_audit_report.md` (April 2026), which predates the current schema and contains claims that no longer hold.

Fix migration: `supabase/migrations/20261009000000_security_audit_hardening.sql`

---

## 1. Findings and status

### Critical (all fixed by the migration)

| ID | Finding | Impact | Fix |
|---|---|---|---|
| C1 | `is_admin()` trusted `profiles.email`, a column users can write on their own row. Profile lock trigger did not cover it. | Any user could set their profile email to a founder address and gain admin RLS access. | Authority comes only from `profiles.role`. Founders are moved to `superadmin` by matching verified `auth.users` email. |
| C2 | Founder email whitelist in `is_staff`, `is_admin_staff`, the profile lock trigger, and ~34 RLS policies (public and storage). | Same as C1, across every admin-gated table and bucket. | All replaced by `public.is_superadmin()` (role check). Migration fails if any email check remains. |
| C3 | `fn_calculate_revenue_split` credited the platform's share to the first profile whose `profiles.email` matched a founder address. | Platform revenue could be diverted to an attacker's wallet. | Platform recipient is now `role = 'superadmin'`. |
| C4 | `release_held_payment` was executable by any signed-in user for any transaction id. | A user could queue a provider payout on any deal. | EXECUTE revoked from anon/authenticated. Internal callers (definer functions) unaffected. |
| C5 | `set_verification_level` was executable by anyone. | Any user could set their own provider verification level to 3. | EXECUTE revoked from anon/authenticated. |
| C6 | `wa_add_strike` (SECURITY DEFINER, no caller check) was executable by anon. | Anyone could add strikes and suspend any WhatsApp contact. | Service-role only. |

### High (all fixed)

| ID | Finding | Fix |
|---|---|---|
| H1 | `available_wallet_balance`, `has_verified_payout_account`, `get_unlock_credit_balance` returned data for any `profile_id` (IDOR). | Caller must own the id or be staff. `available_wallet_balance` is not a client RPC and is now service/internal only. |
| H2 | `resolve_report` accepted a caller-supplied `resolved_by` and had no staff check. | Staff check added. Resolver is always `auth.uid()`. |
| H3 | `escrow_transactions` "Escrow strict update": a tenant could update any column on a funded escrow row. | Column guard: tenant may change `confirmed_at` only. Release happens in the owner-run trigger. A new permissive policy, "Tenant confirms move-in", lets the row pass the check once the trigger sets `released`. Without it, the tenant's own confirmation failed (a pre-existing bug the tighter guard exposed). |
| H4 | Sellers could set `status = 'active'`, `verified_by`, `verified_at`, `assigned_agent_id`, `payment_ref`, etc. on their own listings, including re-listing rejected ones. | Column guard: owners can pause/remove, and re-list only listings staff had approved. Verification fields are staff-only. |
| H5 | Students could set their own verification `status` to `approved` (INSERT and UPDATE). | Users may submit `pending` and resubmit after rejection. Only staff can approve or reject. |
| H6 | Dispute reporters could set `status` and `resolution` on their own disputes. | Reporters may open a dispute (status `open`). Only staff change outcomes. |
| H7 | `account_deletion_blockers` was callable by anon and authenticated for any user. | Service role only. The API uses the service role. |
| H8 | Supabase default privileges grant anon and authenticated full table rights on `public`. RLS was the only barrier. | anon: no write privileges except `rental_enquiries` (public enquiry form). authenticated: no TRUNCATE, REFERENCES or TRIGGER. Default privileges set for future tables. |
| H9 | `revoke_staff_invite` checked `auth.email()` against the founder list. | Checks `is_superadmin()`. |
| H10 | `v_agent_scorecard` (agent name, email, phone, complaint and strike counts) had no `security_invoker`, so it ran with its owner's privileges and bypassed RLS. Supabase's default grants would expose it to anon. | `security_invoker = true`, anon access revoked. Staff see rows through RLS on `profiles` and `agent_scores`. `admin_deal_pipeline` and `my_requests` are re-asserted the same way. |

### Medium (all fixed)

| ID | Finding | Fix |
|---|---|---|
| M1 | `check_email_exists` let anon test whether an email has an account. The app does not call it. | EXECUTE revoked from anon and authenticated. |
| M2 | ~75 SECURITY DEFINER functions had no `search_path`. | Every one now has `search_path = public, extensions, pg_temp`. |
| M3 | ~40 other SECURITY DEFINER and trigger functions were executable by PUBLIC, anon or authenticated without need. | Revoked. Policy helpers (`get_my_role`, `is_admin`, `is_staff`, `is_admin_staff`, `is_superadmin`) keep EXECUTE, since RLS runs as the querying role. |
| M4 | `pinecone_index_status` was publicly readable and exposed internal `error_log` text. | Staff-only read. |
| M5 | `fn_sanitize_text` (baseline) called `regexp_replace(input, chr(0), …)`. PostgreSQL rejects NUL, so **every write to `properties` errored**. | NUL step removed. Other steps unchanged. This is a functional fix, not only security. |

### Verified as correct (no change needed)

- RLS is enabled on every `public` table except PostGIS `spatial_ref_sys`.
- Storage: `identity-docs` and `provider-portfolio` are private (forced by migration `20260828000005`). Folder-scoped owner policies are correct. The leftover `USING (true)` storage policy from the dashboard was already removed there.
- Realtime publication includes only `public.notifications`, which is RLS-protected.
- API handlers check auth: `api/platform.js`, `api/admin/[resource].js`, `api/agent/[action].js`, `api/send-email.js` (Bearer token, server-side recipient, rate limit, HTML escaping). `api/paystack-webhook.js` and `api/escrow-webhook.js` verify HMAC-SHA512 and fail closed when the secret or signature is missing.
- `provider_stats` is intentionally owner-run. It returns per-provider aggregates for public provider pages, and an invoker view would show only the viewer's own transactions.
- Anonymous functions that remain are intentional: signup conflict checks, username/phone checks, booking availability, public search and listing reads, forum view counts, and the admin-login lockout pair.

---

## 2. Verification

Regression suite `supabase/tests/security_hardening.sql`, run against the migrated database as the real roles (45 checks, 0 failures):

- Email spoofing grants no staff or admin rights.
- Superadmin, admin and agent roles keep full staff access.
- Client calls to `release_held_payment`, `set_verification_level`, `wa_add_strike`, `account_deletion_blockers`, `activate_scheduled_commissions`, `confirm_referral_earning`, and cross-user balance reads are all refused.
- anon can't check email existence, call service-only functions, or write to escrow. Username, phone and admin-lockout checks still work.
- Tenant move-in confirmation succeeds. Tenant forcing `status` or changing amounts is refused.
- Seller pause and pending-listing insert succeed. Self-verification, re-listing unapproved listings, and setting `verified_by` are refused.
- Student pending submission and edit succeed. Self-approval is refused.
- Dispute opening succeeds. Self-resolution is refused.
- Staff activation, escrow update and report resolution succeed, and the resolver is recorded as the caller.
- No founder email appears in any RLS policy or public function.

Regression suite run after the final migration: 45 PASS, 0 FAIL. It is committed as `supabase/tests/security_hardening.sql`.

Client RPC audit: every RPC name called from `src/` and `api/` was checked against the final privileges. Each keeps the role it needs (authenticated, or anon where the pre-login flow calls it).

Build: `vite build` passes after the client role-list change.

## 2a. Coverage and limits of this audit

Be clear about what this audit covers. A replay of the full migration chain into the scratch cluster logged errors in four files:

| File | Replay result | Consequence |
|---|---|---|
| `20260711000000_production_baseline_schema.sql` | 30 errors, mostly stub collisions with the `auth`/`storage`/`realtime` stubs | Stub-related, not a finding |
| `20260731000017_fix_provider_stats_and_bid_rpcs.sql` | References `provider_stats` before it exists | Ordering issue. `provider_stats` was not created in the replay |
| `20260812000000_production_hardening.sql` | `admin_deal_pipeline` missing, `uuid = bigint` error | That view and its policies were not checked in the replay |
| `20260813000000_dashboard_profile_spec.sql` | `my_requests` missing, `public.reviews` missing | Those objects were not checked in the replay |

The view findings (H10) and the `admin_deal_pipeline`/`my_requests` checks come from reading the migration SQL and the live objects that did replay. Migration `20260731000017` also references `public.reviews`, which is created later in `20260828000009`, so a fresh replay fails there. That is the known ordering issue.

**Recommended follow-up:** run `supabase db reset` against a local Supabase stack, which applies the chain with the real `auth`/`storage` schemas. Then re-run this audit and `supabase/tests/security_hardening.sql` against it. This closes the gap for objects in those four files.

---

## 3. Before deploying

1. **Check the founder profile rows first.** The migration sets `role = 'superadmin'` only for `profiles` rows whose `id` matches an `auth.users` row with a founder email. If a founder has no profile row, the migration will not create one, and that founder loses admin access. Run:
   ```sql
   select u.email, p.id, p.role
   from auth.users u
   left join public.profiles p on p.id = u.id
   where lower(u.email) in ('divineandbassey@gmail.com', 'prosperwithbassey@gmail.com');
   ```
2. Take a backup or confirm point-in-time recovery is on.
3. Apply to staging first. Log in as each founder and confirm `/admin` works. Confirm a listing can be created, that a tenant can confirm move-in, and that a verified provider can accept a bid.
4. Review historical platform revenue rows. Any `wallet_ledger` row with `recipient_role = 'platform'` that points to a non-founder profile may be from the C3 exploit:
   ```sql
   select wl.*, p.email from public.wallet_ledger wl
   join public.profiles p on p.id = wl.recipient_id
   where wl.recipient_role = 'platform' and p.role is distinct from 'superadmin';
   ```
5. Known pre-existing issue, not fixed here: migrations replay out of order (see section 2a). `20260731000017` references `public.reviews`, which is created in `20260828000009`. A fresh replay fails there. Production is unaffected because it was migrated in order.

---

## 4. Open items and decisions

These are not fixed in this change. Each needs a product or ops decision.

| ID | Item | Recommendation |
|---|---|---|
| F1 | Signup conflict checks (`check_phone_exists`, `check_username_exists`, `check_device_exists`, `check_signup_conflicts`) are anon-callable and can enumerate accounts. Signup needs them. | Rate-limit at the edge, the same way `api/validate-invite.js` uses `redisRateLimit`. Or move them behind an API route. |
| F2 | `record_admin_login_attempt` is anon-callable. Anyone can record failures against an admin email and lock it out (denial of service). | Move the lockout check and counter to the server (API route with service role) and rate-limit by IP. |
| F3 | Email allowlists remain in the client (`App.jsx`, `AdminPage.jsx`, `AdminLoginPage.jsx`, `ResetPasswordPage.jsx`) and API (`api/admin/[resource].js`). The database no longer depends on them, but UI and API gating still do. | Move to role checks. Emails come from verified auth, so this is lower risk than C1. |
| F4 | `Owner reads own identity docs` lets the `agent` role read every identity document. | Restrict to `admin`, `verifier` and `superadmin` unless field agents need it. Product decision. |
| F5 | `messages`: the recipient can UPDATE or DELETE messages they received. | Make messages append-only, or add a column guard. |
| F6 | Public-read tables (`reviews`, `professional_reviews`, `property_reviews`, `property_images`, `room_categories`, `institutions`, `platform_settings`) are intentional. | Confirm no personal data is stored in these columns. `platform_settings` holds no secret-like keys in seeds. |
| F7 | `rental_enquiries` accepts anonymous inserts (intended). | Rate-limit at the edge to prevent spam. |
| F8 | Dashboard user deletion fails with "Database error deleting user" because of plain foreign keys to `auth.users` (for example `transactions`, `reviews`, `disputes`). The repo's account-deletion design soft-deletes instead. | Awaiting a decision. Options: add `ON DELETE` rules, or always use the soft-delete path. |
| F9 | `fn_sanitize_text` strips SQL keywords and `--` from listing text. This is not a security control: parameterized queries are the real protection. It also alters listing content. | Leave as-is for now, or remove if content integrity matters more. |
| F10 | `security_audit_report.md` (April) is outdated. | Superseded by this document (banner added). |
| F11 | `db/archive/*.sql` contains older security SQL. It is not part of the migration chain. | Do not run it. Kept for history. Marked in `db/archive/README.md`. |
| F12 | `provider_stats` is owner-run and returns per-provider aggregates to any signed-in user. | Accepted: aggregates only. Revisit if they reveal more than counts and rates. |
| F13 | `rental_enquiries` anonymous insert: spam risk. | Covered by F7. |
| F14 | `admin_deal_pipeline` is used by the admin UI but was not present in the replayed scratch schema. | Expected from the replay gap (section 2a). Verify on a real `db reset`. |

---

## 5. Changes outside the database

- `src/App.jsx`, `src/pages/Admin/AdminLoginPage.jsx`, `src/pages/Auth/ResetPasswordPage.jsx`, `src/pages/Agent/AgentDashboardPage.jsx`: `superadmin` added to role checks, so UI access matches the database role.
- `db/SETUP_ORDER.md`: the step that made admins by email is replaced. The founder role is now set by the migration. Other admins are made by a `superadmin` through the admin UI.
- `CHANGELOG.md`: entry added for this change.
- `security_audit_report.md`: superseded banner added.
- `db/archive/README.md`: notes that archived SQL is historical and must not be run.

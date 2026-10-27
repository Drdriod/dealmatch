# Production migration runbook

Status: **files 1 to 17 applied and verified (17 on 2026-10-20). Files 18 and 19 are written and wait for the PR #18 deploy (section 7). PR #17 was merged and deployed on 2026-10-21.** Production is Supabase project `dijggrafwdznescbuypi`.
Taxonomy (`20261011010000`) is parked in `supabase/parked/` and is not applied. It is superseded by file 9 (`20261012000000`).

## 0. Applied log

| # | File | Result |
|---|------|--------|
| 1 | 20260731000019_complete_transaction_rpc | Applied. `complete_transaction` exists. |
| 2 | 20260909000001_subscriptions | Applied. Verified: table, RLS, `get_active_plan`. |
| 3 | 20260909000005_commission_notifications | Applied. Trigger notifies providers in a category on a ≥1.00 pt change to ACTIVE. Earlier RAISE format fix in commit d6e885d. |
| 4 | 20261009000000_security_audit_hardening | Applied. `is_superadmin` exists, 0 founder-email policies remain. `search_providers_rpc` added to keep-list (commit 0665020). |
| 5 | 20261011000000_provider_matching_caps_and_listing_guards | Applied. Verified: search RPC, Level 1 cap function and trigger, purge function. |
| 6 | 20261011020000_security_perf_hardening | Applied. 0 unindexed FKs, 4 duplicate indexes removed, 7 trigger-only functions not client-callable. |
| 7 | 20261011030000_fix_fk_index_duplicates | Applied, by explicit choice. Rebuilt the same 85 FK indexes. Net effect on production was a rebuild, not a cleanup. |
| 8 | 20261011040000_nigeria_points_invoker | Applied. `nigeria_state_points` has `security_invoker=true`. |
| 9 | 20261012000000_taxonomy_blueprint_v2 | Applied 2026-10-12 after a rolled-back dry run (success, no rows). Verified: 11 active groups (4 place, 7 people), 60 active leaves, 0 active categories without a pillar, 0 listings under inactive categories. Adds `categories.pillar` and `properties.category_id`. No listings or properties were moved. |
| 10 | 20261012000100_universal_search_category_filter | Applied 2026-10-12 after a rolled-back dry run. Verified: 2-argument `universal_search` dropped, 3-argument version live with optional `p_category_slug`, grants on anon, authenticated, service_role, unfiltered and filtered calls both run. Depends on the `public_profiles` view from file 11, which was applied earlier on the same day. |
| 11 | 20261009010000_page_audit_fixes | Applied 2026-10-12 after a rolled-back dry run. Verified: `public_profiles` view exists, listing status rule includes the admin statuses, `mortgage_applications.updated_at` exists, referral payout guard uses `is_superadmin`. |
| 12 | 20261012010000_rental_fee_1_5_per_side | Applied 2026-10-12 after a rolled-back dry run. Verified: no 3.75% or 7.5% rate remains in `start_property_escrow_payment` or `fn_calculate_revenue_split`; both now use 1.5% (3% total) for rentals. Changes rental escrow fee from 3.75% per side (7.5% total) to 1.5% per side (3% total) in `start_property_escrow_payment` and `fn_calculate_revenue_split`. Ship with the frontend fee change, not before. |
| 13 | 20261013000000_platform_fees_registry | Applied 2026-10-13 after a rolled-back dry run and owner approval, as one transaction. Verified: 10 channels seeded (escrow 3% each, hotel 8%, job escrow 0%, hostel and professional and unlock flat fees), `platform_fee_history` exists, 4 fee functions exist, no 3.75% or 7.5% rate left in the two escrow functions. Admin write functions were not exercised with a real admin account. The frontend that reads this table is not wired yet. |
| 14 | 20261013010000_payment_integrity | Applied 2026-10-13 after a rolled-back dry run and owner approval (run in the SQL editor: the tool cancels DROP POLICY statements). Verified: 3 guard triggers, 0 client insert policies on bookings and hostel_payments, bookings.platform_fee_ngn exists, escrow start checks the listed price. |
| 15 | 20261013020000_money_integrity_marketplace | Applied 2026-10-13 after a rolled-back dry run and owner approval (run in the SQL editor as a wrapped transaction: the tool cancelled it). Verified: `job_guard` 1 (trigger enabled), `refunds_table` 1 with RLS on, `mark_fn` 1 and SECURITY DEFINER, admin-only policies `payment_refunds_admin_read` and `payment_refunds_admin_update`. Not yet exercised with a real admin account. |
| 16 | 20261013030000_retire_job_escrow_registry_row | Applied 2026-10-13 after a rolled-back dry run and owner approval. Verified: `job_escrow` is_active=false, 9 other channels still active. Job commission is set in Commission Schedules. |
| 17 | 20261014000000_payout_state_guard | Applied by the owner in the SQL editor, confirmed 2026-10-20 with read-only queries on production: `trg_guard_payout_transition` exists and is enabled (BEFORE UPDATE OF status on `payout_queue`); the live `fn_guard_payout_transition` allows exactly pending→processing/failed, processing→paid/failed, paid→failed, failed→pending, the same table as `src/lib/payoutStates.js`; no SQL function updates `payout_queue`; `payout_queue` holds 0 rows, so nothing is stranded. Code check: the cron, webhook, reconciliation and settlement write status only through `movePayout`; the admin Payouts tab writes only failed→pending (Retry, shown on failed rows only, and now conditional on `status = 'failed'`). Not re-run on production: an illegal move raising `check_violation` (no row to test with); the rolled-back dry run passed 13/13 on this same SQL. |
| 18 | 20261020000000_properties_column_exposure | **Applied on production** by the owner (verified from the database 2026-10-24). |
| 19 | 20261020010000_properties_status_under_verification | **Applied on production** by the owner (verified from the database 2026-10-24). |
| 20 | 20261022000000_protected_transactions_and_disputes | **Applied on production** by the owner on 2026-10-25; objects verified from the database (view, 2 logs, 3 functions, 9 triggers, 9 policies, private bucket). Dry run before apply: 42 of 42. |
| 21 | 20261024000000_apply_referral_code | **Applied on production** by the owner on 2026-10-25 (function exists, closed to anon, open to signed-in users). |
| 22 | 20261024020000_virtual_account_fulfilment | **Applied on production** by the owner on 2026-10-25 (6 columns and 2 indexes on payment_virtual_accounts verified). Dry run before apply passed. |
| 23 | 20261025000000_foreign_key_indexes | **Written, not applied.** Paste as is (no BEGIN or ROLLBACK). Adds 3 indexes the Supabase advisor reported missing (payment_refunds.profile_id, payment_refunds.refunded_by, disputes.assigned_to). Rolled-back dry run on production 2026-10-25: 3 indexes created. Safe to run twice. |
| 27 | 20261027000000_fix_testimonial_insert_policy_recursion | **Applied on production** by the owner on 2026-10-27 (unique index and policy verified from the database). Fixes a live bug: every "Share your story" submission failed with 42P17 infinite recursion in the INSERT policy.** Replaces the self-referencing policy check with a partial unique index (one non-rejected story per user) and a plain policy. Rolled-back dry run on production 2026-10-27: own insert OK, second live story blocked (23505), self-approved insert blocked, insert as another user blocked; nothing persisted. Paste as is. |

**Advisor state after apply:**
- Security: `provider_stats` SECURITY DEFINER view is intentional. PostGIS and pg_net in `public` and `spatial_ref_sys` RLS need an extension move (deferred). ~16 anon-callable and ~42 authenticated-callable SECURITY DEFINER functions are an RPC grant audit (deferred). Leaked-password protection is disabled in Auth settings (action needed). `identity_doc_purge_queue` RLS with no policies is intended.
- Performance: 10 `auth_rls_initplan` policies remain, 147 unused indexes (needs traffic data), 313 multiple permissive policies (design change). All deferred.

**Action items:** enable leaked-password protection; reset staging and production database passwords (exposed in chat); smoke-test Find Provider, provider profiles, listing creation, and a transaction.

## 1. Pre-flight checks (read-only)

Run each query in the production SQL editor. Nothing here writes.

```sql
-- A. Migration 20260731000014 created transactions.listing_id. Repo now says UUID.
--    If this returns 'bigint', production needs a forward fix before 20261011020000.
SELECT data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'listing_id';

-- B. Which repo migrations already ran on production?
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- C. Would the FK index pass create anything new? (Expect a small number.)
SELECT count(*) AS unindexed_fks
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE c.contype = 'f' AND n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = c.conrelid
       AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
  );
```

Stop and report if A returns `bigint`, or if B shows migrations that are not in the repo.

## 2. Migrations to apply, in this order

Production is not tracked by the migration tool, so apply **one file at a time**,
starting from the earliest missing object. Each file gets its own rolled-back dry
run first, and stops on the first error.

Missing on production (checked read-only):

1. `20260731000019_complete_transaction_rpc.sql` (complete_transaction)
2. `20260909000001_subscriptions.sql` (subscriptions, get_active_plan)
3. `20260909000005_commission_notifications.sql` (notify_commission_activated)
4. `20261009000000_security_audit_hardening.sql` (is_superadmin, fn_guard_* only partly present)
5. `20261011000000_provider_matching_caps_and_listing_guards.sql`
6. `20261011020000_security_perf_hardening.sql`
7. `20261011030000_fix_fk_index_duplicates.sql`
8. `20261011040000_nigeria_points_invoker.sql`

**Deferred, not part of this apply:** `supabase/parked/20261011010000_place_people_taxonomy.sql`.
It re-parents live listings and deactivates five categories. It needs a separate
product decision and its own dry run. Nothing above depends on it.

Staging ran the full history in this order, so staging is the reference.

## 3. Dry run

Wrap the set in a transaction and roll back, to confirm it applies cleanly
without committing anything:

```sql
BEGIN;
-- paste the migration files in order here
ROLLBACK;
```

Check that the output has no ERROR lines before continuing.

## 4. Verify after apply (read-only)

- Re-run the security and performance advisors for `dijggrafwdznescbuypi`.
- Confirm `public.identity_doc_purge_queue` exists and has RLS enabled.
- Confirm `public.nigeria_state_points` reports `security_invoker=true` in `reloptions`.

## 5. Rollback

Each migration is additive or narrowly scoped. If something breaks, revert the
specific change (for example, `ALTER VIEW ... SET (security_invoker = false)`)
rather than restoring the database.

## 6. Approval

Production is changed only when the owner approves **after** checks 1 and 3 pass.

## 7. Files 18 and 19: apply after PR #18 is deployed

**Why the order matters.** File 18 makes `select('*')` on `properties` fail for visitors and signed-in users.
The code on `main` today (PR #17, deployed 2026-10-21) still does that in the owner and staff screens (landlord
dashboard, verification queue, agent dashboard) and when a listing is published. PR #18 changes them. Apply 18 first and the live site breaks. Apply it after the PR #18 deploy and the code
already asks for named columns.

1. Merge PR #18. Wait for the Vercel production deploy to finish. Open the site and confirm it loads.
2. Dry-run file 18 again if more than a day has passed (it is quick), then run it in the SQL editor.
   It checks its own result and rolls back if a private column is still readable.
3. Dry-run file 19, then run it in the SQL editor (it contains a DROP CONSTRAINT, which the tool cancels).
4. Run the read-only checks below.
5. Smoke test in a browser: home page counts, Browse, one property page, the landlord dashboard,
   the Verification page as staff, the agent dashboard as an agent, and publishing a listing with photos.

Read-only checks after file 18 (expect exactly the nine private columns to show `false` and `false`):

```sql
SELECT column_name,
       has_column_privilege('anon', 'public.properties', column_name, 'SELECT')          AS anon_can_read,
       has_column_privilege('authenticated', 'public.properties', column_name, 'SELECT') AS authenticated_can_read
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'properties'
 ORDER BY anon_can_read, column_name;

SELECT has_table_privilege('service_role', 'public.properties', 'SELECT')                 AS service_role_reads_all,  -- true
       has_function_privilege('anon', 'public.my_assigned_property_ids()', 'EXECUTE')       AS anon_runs_rpc,           -- false
       has_function_privilege('authenticated', 'public.my_assigned_property_ids()', 'EXECUTE') AS auth_runs_rpc;       -- true
```

And from outside, as anyone could: this must now fail with `permission denied for table properties`
(use the project URL and the anon key):

```bash
curl -s "$SUPABASE_URL/rest/v1/properties?select=contact_phone&limit=1" -H "apikey: $SUPABASE_ANON_KEY"
```

**When a column is added to `properties` later.** It is not readable by browsers until a migration grants it.
Add `GRANT SELECT (col) ON public.properties TO anon, authenticated;` to that migration, and add the name to
`src/lib/propertyColumns.js`. `npm test` fails if the code and file 18 disagree.

**Rollback for file 18.** It only removes read access, so rolling back reopens the exposure. Use it only if
the site breaks for a reason the code cannot fix quickly:

```sql
GRANT SELECT ON public.properties TO anon, authenticated;
```

Then fix the code and apply file 18 again. Do not leave production on the rollback.


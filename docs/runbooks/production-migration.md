# Production migration runbook

Status: **files 1 to 13 applied and verified (2026-10-13).** Production is Supabase project `dijggrafwdznescbuypi`.
Taxonomy (`20261011010000`) remains parked and is not applied. It is superseded by file 9 (`20261012000000`).

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
| 13 | 20261013000000_platform_fees_registry | Applied 2026-10-13 after a rolled-back dry run and owner approval, as one transaction. Verified: 10 channels seeded (escrow 3% each, hotel 8%, job escrow 0%, hostel and professional and unlock flat fees), `platform_fee_history` exists, 4 fee functions exist, no 3.75% or 7.5% rate left in the two escrow functions. Admin write functions were not exercised with a real admin account. The frontend that reads this table is not wired yet. |
| 12 | 20261012010000_rental_fee_1_5_per_side | Applied 2026-10-12 after a rolled-back dry run. Verified: no 3.75% or 7.5% rate remains in `start_property_escrow_payment` or `fn_calculate_revenue_split`; both now use 1.5% (3% total) for rentals. Changes rental escrow fee from 3.75% per side (7.5% total) to 1.5% per side (3% total) in `start_property_escrow_payment` and `fn_calculate_revenue_split`. Ship with the frontend fee change, not before. |

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

**Deferred, not part of this apply:** `20261011010000_place_people_taxonomy.sql`.
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

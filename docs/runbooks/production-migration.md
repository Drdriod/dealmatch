# Production migration runbook

Status: **prepared, not run.** Production is Supabase project `dijggrafwdznescbuypi`.
Nothing in this runbook changes production until the approval step at the end.

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

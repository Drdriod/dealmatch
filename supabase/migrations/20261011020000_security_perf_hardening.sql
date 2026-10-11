-- ============================================================================
-- Security and performance hardening (safe set only).
--
-- Deliberately NOT included here, each needs its own test first:
--   * SECURITY DEFINER views (provider_stats, public_profiles,
--     nigeria_state_points). Switching them to invoker changes what users see.
--   * Moving PostGIS and pg_net out of public (extension-owned).
--   * Revoking EXECUTE on RPCs the app calls directly (accept_bid, etc.).
--   * Merging multiple permissive policies (design change).
--   * Dropping unused indexes (needs production traffic data first).
-- ============================================================================


-- ── 1. Fixed search_path on every public function that lacks one ───────────
-- Skips functions owned by an extension (PostGIS), which we cannot alter.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proconfig IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END
$do$;


-- ── 2. Trigger-only functions are not callable by clients ──────────────────
-- These run only as triggers. A trigger fires regardless of the caller's
-- EXECUTE grant, so revoking client access does not stop them firing.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'enforce_level1_booking_cap',
         'enforce_review_transaction',
         'guard_listing_payment_fields',
         'guard_profile_identity_fields',
         'sync_identity_to_provider',
         'sync_provider_state_location',
         'refresh_provider_rating'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$do$;


-- ── 3. auth.uid() wrapped in a sub-select (per-statement, not per-row) ─────
-- Postgres re-evaluates a bare auth.uid() for every row. Wrapping it lets the
-- planner evaluate it once. Each policy is rebuilt with the same name, roles,
-- command and permissiveness; only the expressions change.
DO $do$
DECLARE
  p record;
  new_qual  text;
  new_check text;
  roles_sql text;
  sql       text;
  marker    constant text := chr(1);
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
      FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
       AND (
         (qual       LIKE '%auth.uid()%' AND qual       NOT LIKE '%(select auth.uid())%')
         OR
         (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(select auth.uid())%')
       )
  LOOP
    new_qual := p.qual;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, '(select auth.uid())', marker);
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, marker, '(select auth.uid())');
    END IF;

    new_check := p.with_check;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, '(select auth.uid())', marker);
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, marker, '(select auth.uid())');
    END IF;

    SELECT string_agg(
             CASE WHEN r = 'public' THEN 'PUBLIC' ELSE quote_ident(r) END, ', ')
      INTO roles_sql
      FROM unnest(p.roles) AS r;

    sql := format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE sql;

    sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                  p.policyname, p.schemaname, p.tablename,
                  p.permissive, p.cmd, roles_sql);
    IF new_qual  IS NOT NULL THEN sql := sql || format(' USING (%s)', new_qual);  END IF;
    IF new_check IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE sql;
  END LOOP;
END
$do$;


-- ── 4. Index every foreign key in public ───────────────────────────────────
-- Without an index on the referencing columns, deletes and updates on the
-- referenced table scan the whole referencing table.
DO $do$
DECLARE
  fk      record;
  cols    text;
  idxname text;
BEGIN
  FOR fk IN
    SELECT c.oid, c.conname, c.conrelid, c.conkey, cl.relname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f'
       AND n.nspname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
       )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
      INTO cols
      FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum;

    idxname := left('idx_fk_' || fk.relname || '_' || md5(fk.conname), 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
                   idxname, fk.relname, cols);
  END LOOP;
END
$do$;


-- ── 5. Drop the duplicate (non-constraint) copies ──────────────────────────
-- Each pair has identical definitions. We keep the one that backs a
-- constraint or the older, more descriptive name, and drop the other.
DROP INDEX IF EXISTS public.idx_audit_log_created;
DROP INDEX IF EXISTS public.idx_profiles_invite_code;
DROP INDEX IF EXISTS public.idx_referral_txn_referrer;
DROP INDEX IF EXISTS public.idx_swipes_user_action;

-- ============================================================================
-- Fix duplicate foreign-key indexes from 20261011020000.
--
-- The first FK pass compared the index key list in the wrong form, so it
-- missed indexes that already existed and created a copy (named idx_fk_*)
-- for each one. This removes every idx_fk_* index and then creates an index
-- only for foreign keys that still have no covering index.
-- ============================================================================

-- 1. Remove the copies created by the earlier pass.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname LIKE 'idx\_fk\_%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schemaname, r.indexname);
  END LOOP;
END
$do$;

-- 2. Index only the foreign keys that still have no covering index.
-- pg_index.indkey is space-separated text; string_to_array gives a 1-based
-- int2[] that can be compared to pg_constraint.conkey.
DO $do$
DECLARE
  fk      record;
  cols    text;
  idxname text;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid, c.conkey, cl.relname
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

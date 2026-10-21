-- 18. properties: browser roles read only the columns that are meant to be public.
--
-- Why
--   The row policy "Active properties are public" decides which ROWS a visitor sees, not which
--   COLUMNS. Until now `anon` and `authenticated` held table-level SELECT, so one direct API call,
--   `GET /rest/v1/properties?select=contact_phone,contact_email`, returned the seller's phone and
--   email for every active listing to anyone who asked, signed in or not. The contact rule is that a
--   phone number is released only through get_property_contact() (owner, staff, funded escrow or a
--   credit unlock). Reading it off the row sidestepped that rule.
--
-- What this does
--   1. Removes table-level SELECT on public.properties from anon and authenticated.
--   2. Grants SELECT on the 36 columns that are public listing data, to the same two roles.
--      Nine columns are left without any browser grant:
--        contact_phone, contact_email            the seller's contact details
--        payment_ref                             the reference payment webhooks match on
--        verified_by, verification_date,
--        verification_note, verification_notes   internal verification record
--        assigned_agent_id, assigned_at          internal agent assignment
--      The service role and SECURITY DEFINER functions are not affected and still read everything.
--   3. Adds my_assigned_property_ids(), because the agent dashboard filtered on assigned_agent_id.
--      A filter needs SELECT on the column, so the agent now asks this function for the ids instead.
--
-- What it does not change
--   INSERT, UPDATE and DELETE grants, the row policies, and the guard triggers. Writing a private
--   column is still governed by fn_guard_property_client_write. Reading one is what is closed here.
--
-- Rules that follow from it (also in docs/architecture/design-patterns.md, item 8)
--   * A column added to properties later is NOT readable by browsers until a migration grants it.
--     That is the safe default. If the column is public, add GRANT SELECT (col) to the migration and
--     add the name to src/lib/propertyColumns.js. src/lib/propertyColumns.test.mjs fails if the
--     two disagree.
--   * `select('*')` on properties now fails for a browser role with "permission denied". Name the
--     columns. Counts use select('id', { count: 'exact', head: true }).
--   * SECURITY INVOKER functions and views that read properties (universal_search, universal_match,
--     admin_deal_pipeline, my_requests) use only granted columns. Keep it that way.
--
-- Apply AFTER the code that goes with it is deployed (PR #17). The code on `main` before that still
-- uses select('*') on properties, which this migration would break for visitors and owners.
--
-- No DROP statements, so the SQL editor and the migration tool both run it as written.

DO $$
DECLARE
  readable    text[] := ARRAY[
    'id', 'seller_id', 'title', 'description', 'property_type', 'listing_type', 'price',
    'state', 'city', 'address', 'bedrooms', 'bathrooms', 'size_sqm', 'features', 'documents',
    'status', 'view_count', 'like_count', 'created_at', 'updated_at', 'category', 'price_period',
    'max_guests', 'video_url', 'landlord_name', 'rules', 'rating', 'review_count', 'custom_terms',
    'verified_at', 'latitude', 'longitude', 'occupancy_status',
    'attributes', 'category_id', 'search_vector'
  ];
  private_cols  text[] := ARRAY[
    'contact_phone', 'contact_email', 'payment_ref', 'verified_by', 'verification_date',
    'verification_note', 'verification_notes', 'assigned_agent_id', 'assigned_at'
  ];
  unclassified text;
  grant_list   text;
  col          text;
BEGIN
  -- A column this file does not know about is not guessed at. Someone decides public or private.
  SELECT string_agg(column_name::text, ', ' ORDER BY column_name::text) INTO unclassified
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'properties'
     AND NOT (column_name::text = ANY (readable || private_cols));
  IF unclassified IS NOT NULL THEN
    RAISE EXCEPTION 'properties has columns this migration does not classify: %. Decide public or private, then add them here and in src/lib/propertyColumns.js.', unclassified;
  END IF;

  REVOKE SELECT ON public.properties FROM anon, authenticated;

  -- Only columns that exist here are granted, so a database without the newer optional columns
  -- (attributes, category_id, search_vector) is not an error.
  SELECT string_agg(quote_ident(column_name::text), ', ') INTO grant_list
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'properties'
     AND column_name::text = ANY (readable);
  EXECUTE format('GRANT SELECT (%s) ON public.properties TO anon, authenticated', grant_list);

  -- The migration checks its own result and rolls back if it is wrong.
  FOR col IN
    SELECT column_name::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'properties'
  LOOP
    IF col = ANY (private_cols) THEN
      IF has_column_privilege('anon', 'public.properties', col, 'SELECT')
         OR has_column_privilege('authenticated', 'public.properties', col, 'SELECT') THEN
        RAISE EXCEPTION 'properties.% is still readable by a browser role', col;
      END IF;
    ELSE
      IF NOT has_column_privilege('anon', 'public.properties', col, 'SELECT')
         OR NOT has_column_privilege('authenticated', 'public.properties', col, 'SELECT') THEN
        RAISE EXCEPTION 'properties.% should be readable by anon and authenticated and is not', col;
      END IF;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.properties', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost SELECT on properties';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.properties', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.properties', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated lost INSERT or UPDATE on properties; this migration must not change them';
  END IF;
END $$;

-- The agent dashboard's list of listings assigned to the signed-in agent. The agent's own id comes
-- from the session, never from an argument, so nobody can ask for another agent's assignments.
CREATE OR REPLACE FUNCTION public.my_assigned_property_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.properties WHERE assigned_agent_id = auth.uid()
$$;

COMMENT ON FUNCTION public.my_assigned_property_ids() IS
  'Ids of the listings assigned to the signed-in agent. Exists because assigned_agent_id is not readable by browser roles (20261020000000).';

REVOKE ALL ON FUNCTION public.my_assigned_property_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_assigned_property_ids() TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.my_assigned_property_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still run my_assigned_property_ids()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.my_assigned_property_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot run my_assigned_property_ids()';
  END IF;
END $$;

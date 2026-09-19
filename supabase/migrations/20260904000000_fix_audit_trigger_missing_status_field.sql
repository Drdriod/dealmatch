-- ============================================================================
-- Fix: identity verification submissions fail with
--   "record 'new' has no field 'status'"
--
-- Root cause: fn_audit_admin_action() picks which column to log with
--   CASE TG_TABLE_NAME
--     WHEN 'properties' THEN NEW.status
--     WHEN 'profiles'   THEN NEW.identity_verification_status
--     ...
--   END
-- Direct field access like `NEW.status` is resolved against the actual
-- runtime row type of NEW *before* the CASE branch is chosen in some
-- PL/pgSQL execution paths (and after any drift between this function and
-- whatever trigger is actually attached to which table). If a trigger
-- using this function ever fires against a row type that lacks the field
-- referenced in ANY branch, plpgsql raises "record 'new' has no field ...”
-- immediately - which is exactly the "Could not save verification status"
-- error users hit while submitting identity verification (trg_audit_
-- identity_status on public.profiles calling this function).
--
-- Fix: never touch NEW.<column> directly inside this shared function.
-- Route every read through to_jsonb(NEW) ->> 'column', which returns NULL
-- for an absent key instead of raising. This makes the function safe to
-- reuse across any table, present or future, regardless of which columns
-- it has.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_admin_action() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
BEGIN
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    TG_ARGV[0],
    jsonb_build_object(
      'table',      TG_TABLE_NAME,
      'record_id',  v_row ->> 'id',
      'new_status', CASE TG_TABLE_NAME
        WHEN 'properties'             THEN v_row ->> 'status'
        WHEN 'profiles'               THEN v_row ->> 'identity_verification_status'
        WHEN 'mortgage_applications'  THEN v_row ->> 'status'
        WHEN 'student_hostels'        THEN v_row ->> 'status'
        ELSE v_row ->> 'status'
      END
    ),
    auth.uid()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Belt-and-braces: an audit-log write must never be able to block the
  -- real update (identity verification, property status, etc.) that
  -- triggered it. Log the failure to Postgres logs and let the underlying
  -- change through.
  RAISE WARNING 'fn_audit_admin_action failed for table % on record %: %',
    TG_TABLE_NAME, to_jsonb(NEW) ->> 'id', SQLERRM;
  RETURN NEW;
END;
$$;

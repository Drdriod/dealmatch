-- An owner can pause a listing ('paused') as well as remove it ('removed'), and can re-list
-- a listing that staff had approved from either state.
--
-- Why: the guard only allowed 'removed', yet its own error message says "paused/removed" and the
-- landlord dashboard writes 'paused'. For a non-staff owner that write was refused, so the
-- dashboard pause button failed. Manage listings worked around it by pausing with 'removed',
-- which is also what its Remove button writes, so a paused and a deleted offer looked the same.
--
-- Only the status block changes. Every other rule in the function is copied unchanged.
-- Rollback: re-create the function from 20261009000000_security_audit_hardening.sql.

CREATE OR REPLACE FUNCTION public.fn_guard_property_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'pending_review')
       OR NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL
       OR NEW.verification_date IS NOT NULL OR NEW.assigned_agent_id IS NOT NULL THEN
      RAISE EXCEPTION 'new listings start as pending review' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verification_date IS DISTINCT FROM OLD.verification_date
     OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
     OR NEW.verification_notes IS DISTINCT FROM OLD.verification_notes
     OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.view_count IS DISTINCT FROM OLD.view_count
     OR NEW.like_count IS DISTINCT FROM OLD.like_count THEN
    RAISE EXCEPTION 'this listing field is managed by DealMatch staff' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('paused', 'removed') THEN
      NULL;
    ELSIF NEW.status = 'active' AND OLD.status IN ('paused', 'removed') AND OLD.verified_at IS NOT NULL THEN
      NULL; -- re-list a listing staff had approved
    ELSE
      RAISE EXCEPTION 'listing status can only be paused/removed, or re-listed after approval' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

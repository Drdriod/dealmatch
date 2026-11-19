-- F-018: agent site visits can only be recorded through the server (api/agent), which checks the
-- owner's visit code and the photo locations. Before this, an agent's browser could write the
-- visit and set a property live directly.

-- 1. Evidence the server records with each visit.
ALTER TABLE public.agent_verifications
  ADD COLUMN IF NOT EXISTS visit_code_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_checks jsonb;

-- 2. Agents no longer write verification rows themselves (the server uses the service role).
--    Admins keep update rights; everyone keeps their existing read rights.
DROP POLICY IF EXISTS "Agent submits own verifications" ON public.agent_verifications;
DROP POLICY IF EXISTS "Agent updates own pending" ON public.agent_verifications;
CREATE POLICY "Admins update verifications" ON public.agent_verifications
  FOR UPDATE
  USING (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]) OR public.is_superadmin())
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]) OR public.is_superadmin());

-- 3. An agent cannot approve, reject or reassign a property from the browser. Approval is an
--    admin or verifier decision after the server records the visit. (An agent who is also the
--    owner may still pause, remove, or re-list a listing staff had already approved.)
CREATE OR REPLACE FUNCTION public.fn_guard_agent_property_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE caller_role text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'agent' THEN
    RETURN NEW;
  END IF;

  IF NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verification_date IS DISTINCT FROM OLD.verification_date
     OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
     OR NEW.verification_notes IS DISTINCT FROM OLD.verification_notes
     OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
    RAISE EXCEPTION 'agents cannot change verification fields from the app' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('paused', 'removed') AND OLD.seller_id = auth.uid() THEN
      NULL;
    ELSIF NEW.status = 'active' AND OLD.status IN ('paused', 'removed')
          AND OLD.verified_at IS NOT NULL AND OLD.seller_id = auth.uid() THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'agents cannot change a property status from the app' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_agent_property_write ON public.properties;
CREATE TRIGGER trg_guard_agent_property_write
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_agent_property_write();

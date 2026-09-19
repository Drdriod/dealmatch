-- ============================================================================
-- Invite-based staff account creation (checklist item 17).
--
-- Replaces the old flow where the superadmin typed a temporary password
-- into a form and it was sent straight to auth.signUp() - meaning the
-- superadmin knew every staff member's password from day one, with no
-- forced reset and no record of who was actually invited versus who
-- self-registered.
--
-- New flow: superadmin records an invite (email + role) here, the server
-- sends a Supabase Auth invite email via the service-role admin API (see
-- api/admin/[resource].js), the invitee sets their own password by
-- following that link, and accept_staff_invite() - called from the
-- invitee's own authenticated session right after they land - grants the
-- role that was actually recorded in the invite, not whatever the client
-- happens to send. The superadmin never sees or sets the password.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.staff_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('agent', 'verifier', 'admin')),
  invited_by    UUID NOT NULL REFERENCES auth.users(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at   TIMESTAMPTZ,
  accepted_by   UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invites_pending_email_uidx
  ON public.staff_invites (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

-- Only the superadmin (the only role allowed to create admin/agent/verifier
-- accounts at all, matching the existing StaffTab gate) can see or manage
-- invites. This mirrors is_admin_staff()'s allowlist of superadmin emails.
CREATE POLICY "superadmin_manage_staff_invites" ON public.staff_invites
  FOR ALL USING (
    auth.email() = ANY (ARRAY['divineandbassey@gmail.com','prosperwithbassey@gmail.com'])
  ) WITH CHECK (
    auth.email() = ANY (ARRAY['divineandbassey@gmail.com','prosperwithbassey@gmail.com'])
  );

-- An invitee needs to be able to see that a pending invite exists for their
-- own (now-authenticated) email so the acceptance page can show them what
-- role they're accepting, before accept_staff_invite() is called.
CREATE POLICY "invitee_reads_own_pending_invite" ON public.staff_invites
  FOR SELECT USING (lower(email) = lower(auth.email()) AND status = 'pending');

GRANT SELECT ON public.staff_invites TO authenticated;

-- ----------------------------------------------------------------------------
-- accept_staff_invite(): called once, by the invitee, right after they set
-- their password via the emailed invite link and land back in the app with
-- an authenticated session. Looks up the invite by the caller's own email
-- (never a client-supplied id or role), grants exactly that role using the
-- trusted-context flag from the previous migration, and marks the invite
-- consumed so it cannot be replayed.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_staff_invite() RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.staff_invites%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept a staff invite';
  END IF;

  SELECT * INTO v_invite
  FROM public.staff_invites
  WHERE lower(email) = lower(auth.email())
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending invite found for this account';
  END IF;

  PERFORM set_config('app.trusted_role_grant', 'true', true);

  UPDATE public.profiles
  SET role = v_invite.role,
      full_name = COALESCE(full_name, v_invite.full_name),
      onboarding_completed = true,
      updated_at = now()
  WHERE id = auth.uid()
  RETURNING * INTO v_profile;

  UPDATE public.staff_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  WHERE id = v_invite.id;

  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('staff_invite_accepted', jsonb_build_object('role', v_invite.role, 'invited_by', v_invite.invited_by), auth.uid());

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_staff_invite() TO authenticated;

-- ----------------------------------------------------------------------------
-- revoke_staff_invite(): superadmin cancels an invite that hasn't been
-- accepted yet (typo'd email, changed their mind, etc).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_staff_invite(p_invite_id UUID) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.email() = ANY (ARRAY['divineandbassey@gmail.com','prosperwithbassey@gmail.com'])) THEN
    RAISE EXCEPTION 'only the superadmin may revoke a staff invite';
  END IF;
  UPDATE public.staff_invites SET status = 'revoked' WHERE id = p_invite_id AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_staff_invite(UUID) TO authenticated;

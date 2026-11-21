-- Tax settings the owner can change from the admin panel, and a ledger of tax owed.
--
-- VAT is added on top of DealMatch's own fees (never on rent, sale price or held money) and is
-- not DealMatch income. Withholding tax (WHT) is held back from referral payouts. Both rates
-- live here, switched OFF until the owner has confirmed the rates with an accountant.

-- Separation of duties: who may READ tax figures is a separate list from who runs the platform.
-- Ordinary admins and agents cannot see the tax ledger. Only the owner (superadmin) and accounts the
-- owner has added here (for example the accountant) can read it. Nobody can edit the ledger by hand.
CREATE TABLE IF NOT EXISTS public.tax_access (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tax_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tax_access FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_read_tax()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT public.is_superadmin() OR EXISTS (SELECT 1 FROM public.tax_access WHERE user_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION public.can_read_tax() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_tax() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_tax_access(p_user uuid, p_allow boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only the owner can grant tax access' USING ERRCODE = '42501';
  END IF;
  IF p_allow THEN
    INSERT INTO public.tax_access (user_id, note, granted_by) VALUES (p_user, p_note, auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET note = EXCLUDED.note, granted_by = auth.uid(), granted_at = now();
  ELSE
    DELETE FROM public.tax_access WHERE user_id = p_user;
  END IF;
  INSERT INTO public.admin_audit_log (action, metadata, performed_by, target_id)
  VALUES ('tax_access_changed', jsonb_build_object('allowed', p_allow, 'note', p_note), auth.uid(), p_user);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_tax_access(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tax_access(uuid, boolean, text) TO authenticated;

-- List of people with tax access, for the owner's settings screen.
CREATE OR REPLACE FUNCTION public.admin_list_tax_access()
RETURNS TABLE (user_id uuid, email text, note text, granted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'only the owner can view tax access' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.user_id, u.email::text, a.note, a.granted_at
    FROM public.tax_access a JOIN auth.users u ON u.id = a.user_id ORDER BY a.granted_at;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_tax_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tax_access() TO authenticated;

CREATE TABLE IF NOT EXISTS public.tax_settings (
  key         text PRIMARY KEY CHECK (key IN ('vat', 'wht_referral')),
  label       text NOT NULL,
  description text,
  rate_pct    numeric(5,2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  is_active   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.tax_settings (key, label, description, rate_pct, is_active) VALUES
  ('vat', 'VAT on DealMatch fees', 'Added on top of DealMatch''s own fees at checkout. Not charged on rent, sale price or money held for others. Switch on only after VAT registration.', 7.50, false),
  ('wht_referral', 'Withholding tax on referral payouts', 'Held back from referral cash before it is paid, and recorded as tax owed. Placeholder rate: confirm with your accountant before switching on.', 10.00, false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads tax settings" ON public.tax_settings;
CREATE POLICY "Anyone reads tax settings" ON public.tax_settings FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.tax_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tax_setting_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  old_rate    numeric(5,2),
  new_rate    numeric(5,2) NOT NULL,
  old_active  boolean,
  new_active  boolean NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tax_setting_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tax readers read tax history" ON public.tax_setting_history;
CREATE POLICY "Tax readers read tax history" ON public.tax_setting_history FOR SELECT USING (public.can_read_tax());

-- Rate in force for a tax, or 0 when it is switched off.
CREATE OR REPLACE FUNCTION public.get_tax_rate(p_key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT COALESCE((SELECT rate_pct FROM public.tax_settings WHERE key = p_key AND is_active), 0) $$;
GRANT EXECUTE ON FUNCTION public.get_tax_rate(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_tax_setting(p_key text, p_rate numeric, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old public.tax_settings%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only the owner can change tax settings' USING ERRCODE = '42501';
  END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'rate must be between 0 and 100';
  END IF;
  SELECT * INTO v_old FROM public.tax_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown tax setting %', p_key; END IF;

  UPDATE public.tax_settings
     SET rate_pct = round(p_rate, 2), is_active = COALESCE(p_active, false), updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;
  INSERT INTO public.tax_setting_history (key, old_rate, new_rate, old_active, new_active, changed_by)
  VALUES (p_key, v_old.rate_pct, round(p_rate, 2), v_old.is_active, COALESCE(p_active, false), auth.uid());
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('tax_setting_changed', jsonb_build_object('key', p_key, 'old_rate', v_old.rate_pct, 'new_rate', round(p_rate, 2), 'old_active', v_old.is_active, 'new_active', COALESCE(p_active, false)), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_tax_setting(text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tax_setting(text, numeric, boolean) TO authenticated;

-- Tax owed to the authority. One row per payment and kind. Written only by the server.
CREATE TABLE IF NOT EXISTS public.tax_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('vat', 'wht')),
  purpose     text,
  base_kobo   bigint NOT NULL CHECK (base_kobo >= 0),
  rate_pct    numeric(5,2) NOT NULL,
  tax_kobo    bigint NOT NULL CHECK (tax_kobo >= 0),
  profile_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'remitted', 'reversed')),
  note        text,
  remitted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_ledger_one_per_reference_kind ON public.tax_ledger (reference, kind);
CREATE INDEX IF NOT EXISTS tax_ledger_status_created ON public.tax_ledger (status, created_at);
ALTER TABLE public.tax_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tax readers read tax ledger" ON public.tax_ledger;
CREATE POLICY "Tax readers read tax ledger" ON public.tax_ledger FOR SELECT USING (public.can_read_tax());
REVOKE INSERT, UPDATE, DELETE ON public.tax_ledger FROM anon, authenticated;

-- Mark everything owed up to a date as paid to the authority.
CREATE OR REPLACE FUNCTION public.admin_mark_tax_remitted(p_kind text, p_until timestamptz, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only the owner can record tax remittance' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('vat', 'wht') THEN RAISE EXCEPTION 'kind must be vat or wht'; END IF;
  UPDATE public.tax_ledger SET status = 'remitted', remitted_at = now(), note = COALESCE(p_note, note)
   WHERE kind = p_kind AND status = 'owed' AND created_at <= p_until;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('tax_remitted', jsonb_build_object('kind', p_kind, 'until', p_until, 'rows', n, 'note', p_note), auth.uid());
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_tax_remitted(text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_tax_remitted(text, timestamptz, text) TO authenticated;

-- ============================================================================
-- Campaign pages: reusable landing pages for ads and outreach, edited by staff
-- in the admin area with no code change.
--
-- What this adds (all new objects; nothing existing is altered):
--   campaign_pages      one row per page: slug, template, copy, facts, documents, photos
--   campaign_leads      enquiries from a page, saved with the consent text they agreed to
--   campaign_visits     visit counts per page, per day, per source tag
--   get_published_campaign(slug)   public read of one published page (no private fields)
--   submit_campaign_lead(...)      server-only: saves an enquiry (service_role)
--   record_campaign_visit(...)     server-only: counts a visit (service_role)
--   admin_campaign_stats()         staff-only: visits and enquiries per page and source
--   storage bucket campaign-images (public read, admin write)
--
-- Rules enforced in the database, not in the browser:
--   * A draft or archived page is never readable by the public.
--   * notify_email and created_by are never returned to the public.
--   * An enquiry needs consent, a name, and a phone or an email.
--   * A page that mentions escrow, verified or guarantee cannot be published until
--     trust_claims_approved is ticked on purpose. Escrow funding is off and nothing is
--     verified by default, so those words must be a deliberate choice.
--   * The public cannot call the lead or visit functions directly. They run behind a
--     rate-limited server route.
--
-- Rollback: set a page to draft (instant), or DROP the five new objects listed above.
-- Nothing else depends on them.
-- ============================================================================

-- 1. Pages --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_pages (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text        NOT NULL UNIQUE
                           CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 60),
  template               text        NOT NULL DEFAULT 'property_sale'
                           CHECK (template IN ('property_sale', 'platform_signup')),
  status                 text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published', 'archived')),
  title                  text        NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  headline               text        NOT NULL CHECK (length(trim(headline)) BETWEEN 3 AND 140),
  subheadline            text        CHECK (length(subheadline) <= 240),
  description            text        CHECK (length(description) <= 4000),
  facts                  jsonb       NOT NULL DEFAULT '[]'::jsonb
                           CHECK (jsonb_typeof(facts) = 'array' AND jsonb_array_length(facts) <= 12),
  documents              jsonb       NOT NULL DEFAULT '[]'::jsonb
                           CHECK (jsonb_typeof(documents) = 'array' AND jsonb_array_length(documents) <= 15),
  photos                 text[]      NOT NULL DEFAULT '{}'
                           CHECK (coalesce(array_length(photos, 1), 0) <= 12),
  disclosure             text        CHECK (length(disclosure) <= 300),
  cta_label              text        NOT NULL DEFAULT 'Send an enquiry' CHECK (length(cta_label) BETWEEN 2 AND 40),
  consent_text           text        NOT NULL
                           DEFAULT 'I agree that DealMatch may contact me about this enquiry and keep my details for that purpose.'
                           CHECK (length(consent_text) BETWEEN 20 AND 400),
  notify_email           text        CHECK (notify_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  show_support_whatsapp  boolean     NOT NULL DEFAULT false,
  trust_claims_approved  boolean     NOT NULL DEFAULT false,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  published_at           timestamptz
);

CREATE INDEX IF NOT EXISTS campaign_pages_status_idx ON public.campaign_pages (status);

CREATE OR REPLACE FUNCTION public.fn_campaign_page_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text text;
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'published' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_at := now();
    END IF;
    v_text := concat_ws(' ', NEW.title, NEW.headline, NEW.subheadline, NEW.description,
                        NEW.disclosure, NEW.facts::text, NEW.documents::text);
    IF v_text ~* '(escrow|verified|guarantee)' AND NOT NEW.trust_claims_approved THEN
      RAISE EXCEPTION 'This page mentions escrow, verified or guarantee. Tick "trust claims approved" only if that is true for this page.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_page_guard ON public.campaign_pages;
CREATE TRIGGER trg_campaign_page_guard
  BEFORE INSERT OR UPDATE ON public.campaign_pages
  FOR EACH ROW EXECUTE FUNCTION public.fn_campaign_page_guard();

ALTER TABLE public.campaign_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_pages FROM PUBLIC, anon;
DROP POLICY IF EXISTS campaign_pages_admin_all ON public.campaign_pages;
CREATE POLICY campaign_pages_admin_all ON public.campaign_pages
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS campaign_pages_staff_read ON public.campaign_pages;
CREATE POLICY campaign_pages_staff_read ON public.campaign_pages
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- 2. Enquiries ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid        NOT NULL REFERENCES public.campaign_pages(id) ON DELETE RESTRICT,
  name          text        NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  phone         text        CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  email         text        CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND length(email) <= 200),
  message       text        CHECK (length(message) <= 2000),
  consent_at    timestamptz NOT NULL,
  consent_text  text        NOT NULL,
  source        text        NOT NULL DEFAULT 'direct' CHECK (source ~ '^[a-z0-9_.-]{1,60}$'),
  utm           jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(utm) = 'object'),
  status        text        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  staff_notes   text        CHECK (length(staff_notes) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_leads_has_contact CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS campaign_leads_campaign_idx ON public.campaign_leads (campaign_id, created_at DESC);

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_leads FROM PUBLIC, anon;
DROP POLICY IF EXISTS campaign_leads_staff_read ON public.campaign_leads;
CREATE POLICY campaign_leads_staff_read ON public.campaign_leads
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS campaign_leads_staff_update ON public.campaign_leads;
CREATE POLICY campaign_leads_staff_update ON public.campaign_leads
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Staff may change only the follow-up fields, never the enquirer's words or consent record.
CREATE OR REPLACE FUNCTION public.fn_campaign_lead_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF (NEW.campaign_id, NEW.name, NEW.phone, NEW.email, NEW.message, NEW.consent_at, NEW.consent_text, NEW.source, NEW.utm, NEW.created_at)
     IS DISTINCT FROM
     (OLD.campaign_id, OLD.name, OLD.phone, OLD.email, OLD.message, OLD.consent_at, OLD.consent_text, OLD.source, OLD.utm, OLD.created_at) THEN
    RAISE EXCEPTION 'Only the status and notes of an enquiry can be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_lead_guard ON public.campaign_leads;
CREATE TRIGGER trg_campaign_lead_guard
  BEFORE UPDATE ON public.campaign_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_campaign_lead_guard();

-- 3. Visit counts -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_visits (
  campaign_id uuid    NOT NULL REFERENCES public.campaign_pages(id) ON DELETE CASCADE,
  day         date    NOT NULL,
  source      text    NOT NULL CHECK (source ~ '^[a-z0-9_.-]{1,60}$'),
  visits      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day, source)
);

ALTER TABLE public.campaign_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_visits FROM PUBLIC, anon;
DROP POLICY IF EXISTS campaign_visits_staff_read ON public.campaign_visits;
CREATE POLICY campaign_visits_staff_read ON public.campaign_visits
  FOR SELECT TO authenticated USING (public.is_staff());

-- 4. Public read of one published page ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_published_campaign(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'template', c.template,
    'title', c.title, 'headline', c.headline, 'subheadline', c.subheadline,
    'description', c.description, 'facts', c.facts, 'documents', c.documents,
    'photos', to_jsonb(c.photos), 'disclosure', c.disclosure,
    'cta_label', c.cta_label, 'consent_text', c.consent_text,
    'show_support_whatsapp', c.show_support_whatsapp,
    'published_at', c.published_at)
  FROM public.campaign_pages c
  WHERE c.slug = lower(p_slug) AND c.status = 'published';
$$;

REVOKE ALL ON FUNCTION public.get_published_campaign(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_campaign(text) TO anon, authenticated, service_role;

-- 5. Save an enquiry (server route only) -------------------------------------
CREATE OR REPLACE FUNCTION public.submit_campaign_lead(
  p_slug    text,
  p_name    text,
  p_phone   text,
  p_email   text,
  p_message text,
  p_consent boolean,
  p_source  text DEFAULT 'direct',
  p_utm     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page   public.campaign_pages%ROWTYPE;
  v_phone  text := NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email  text := NULLIF(lower(trim(coalesce(p_email, ''))), '');
  v_source text := lower(coalesce(NULLIF(trim(p_source), ''), 'direct'));
  v_id     uuid;
  v_dupe   uuid;
BEGIN
  SELECT * INTO v_page FROM public.campaign_pages WHERE slug = lower(p_slug) AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'This page is not taking enquiries'; END IF;
  IF p_consent IS NOT TRUE THEN RAISE EXCEPTION 'Please tick the consent box so we may contact you'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'Please enter your name'; END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN RAISE EXCEPTION 'Please give a phone number or an email'; END IF;
  IF v_source !~ '^[a-z0-9_.-]{1,60}$' THEN v_source := 'other'; END IF;

  -- The same person pressing send twice returns the first enquiry instead of a second one.
  SELECT id INTO v_dupe FROM public.campaign_leads
   WHERE campaign_id = v_page.id
     AND created_at > now() - interval '10 minutes'
     AND ((v_phone IS NOT NULL AND phone = v_phone) OR (v_email IS NOT NULL AND email = v_email))
   LIMIT 1;
  IF v_dupe IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_dupe, 'duplicate', true, 'notify_email', v_page.notify_email, 'title', v_page.title);
  END IF;

  -- A burst on one page is held back, whoever is sending it.
  IF (SELECT count(*) FROM public.campaign_leads
       WHERE campaign_id = v_page.id AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Too many enquiries right now. Please try again in a few minutes.';
  END IF;

  INSERT INTO public.campaign_leads
    (campaign_id, name, phone, email, message, consent_at, consent_text, source, utm)
  VALUES
    (v_page.id, trim(p_name), v_phone, v_email, NULLIF(trim(coalesce(p_message, '')), ''),
     now(), v_page.consent_text, v_source,
     CASE WHEN jsonb_typeof(coalesce(p_utm, '{}'::jsonb)) = 'object' THEN coalesce(p_utm, '{}'::jsonb) ELSE '{}'::jsonb END)
  RETURNING id INTO v_id;

  -- In-app alert for admins.
  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT p.id, 'campaign_lead', 'New enquiry: ' || v_page.title,
         trim(p_name) || ' sent an enquiry from the "' || v_page.title || '" page.',
         '/admin/campaigns'
    FROM public.profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('id', v_id, 'duplicate', false, 'notify_email', v_page.notify_email, 'title', v_page.title);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_campaign_lead(text, text, text, text, text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_campaign_lead(text, text, text, text, text, boolean, text, jsonb) TO service_role;

-- 6. Count a visit (server route only) ----------------------------------------
CREATE OR REPLACE FUNCTION public.record_campaign_visit(p_slug text, p_source text DEFAULT 'direct')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id     uuid;
  v_source text := lower(coalesce(NULLIF(trim(p_source), ''), 'direct'));
BEGIN
  SELECT id INTO v_id FROM public.campaign_pages WHERE slug = lower(p_slug) AND status = 'published';
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_source !~ '^[a-z0-9_.-]{1,60}$' THEN v_source := 'other'; END IF;
  INSERT INTO public.campaign_visits (campaign_id, day, source, visits)
  VALUES (v_id, (now() AT TIME ZONE 'Africa/Lagos')::date, v_source, 1)
  ON CONFLICT (campaign_id, day, source) DO UPDATE SET visits = public.campaign_visits.visits + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_visit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_visit(text, text) TO service_role;

-- 7. Staff summary: visits and enquiries per page and source --------------------
CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE (campaign_id uuid, slug text, title text, status text, source text, visits bigint, leads bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH v AS (
    SELECT cv.campaign_id, cv.source, sum(cv.visits)::bigint AS visits
      FROM public.campaign_visits cv GROUP BY cv.campaign_id, cv.source
  ), l AS (
    SELECT cl.campaign_id, cl.source, count(*)::bigint AS leads
      FROM public.campaign_leads cl GROUP BY cl.campaign_id, cl.source
  )
  SELECT c.id, c.slug, c.title, c.status, s.source,
         coalesce(v.visits, 0), coalesce(l.leads, 0)
    FROM public.campaign_pages c
    LEFT JOIN (SELECT x.campaign_id, x.source FROM public.campaign_visits x
               UNION SELECT y.campaign_id, y.source FROM public.campaign_leads y) s ON s.campaign_id = c.id
    LEFT JOIN v ON v.campaign_id = c.id AND v.source = s.source
    LEFT JOIN l ON l.campaign_id = c.id AND l.source = s.source
   ORDER BY c.created_at DESC, s.source;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_stats() TO authenticated;

-- 8. Photos --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('campaign-images', 'campaign-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname = 'campaign_images_admin_write') THEN
    CREATE POLICY campaign_images_admin_write ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'campaign-images' AND public.is_admin())
      WITH CHECK (bucket_id = 'campaign-images' AND public.is_admin());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Testimonials: user-submitted, admin-moderated
-- Run this once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  role_label  text,                          -- e.g. "Tenant, Lekki" - free text, user's own words
  content     text not null,
  rating      smallint not null default 5 check (rating between 1 and 5),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_testimonials_status ON public.testimonials(status);
CREATE INDEX IF NOT EXISTS idx_testimonials_user    ON public.testimonials(user_id);

-- Reuse the existing generic text sanitizer (strips script tags / event
-- handlers / javascript: URLs) that properties already use - same
-- protection applied here at the DB layer, not just relying on React's
-- escaping on the way out.
CREATE OR REPLACE FUNCTION public.fn_sanitize_testimonial_inputs()
RETURNS trigger AS $$
BEGIN
  NEW.name       := public.fn_sanitize_text(COALESCE(NEW.name, ''));
  NEW.role_label := public.fn_sanitize_text(COALESCE(NEW.role_label, ''));
  NEW.content    := public.fn_sanitize_text(COALESCE(NEW.content, ''));
  -- Hard length caps regardless of what the client sends
  NEW.name       := left(NEW.name, 80);
  NEW.role_label := left(NEW.role_label, 80);
  NEW.content    := left(NEW.content, 600);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sanitize_testimonial ON public.testimonials;
CREATE TRIGGER trg_sanitize_testimonial
  BEFORE INSERT OR UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_testimonial_inputs();

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public reads approved testimonials" ON public.testimonials;
DROP POLICY IF EXISTS "Users read own testimonials"        ON public.testimonials;
DROP POLICY IF EXISTS "Users submit own testimonial"        ON public.testimonials;

-- Anyone (including logged-out visitors) can read APPROVED testimonials only
CREATE POLICY "Public reads approved testimonials" ON public.testimonials
  FOR SELECT USING (status = 'approved');

-- A user can also see their own submission regardless of status
-- (so they can see "pending review" state on their own dashboard)
CREATE POLICY "Users read own testimonials" ON public.testimonials
  FOR SELECT USING (user_id = auth.uid());

-- A logged-in user can submit exactly one testimonial for themselves,
-- always starting as 'pending' - they cannot self-approve.
CREATE POLICY "Users submit own testimonial" ON public.testimonials
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.testimonials t
      WHERE t.user_id = auth.uid() AND t.status <> 'rejected'
    )
  );

-- No client-side UPDATE or DELETE policy on purpose: approving, rejecting,
-- or removing a testimonial only happens server-side via the admin API
-- (api/admin/testimonials.js) using the service-role key, which bypasses
-- RLS. This prevents a user from ever editing their own row's status.

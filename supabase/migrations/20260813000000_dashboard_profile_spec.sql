-- ============================================================================
-- Dashboard & Profile rebuild support - August 2026
--
-- Supports the new Dashboard/Profile spec (unified "Find a Place" /
-- "Find a Provider", a real My Requests stat, and an honest "Become a
-- Provider" toggle instead of an inferred one). Three schema gaps found
-- while implementing it, in a NEW migration file rather than editing
-- 20260812000000_production_hardening.sql, which has already been applied
-- to production - editing an already-shipped migration in place would
-- create drift between what's in this repo and what's actually deployed.
-- ============================================================================

-- ── 0. SECURITY FIX: admin_deal_pipeline was missing security_invoker too ──
-- This view was added in the previous migration (20260812000000) and is
-- ALREADY LIVE. It's queried directly from the browser in AdminPage.jsx's
-- PipelineTab (supabase.from('admin_deal_pipeline').select('*')) -- not
-- through a server-side admin-checked route, despite what that view's own
-- comment claimed ("access controlled by the querying API route"). Without
-- security_invoker, the view runs with its OWNER's privileges (typically
-- `postgres` in Supabase, which can bypass RLS) rather than the querying
-- user's -- meaning any authenticated user who discovered the view name
-- could potentially query it directly and see every deal across the whole
-- platform: buyer/seller/requester/provider identities, listing titles,
-- amounts. ALTER VIEW ... SET fixes an existing view in place without
-- needing to redefine it. Fixed here, forward, rather than editing the
-- already-applied 20260812000000 file (which would create drift between
-- what's in this repo and what's actually deployed).
ALTER VIEW public.admin_deal_pipeline SET (security_invoker = true);

-- Side effect of the fix above, caught while verifying it: transactions
-- (ADR-009's job/bidding table) has NO staff-read policy at all --
-- transactions_select_participant only matches auth.uid() = requester_id
-- OR provider_id. Every other participant-scoped table in this schema
-- (escrow_transactions, rental_enquiries, etc.) has a staff-bypass clause
-- alongside its participant clause; this one never did. Before this fix,
-- security_invoker=true would have made admin_deal_pipeline silently show
-- only the legacy escrow-sourced half of the pipeline to staff (since
-- escrow_transactions does have staff read) and none of the newer
-- category-transactions half -- an incomplete Pipeline tab, not a security
-- hole, but still wrong. Additive policy, doesn't touch the existing one.
DROP POLICY IF EXISTS transactions_select_staff ON public.transactions;
CREATE POLICY transactions_select_staff ON public.transactions
  FOR SELECT USING (public.is_admin_staff());


-- ── 1. "Become a provider" needs a real toggle, not an inferred signal ─────
-- Previously the only traces of "is this person a provider" were a
-- verified_providers row (staff-approved only, via ADR-008) or a
-- verification_submissions row (self-submitted evidence, added in the
-- previous hardening pass) -- there was no way for someone to say "yes, I
-- want to offer services" as a first step, before they've necessarily
-- gathered portfolio evidence to submit. This is that flag.
--
-- Important: turning this on is a statement of intent ONLY. It does not
-- grant provider status, does not bypass verification, and is never read
-- by any matching/search/payout logic. The provider ladder (Pending ->
-- Identity Verified -> Skill Verified -> Trusted) still requires going
-- through submit_verification() / review_verification_submission() exactly
-- as before. This column only controls whether the Profile page shows the
-- Provider section and prompts the person to complete verification -- an
-- honest UI state instead of a guess.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS offers_services BOOLEAN NOT NULL DEFAULT false;


-- ── 2. rental_enquiries had no user_id column at all ────────────────────────
-- It was designed for fully anonymous/guest submissions (tenant_name/
-- tenant_phone as free text) -- a signed-in user's own rental enquiries
-- could never be attributed to their account, and the only SELECT policies
-- that existed were staff-only ("Admin reads enquiries" / "Staff reads
-- rental enquiries") -- a regular user could not see even their own
-- enquiries. Needed so the Dashboard's "My Requests" stat/feed can include
-- rental enquiries at all. Nullable: a true guest (no session) still
-- submits with user_id = NULL exactly as before; this only adds
-- attribution when a session exists (see RentalsPage.jsx's InterestModal,
-- updated in this pass to pass user?.id).

ALTER TABLE public.rental_enquiries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rental_enquiries_user ON public.rental_enquiries(user_id) WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "Users see own rental enquiries" ON public.rental_enquiries;
CREATE POLICY "Users see own rental enquiries" ON public.rental_enquiries
  FOR SELECT USING (auth.uid() = user_id);


-- ── 3. Unified "My Requests" across three separate tables ───────────────────
-- A request can currently land in one of three places depending on what
-- was asked for: rental_enquiries (asked about a rental/shortlet),
-- professional_requests (asked for a professional), or transactions where
-- the user is requester_id (posted a job / asked for a bid, ADR-009). This
-- view unions all three into one read model for the Dashboard's "My
-- Requests" stat and "My Activity" feed, so the client issues one query
-- instead of three and doesn't need to know about the underlying schema
-- split. Security note: this is a security-definer-free plain view -- it
-- inherits the RLS of all three underlying tables (each already scoped to
-- auth.uid() via the policies above / pre-existing ones), so a caller only
-- ever sees rows they were already entitled to see individually.

-- SECURITY: security_invoker = true is not optional here. Without it, a
-- view defaults to running with the VIEW OWNER's privileges (typically
-- the `postgres` role in Supabase, which can bypass RLS) rather than the
-- querying user's -- meaning every signed-in user querying this view
-- would see every OTHER user's rental enquiries, professional requests,
-- and job requests, not just their own. admin_deal_pipeline (the earlier
-- pipeline view) sidesteps this by only ever being queried through an
-- admin-authenticated surface; this view is queried directly by ordinary
-- users from the client, so it must enforce RLS as the caller, explicitly.
CREATE OR REPLACE VIEW public.my_requests
WITH (security_invoker = true) AS
  SELECT
    'rental'::text          AS request_type,
    re.id::text             AS request_id,
    re.user_id              AS user_id,
    COALESCE(p.title, 'Rental enquiry') AS title,
    re.status                AS status,
    re.created_at             AS created_at
  FROM public.rental_enquiries re
  LEFT JOIN public.properties p ON p.id = re.property_id
  WHERE re.user_id IS NOT NULL

  UNION ALL

  SELECT
    'professional'::text     AS request_type,
    pr.id::text              AS request_id,
    pr.user_id               AS user_id,
    COALESCE(pr.professional_name, pr.professional_type, 'Professional request') AS title,
    pr.status                 AS status,
    pr.created_at              AS created_at
  FROM public.professional_requests pr
  WHERE pr.user_id IS NOT NULL

  UNION ALL

  SELECT
    'job'::text               AS request_type,
    t.id::text                AS request_id,
    t.requester_id            AS user_id,
    COALESCE(cl.title, 'Job request') AS title,
    t.status                   AS status,
    t.created_at                AS created_at
  FROM public.transactions t
  LEFT JOIN public.category_listings cl ON cl.id = t.listing_id
  WHERE t.requester_id IS NOT NULL;

COMMENT ON VIEW public.my_requests IS
  'Unified read model across rental_enquiries, professional_requests, and '
  'transactions(requester_id) for the Dashboard My Requests stat/feed. '
  'Plain view (no SECURITY DEFINER) -- relies entirely on each underlying '
  'table''s own RLS, so callers only ever see their own rows.';

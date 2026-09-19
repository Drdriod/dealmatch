-- ============================================================================
-- Production hardening pass - August 2026
--
-- Fixes three concrete gaps found in a full architecture review against the
-- product handoff spec (see DealMatch_Architecture_Gap_Analysis.pdf):
--
--   1. SECURITY FIX: PropertyPage.jsx's getProperty() joined
--      profiles(full_name, phone, avatar_url) directly and the "Contact"
--      button opened WhatsApp with that number unconditionally - no escrow
--      check. RLS on `profiles` happened to block the join for most viewers
--      (SELECT policies only allow auth.uid() = id OR staff), so in practice
--      the button silently fell back to a hardcoded platform number instead
--      of leaking the real seller's phone - but that was incidental, not
--      designed, and any future policy change (or the existing staff/agent
--      read-all-profiles policy) could turn this into a real PII leak. This
--      migration adds a single, explicit, auditable gate:
--      get_property_contact(property_id) - SECURITY DEFINER, returns the
--      seller's contact only to the seller, staff, or a party to a FUNDED
--      escrow transaction on that property. Everyone else gets NULL.
--
--   2. Verification is currently two disconnected systems: profiles.
--      identity_verification_status (unverified/submitted/approved/rejected,
--      written by VerifyIdentityPage) and verified_providers.level (ADR-008's
--      0-3 Identity/Skill/Trusted ladder, read-only in the app - nothing
--      ever writes to it). This adds the missing middle piece: a
--      verification_submissions queue that a provider can insert into
--      (their own evidence - ID docs for level 1, portfolio for level 2)
--      and staff review through a controlled RPC that is the ONLY way
--      verified_providers.level moves. Providers still cannot self-escalate
--      (same guarantee ADR-008 already established).
--
--   3. Admin/ops CRM gap: no unified "match request" pipeline view existed
--      across the legacy properties/escrow_transactions world and the newer
--      category_listings/transactions (ADR-009) world. Adds
--      admin_deal_pipeline, a read-only view unioning both into one
--      Enquiry -> Negotiation -> Agreed -> Paid (Escrow) -> Completed ->
--      Commissioned pipeline for the admin CRM's new "Pipeline" tab.
--
--   4. SCHEMA FIX: escrow_transactions was missing four columns
--      (payment_ref, funded_at, released_at, created_at) that existing
--      code already assumed -- both webhook handlers and the baseline
--      schema's own deed-completion trigger reference them. Every escrow
--      confirmation, on every category that uses this table, has been
--      silently failing since these were never added. See section 0 below.
--      A companion fix in api/paystack-webhook.js corrects two more wrong
--      column names (platform_fee/amount -> platform_amount/gross_amount)
--      and a status-value mismatch ('confirmed' -> 'funded') in the same
--      handler, plus the admin Transactions tab's escrow query in
--      AdminPage.jsx had the identical wrong-column-name bug.
--
-- Written IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout, same pattern
-- as ADR-008/009, so it runs cleanly against a live database without
-- assuming a pristine starting shape.
-- ============================================================================

-- ── 0. Missing columns on escrow_transactions ───────────────────────────────
-- Several existing pieces of code already assumed columns that were never
-- actually added to escrow_transactions in the baseline schema:
--   - payment_ref  -- both api/paystack-webhook.js and api/escrow-webhook.js
--     resolve rows by .eq('payment_ref', reference); without this column
--     every escrow confirmation attempt (Paystack AND crypto) has been
--     failing at the query step with a Postgres "column does not exist"
--     error, silently logged and swallowed.
--   - funded_at, released_at -- api/escrow-webhook.js and the baseline
--     schema's own fn_check_deed_completion() trigger set these; same
--     failure mode, and it means the sale-completion deed-verification
--     auto-release path has never worked either.
--   - created_at -- needed for admin_deal_pipeline (below) to sort/display
--     deals; every other transactional table in the schema has one, this
--     one was simply missed.
-- This was caught while fixing the property contact-reveal leak (see
-- get_property_contact() below), which needed a real, working "was this
-- escrow actually funded" signal to check against.

ALTER TABLE public.escrow_transactions ADD COLUMN IF NOT EXISTS payment_ref TEXT;
ALTER TABLE public.escrow_transactions ADD COLUMN IF NOT EXISTS funded_at   TIMESTAMPTZ;
ALTER TABLE public.escrow_transactions ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE public.escrow_transactions ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_escrow_transactions_payment_ref
  ON public.escrow_transactions(payment_ref) WHERE payment_ref IS NOT NULL;


-- ── 1. Escrow-gated contact reveal (RPC, not a raw client join) ────────────

CREATE OR REPLACE FUNCTION public.get_property_contact(p_property_id UUID)
RETURNS TABLE (full_name TEXT, phone TEXT, avatar_url TEXT, unlocked_reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
  v_caller    UUID := auth.uid();
  v_reason    TEXT := NULL;
BEGIN
  SELECT seller_id INTO v_seller_id FROM public.properties WHERE id = p_property_id;
  IF v_seller_id IS NULL THEN
    RETURN; -- property not found - return no rows, not an error (avoid leaking existence)
  END IF;

  IF v_caller IS NOT NULL AND v_caller = v_seller_id THEN
    v_reason := 'owner';
  ELSIF public.is_admin_staff() THEN
    v_reason := 'staff';
  ELSIF v_caller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.escrow_transactions et
    WHERE et.property_id = p_property_id
      AND et.status = 'funded'
      AND (et.buyer_id = v_caller OR et.tenant_id = v_caller OR et.seller_id = v_caller)
  ) THEN
    v_reason := 'escrow_funded';
  END IF;

  IF v_reason IS NULL THEN
    RETURN; -- not entitled: no rows, no phone, no name beyond what's already public
  END IF;

  RETURN QUERY
    SELECT p.full_name, p.phone, p.avatar_url, v_reason
    FROM public.profiles p
    WHERE p.id = v_seller_id;
END;
$$;

COMMENT ON FUNCTION public.get_property_contact IS
  'The only sanctioned path to a property seller''s phone number. Returns '
  'rows only to the seller themselves, staff, or a funded-escrow '
  'counterparty - never to a browsing visitor. Superseded the previous '
  'client-side getProperty() join on profiles(phone), which relied on RLS '
  'as an accidental backstop instead of an explicit, auditable rule.';

REVOKE ALL ON FUNCTION public.get_property_contact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_property_contact(UUID) TO authenticated, anon;
-- Granted to anon too - anonymous visitors are allowed to CALL this (so the
-- page doesn't need a login check just to ask), but as coded above they can
-- never actually be the seller/staff/escrow party, so they always get zero
-- rows. This keeps one code path instead of branching client-side on auth
-- state just to decide whether to attempt the call.


-- ── 2. Verification submissions queue (ADR-008's missing write path) ───────

CREATE TABLE IF NOT EXISTS public.verification_submissions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level            SMALLINT NOT NULL CHECK (level IN (1, 2)),  -- 1 = Identity, 2 = Skill (level 3/Trusted is system-computed, not submitted)
  kind             TEXT NOT NULL,                               -- e.g. 'identity_document', 'portfolio'
  submission_data  JSONB NOT NULL DEFAULT '{}'::jsonb,           -- doc/photo storage paths, description, years_experience, references
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      UUID REFERENCES auth.users(id),
  reviewed_at      TIMESTAMPTZ,
  admin_note       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_submissions_status ON public.verification_submissions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_verification_submissions_user   ON public.verification_submissions(user_id);

ALTER TABLE public.verification_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verification_submissions_select_own ON public.verification_submissions;
CREATE POLICY verification_submissions_select_own ON public.verification_submissions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_staff());

DROP POLICY IF EXISTS verification_submissions_insert_own ON public.verification_submissions;
CREATE POLICY verification_submissions_insert_own ON public.verification_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No client UPDATE policy at all: status can only move via the SECURITY
-- DEFINER review RPC below, called from an admin-authenticated API route.
DROP POLICY IF EXISTS verification_submissions_no_client_write ON public.verification_submissions;
CREATE POLICY verification_submissions_no_client_write ON public.verification_submissions
  FOR UPDATE USING (false);

-- Rate limit at the data layer too (defence in depth alongside the API's
-- Redis rate limit): a user may not have more than one PENDING submission
-- per level at a time - stops spamming the queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_submissions_pending
  ON public.verification_submissions(user_id, level) WHERE status = 'pending';


CREATE OR REPLACE FUNCTION public.submit_verification(
  p_level SMALLINT,
  p_kind  TEXT,
  p_data  JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF p_level NOT IN (1, 2) THEN
    RAISE EXCEPTION 'level must be 1 (Identity) or 2 (Skill)';
  END IF;

  INSERT INTO public.verification_submissions (user_id, level, kind, submission_data)
  VALUES (auth.uid(), p_level, p_kind, COALESCE(p_data, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.submit_verification IS
  'Client-callable: a provider submits evidence for Identity (1) or Skill '
  '(2) review. Never touches verified_providers or profiles directly - '
  'only staff review_verification_submission() can do that.';

GRANT EXECUTE ON FUNCTION public.submit_verification(SMALLINT, TEXT, JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.review_verification_submission(
  p_submission_id BIGINT,
  p_approve       BOOLEAN,
  p_note          TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.verification_submissions%ROWTYPE;
  v_current_level SMALLINT;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'Only staff may review verification submissions';
  END IF;

  SELECT * INTO v_sub FROM public.verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Submission % not found', p_submission_id;
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission % already reviewed (%)', p_submission_id, v_sub.status;
  END IF;

  UPDATE public.verification_submissions
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_note = p_note
  WHERE id = p_submission_id;

  IF p_approve THEN
    SELECT COALESCE(level, 0) INTO v_current_level FROM public.verified_providers WHERE user_id = v_sub.user_id;
    -- Only move forward, never backward, via approval (demotion is a
    -- separate explicit staff action, see demote_verification_level below).
    IF v_current_level IS NULL OR v_current_level < v_sub.level THEN
      PERFORM public.set_verification_level(v_sub.user_id, v_sub.level, v_sub.submission_data);
    END IF;

    IF v_sub.level = 1 THEN
      UPDATE public.profiles SET identity_verification_status = 'approved' WHERE id = v_sub.user_id;
    END IF;
  ELSE
    IF v_sub.level = 1 THEN
      UPDATE public.profiles SET identity_verification_status = 'rejected' WHERE id = v_sub.user_id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.review_verification_submission IS
  'Staff-only (checked inside the function, not just by the caller). The '
  'sole path from a pending submission to verified_providers.level moving '
  'up, or profiles.identity_verification_status changing. Call only from '
  'an admin-authenticated API route.';

GRANT EXECUTE ON FUNCTION public.review_verification_submission(BIGINT, BOOLEAN, TEXT) TO authenticated;
-- Granted to `authenticated` broadly because the function enforces the
-- is_admin_staff() check internally - granting narrowly to a Postgres role
-- would require mapping Supabase auth roles 1:1 to Postgres roles, which
-- this schema doesn't do elsewhere either (same pattern as set_verification_level).


CREATE OR REPLACE FUNCTION public.demote_verification_level(
  p_user_id UUID,
  p_note    TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'Only staff may demote a provider''s verification level';
  END IF;
  PERFORM public.set_verification_level(p_user_id, 0, jsonb_build_object('demoted_reason', p_note, 'demoted_at', now()));
  UPDATE public.profiles SET identity_verification_status = 'unverified' WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.demote_verification_level IS
  'Staff-only manual demotion for bad behaviour / fake completion claims '
  '(handoff doc section 5, Step 4). Resets to level 0 - the provider must '
  're-submit evidence to climb back up.';

GRANT EXECUTE ON FUNCTION public.demote_verification_level(UUID, TEXT) TO authenticated;


-- ── 3. Admin CRM: unified deal pipeline view ────────────────────────────────
-- Maps both the legacy (properties/escrow_transactions) and ADR-009
-- (category_listings/transactions) worlds onto one set of pipeline stages,
-- so the admin "Pipeline" tab has a single source to query.

CREATE OR REPLACE VIEW public.admin_deal_pipeline AS
  SELECT
    'legacy'::text                                AS source,
    et.id::text                                    AS deal_id,
    et.property_id::text                           AS listing_id,
    p.title                                        AS listing_title,
    et.buyer_id                                    AS requester_id,
    et.seller_id                                    AS provider_id,
    et.gross_amount                                AS amount,
    CASE et.status
      WHEN 'pending'          THEN 'enquiry'
      WHEN 'awaiting_payment' THEN 'negotiation'
      WHEN 'funded'           THEN 'paid_escrow'
      WHEN 'completed'        THEN 'completed'
      WHEN 'disputed'         THEN 'disputed'
      WHEN 'cancelled'        THEN 'lost'
      WHEN 'refunded'         THEN 'lost'
      ELSE 'enquiry'
    END                                             AS pipeline_stage,
    (et.referral_payout IS NOT NULL AND et.referral_payout > 0
       AND et.payout_processed_at IS NOT NULL)      AS commissioned,
    et.created_at,
    et.confirmed_at                                 AS updated_at
  FROM public.escrow_transactions et
  LEFT JOIN public.properties p ON p.id = et.property_id

  UNION ALL

  SELECT
    'category'::text                                AS source,
    t.id::text                                       AS deal_id,
    t.listing_id::text                               AS listing_id,
    COALESCE(cl.title, t.model::text)                AS listing_title,
    t.requester_id                                   AS requester_id,
    t.provider_id                                    AS provider_id,
    COALESCE(t.amount_cents, 0) / 100.0              AS amount,
    CASE t.status
      WHEN 'OPEN'      THEN 'enquiry'
      WHEN 'PENDING'   THEN 'negotiation'
      WHEN 'FUNDED'    THEN 'paid_escrow'
      WHEN 'COMPLETED' THEN 'completed'
      WHEN 'DISPUTED'  THEN 'disputed'
      WHEN 'CANCELLED' THEN 'lost'
      ELSE 'enquiry'
    END                                               AS pipeline_stage,
    (t.commission_amount_cents IS NOT NULL AND t.commission_amount_cents > 0
       AND t.status = 'COMPLETED')                   AS commissioned,
    t.created_at,
    t.updated_at
  FROM public.transactions t
  LEFT JOIN public.category_listings cl ON cl.id = t.listing_id;

COMMENT ON VIEW public.admin_deal_pipeline IS
  'Unified Enquiry -> Negotiation -> Paid (Escrow) -> Completed -> '
  'Commissioned / Lost pipeline across both the legacy Real Estate escrow '
  'world and the ADR-009 category transactions world. Backs the admin '
  '"Pipeline" tab. Read-only view - access controlled by the querying '
  'API route checking is_admin_staff(), not by view-level RLS (views '
  'inherit the RLS of their underlying tables, both of which already '
  'restrict to participant-or-staff; staff callers see everything through '
  'their own staff-read policies).';


-- ── 3b. Legacy property escrow: the missing pre-payment row creation ───────
-- EscrowPage.jsx's request modal took payment via Paystack but never wrote
-- an escrow_transactions row first. The webhook (by design, per the
-- comment above its escrow_payment case) resolves the row strictly by
-- payment_ref, written server-side before payment starts - the same
-- anti-spoofing pattern ADR-009's start_escrow_payment already established
-- for the job/bidding flow (20260731000020). That pre-creation step simply
-- never existed for the property/rental vertical, so a tenant paying
-- through /escrow had their payment succeed at Paystack while the webhook
-- logged "no matching payment_ref, refusing to confirm" and the escrow was
-- never marked funded - meaning get_property_contact() could never
-- legitimately unlock contact even after a real payment. This RPC is that
-- missing step, mirroring start_escrow_payment's authorization shape.

CREATE OR REPLACE FUNCTION public.start_property_escrow_payment(
  p_property_id       UUID,
  p_reference          TEXT,
  p_transaction_type   TEXT,   -- 'rental' | 'sale' | 'hotel'
  p_gross_amount       NUMERIC,
  p_tenant_name        TEXT,
  p_tenant_phone       TEXT,
  p_move_in_date       DATE DEFAULT NULL
) RETURNS public.escrow_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
  v_fee_per_party NUMERIC;
  v_row public.escrow_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to start an escrow payment';
  END IF;
  IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'A valid amount is required';
  END IF;
  IF p_transaction_type NOT IN ('rental', 'sale', 'hotel') THEN
    RAISE EXCEPTION 'transaction_type must be rental, sale, or hotel';
  END IF;

  SELECT seller_id INTO v_seller_id FROM public.properties WHERE id = p_property_id;
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'property % not found', p_property_id;
  END IF;

  -- Same 3.75% + 3.75% = 7.5% total split EscrowPage.jsx already computes
  -- client-side for display; captured here as the authoritative figure so
  -- the webhook never has to trust a client-supplied fee again.
  v_fee_per_party := ROUND(p_gross_amount * 0.0375, 2);

  INSERT INTO public.escrow_transactions (
    property_id, buyer_id, seller_id, tenant_id, status, transaction_type,
    gross_amount, platform_pct, platform_amount,
    fee_from_tenant, fee_from_landlord, landlord_receives,
    move_in_date, payment_ref
  ) VALUES (
    p_property_id, auth.uid(), v_seller_id, auth.uid(), 'awaiting_payment', p_transaction_type,
    p_gross_amount, 0.075, v_fee_per_party * 2,
    v_fee_per_party, v_fee_per_party, p_gross_amount - v_fee_per_party,
    p_move_in_date, p_reference
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.start_property_escrow_payment IS
  'The missing pre-payment step for the property/rental escrow flow: '
  'writes payment_ref server-side, authoritatively, before the Paystack '
  'widget ever opens, so the webhook has a real row to resolve and confirm. '
  'Without this, /escrow payments succeeded at Paystack but were never '
  'reflected in escrow_transactions at all.';

GRANT EXECUTE ON FUNCTION public.start_property_escrow_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE) TO authenticated;

-- No direct client INSERT policy exists on escrow_transactions (confirmed:
-- only SELECT/UPDATE policies exist in earlier migrations) -- RLS denies by
-- default, so row creation already could only happen through this RPC or
-- the service-role key. Documenting that explicitly here since it's easy
-- to assume otherwise: same pattern as `transactions` in ADR-009, where
-- the SECURITY DEFINER RPC (which sets seller_id from the property record,
-- never from client input) is the only sanctioned insert path.


-- ── 5. Storage bucket for Skill Verification portfolio uploads ─────────────
-- Mirrors the identity-docs bucket pattern exactly (private, path-scoped
-- by auth.uid() as the first folder segment, staff can read any, owner
-- can read/write their own). Portfolio evidence (work photos/videos) is
-- lower-sensitivity than ID documents but still not meant to be public
-- until a submission is approved and surfaced on the provider's profile,
-- so it gets the same private-bucket treatment rather than the public
-- 'avatars' bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-portfolio', 'provider-portfolio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own portfolio media" ON storage.objects;
CREATE POLICY "Users upload own portfolio media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'provider-portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner reads own portfolio media" ON storage.objects;
CREATE POLICY "Owner reads own portfolio media" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'provider-portfolio'
    AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin_staff())
  );

DROP POLICY IF EXISTS "Users delete own portfolio media" ON storage.objects;
CREATE POLICY "Users delete own portfolio media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'provider-portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);


-- api/send-email.js and api/send-whatsapp.js previously had no auth, no
-- rate limit, and no record of who triggered a send - meaning anyone who
-- found the endpoint could relay unlimited email/WhatsApp messages through
-- DealMatch's Resend/WhatsApp Business credits to any address, silently.
-- This table gives those (now auth + rate-limited, see api/ changes)
-- endpoints somewhere to record who sent what to whom, so abuse is
-- traceable and a compromised/malicious account can be identified and
-- suspended quickly.

CREATE TABLE IF NOT EXISTS public.outbound_message_log (
  id           BIGSERIAL PRIMARY KEY,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  sender_id    UUID REFERENCES auth.users(id),
  recipient    TEXT NOT NULL,
  subject      TEXT,
  status       TEXT NOT NULL DEFAULT 'sent',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_message_log_sender ON public.outbound_message_log(sender_id, created_at DESC);

ALTER TABLE public.outbound_message_log ENABLE ROW LEVEL SECURITY;
-- Service-role only (the two API routes use the service-role key to
-- insert); no client SELECT/INSERT policy at all is intentional - even
-- staff read this through the admin API, not directly, to keep one
-- consistent auth check point.
DROP POLICY IF EXISTS outbound_message_log_no_client_access ON public.outbound_message_log;
CREATE POLICY outbound_message_log_no_client_access ON public.outbound_message_log
  FOR ALL USING (false) WITH CHECK (false);

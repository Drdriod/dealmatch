-- 20. Protected transactions: one read model, an append-only event log, terms snapshot and
--     dispute cases.   Backlog items DB-3, DB-5, DB-6 (docs/FULL_STACK_BACKLOG.md).
--
-- Why
--   * Screens had no single answer to "what state is this payment in, and what can I do next".
--     public.protected_transactions is that answer, read-only, with the display states the
--     interface shows. It is a view over public.transactions. escrow_transactions and bookings
--     get a UNION ALL branch later; the front end does not change when they do.
--   * Nothing recorded who did what. transaction_events and dispute_events are append-only logs
--     written by triggers and by the case functions below, never by a browser.
--   * The terms a payment was agreed on were not kept. When a transaction becomes FUNDED the
--     amount, fee and parties are copied into terms_snapshot and cannot be changed afterwards.
--   * A "problem" had no path. open_dispute freezes release (status FUNDED -> DISPUTED, which
--     confirm_transaction_buyer, confirm_transaction_provider and complete_transaction already
--     refuse). add_dispute_note adds information. decide_dispute records the staff decision.
--
-- What it changes in existing objects
--   transactions   three new columns (terms_version, terms_snapshot, agreed_at), two triggers.
--   disputes       seven new columns. The existing columns are reused: reporter_id is who opened
--                  the case, against_id the other side, description the details, status and
--                  resolution are kept in step with case_state. fn_guard_dispute_client_write is
--                  replaced: a transaction case can no longer be edited or deleted by a browser
--                  role at all, staff included. Reports written from Messages (no transaction_ref)
--                  keep working exactly as before.
--
-- Not done here (docs/OPEN_ITEMS.md, "Money after a dispute decision")
--   decide_dispute records a decision. It does not refund or release money. Only a dismissal
--   moves the transaction (DISPUTED -> FUNDED) so the work can continue. For the other three
--   decisions the transaction stays DISPUTED and shows as "decision_recorded" until staff settle
--   the payment by hand.
--
-- Assumptions checked against production on 2026-10-23 (project dijggrafwdznescbuypi)
--   transactions.id is bigint, requester_id is the customer, amount_cents is kobo, status is the
--   enum transaction_status (OPEN, PENDING, FUNDED, COMPLETED, DISPUTED, CANCELLED), payout_status
--   is text (not_queued, queued, paid, failed). disputes had no rows. is_admin(), is_staff() and
--   is_admin_staff() exist. There is no transaction_events, dispute_events or protected_transactions.
--
-- How to run
--   Paste this file as it is into the SQL editor. It has no BEGIN or COMMIT of its own, so the
--   editor runs it as one transaction and a failure leaves nothing behind. A rolled-back dry run
--   wraps it: BEGIN; <this file>; ROLLBACK;
--   The file removes nothing and replaces nothing destructively, so it can also be run by the
--   assistant's SQL tool, which refuses statements that remove objects.

-- 1. Terms snapshot (DB-5) -----------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS terms_version  text,
  ADD COLUMN IF NOT EXISTS terms_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS agreed_at      timestamptz;

-- Set once, when the payment is received and the transaction becomes FUNDED. Nothing else can
-- write these columns: a client that sends them on insert or update has them overwritten.
-- Bump the version string in a later migration when the protection terms change.
CREATE OR REPLACE FUNCTION public.fn_transaction_terms_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.terms_version  := NULL;
    NEW.terms_snapshot := NULL;
    NEW.agreed_at      := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status = 'FUNDED' AND OLD.status IS DISTINCT FROM 'FUNDED' AND OLD.agreed_at IS NULL THEN
    NEW.terms_version  := '2026-10';
    NEW.agreed_at      := now();
    NEW.terms_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'amount_kobo',            NEW.amount_cents,
      'commission_amount_kobo', NEW.commission_amount_cents,
      'currency',               NEW.currency,
      'requester_id',           NEW.requester_id,
      'provider_id',            NEW.provider_id,
      'listing_id',             NEW.listing_id,
      'listing_source',         NEW.listing_source
    ));
  ELSE
    NEW.terms_version  := OLD.terms_version;
    NEW.terms_snapshot := OLD.terms_snapshot;
    NEW.agreed_at      := OLD.agreed_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_transaction_terms_snapshot
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_transaction_terms_snapshot();

-- 2. Append-only guard shared by both logs --------------------------------------------------
CREATE OR REPLACE FUNCTION public.forbid_event_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'This log is append-only' USING ERRCODE = '42501';
END;
$$;

-- 2b. Dispute case columns (DB-6). Before the view, which reads them. -------------------------
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS transaction_ref text,
  ADD COLUMN IF NOT EXISTS evidence_paths  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS case_state      text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assigned_to     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision        text,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS decided_at      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.disputes'::regclass AND conname = 'disputes_case_state_check') THEN
    ALTER TABLE public.disputes ADD CONSTRAINT disputes_case_state_check
      CHECK (case_state IN ('open', 'awaiting_response', 'under_review', 'escalated', 'resolved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.disputes'::regclass AND conname = 'disputes_decision_check') THEN
    ALTER TABLE public.disputes ADD CONSTRAINT disputes_decision_check
      CHECK (decision IS NULL OR decision IN ('release_to_provider', 'refund_to_customer', 'split', 'dismissed'));
  END IF;
  -- A resolved case always carries its decision and reason.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.disputes'::regclass AND conname = 'disputes_resolved_has_decision') THEN
    ALTER TABLE public.disputes ADD CONSTRAINT disputes_resolved_has_decision
      CHECK (transaction_ref IS NULL OR case_state <> 'resolved' OR (decision IS NOT NULL AND decision_reason IS NOT NULL AND decided_at IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS disputes_case_state_idx ON public.disputes (case_state, created_at DESC);
-- One case at a time per transaction. The functions below check this too; the index is what
-- holds when two people report at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_case_per_transaction
  ON public.disputes (transaction_ref)
  WHERE transaction_ref IS NOT NULL AND case_state <> 'resolved';

-- 3. Event log (DB-3). actor_id has no foreign key on purpose: a log row must survive the
--    account, and a foreign key action would try to update an append-only row. ------------------
CREATE TABLE IF NOT EXISTS public.transaction_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_ref text        NOT NULL,
  event_type      text        NOT NULL,
  actor_id        uuid,
  actor_role      text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS transaction_events_ref_idx ON public.transaction_events (transaction_ref, id);

ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transaction_events TO authenticated;

CREATE OR REPLACE TRIGGER transaction_events_append_only
  BEFORE UPDATE OR DELETE ON public.transaction_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_event_change();

-- 4. The read model (DB-3) ------------------------------------------------------------------
-- security_invoker: the caller's row policies on transactions decide which rows they see
-- (the customer, the provider, and staff).
CREATE OR REPLACE VIEW public.protected_transactions
WITH (security_invoker = true) AS
SELECT
  'transaction:' || t.id::text                          AS ref,
  'transaction'::text                                   AS source,
  t.id                                                  AS source_id,
  'job_payment'::text                                   AS purpose,
  COALESCE(cl.title::text, 'Job request')               AS title,
  t.requester_id                                        AS buyer_id,
  t.provider_id,
  t.amount_cents::bigint                                AS amount_kobo,
  t.currency::text                                      AS currency,
  CASE t.status
    WHEN 'OPEN'      THEN 'awaiting_payment'
    WHEN 'PENDING'   THEN 'processing'
    WHEN 'FUNDED'    THEN
      CASE WHEN t.buyer_confirmed_at IS NOT NULL OR t.provider_confirmed_at IS NOT NULL
           THEN 'awaiting_completion' ELSE 'in_progress' END
    -- Both sides confirmed. The money is only "completed" once the payout has been paid.
    -- A completed job whose payout was never queued, or failed, needs a person to look.
    WHEN 'COMPLETED' THEN
      CASE t.payout_status
        WHEN 'paid'   THEN 'completed'
        WHEN 'queued' THEN 'release_pending'
        ELSE 'needs_attention'
      END
    WHEN 'DISPUTED'  THEN
      CASE WHEN EXISTS (
             SELECT 1 FROM public.disputes d
              WHERE d.transaction_ref = 'transaction:' || t.id::text
                AND d.case_state = 'resolved'
                AND d.decision IS DISTINCT FROM 'dismissed')
           THEN 'decision_recorded' ELSE 'disputed' END
    WHEN 'CANCELLED' THEN 'cancelled'
    ELSE 'needs_attention'
  END                                                   AS display_state,
  (t.buyer_confirmed_at IS NOT NULL)                    AS buyer_confirmed,
  (t.provider_confirmed_at IS NOT NULL)                 AS provider_confirmed,
  t.terms_version,
  t.terms_snapshot,
  t.agreed_at,
  t.created_at,
  t.updated_at
FROM public.transactions t
LEFT JOIN public.category_listings cl ON cl.id = t.listing_id;

REVOKE ALL ON public.protected_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.protected_transactions TO authenticated;

-- Who can read a transaction's log: anyone who can read the transaction (the view applies the
-- transactions row policies), and admins.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'transaction_events' AND policyname = 'transaction_events_read') THEN
    CREATE POLICY transaction_events_read ON public.transaction_events
      FOR SELECT TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.protected_transactions p WHERE p.ref = transaction_events.transaction_ref)
      );
  END IF;
END $$;

-- Written by a trigger so no code path can change a transaction without leaving a line.
CREATE OR REPLACE FUNCTION public.log_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref text := 'transaction:' || NEW.id::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id)
    VALUES (v_ref, 'created', auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id)
    VALUES (
      v_ref,
      -- FUNDED after DISPUTED is the release being resumed, not a second payment.
      CASE WHEN OLD.status = 'DISPUTED' AND NEW.status = 'FUNDED' THEN 'status_resumed'
           ELSE 'status_' || lower(NEW.status::text) END,
      auth.uid());
  END IF;
  IF NEW.buyer_confirmed_at IS NOT NULL AND OLD.buyer_confirmed_at IS NULL THEN
    INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id, actor_role)
    VALUES (v_ref, 'buyer_confirmed', auth.uid(), 'customer');
  END IF;
  IF NEW.provider_confirmed_at IS NOT NULL AND OLD.provider_confirmed_at IS NULL THEN
    INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id, actor_role)
    VALUES (v_ref, 'provider_confirmed', auth.uid(), 'provider');
  END IF;
  IF NEW.payout_status IS DISTINCT FROM OLD.payout_status AND NEW.payout_status <> 'not_queued' THEN
    INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id)
    VALUES (v_ref, 'payout_' || NEW.payout_status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER transactions_log_change
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_transaction_change();

-- Transactions that exist already get their "created" line, once.
INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id, created_at)
SELECT 'transaction:' || t.id::text, 'created', t.requester_id, t.created_at
  FROM public.transactions t
 WHERE NOT EXISTS (SELECT 1 FROM public.transaction_events e WHERE e.transaction_ref = 'transaction:' || t.id::text);

-- 5. Dispute log, visibility and guards (DB-6) -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispute_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispute_id uuid        NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  event_type text        NOT NULL,
  actor_id   uuid,
  actor_role text,
  detail     text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS dispute_events_dispute_idx ON public.dispute_events (dispute_id, id);

ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dispute_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dispute_events TO authenticated;

CREATE OR REPLACE TRIGGER dispute_events_append_only
  BEFORE UPDATE OR DELETE ON public.dispute_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_event_change();

-- The other side of a transaction case can read it. Reports from Messages (no transaction_ref)
-- stay as visible as they were: the reporter, the property owner and staff.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'disputes' AND policyname = 'disputes_counterparty_select') THEN
    CREATE POLICY disputes_counterparty_select ON public.disputes
      FOR SELECT TO authenticated
      USING (transaction_ref IS NOT NULL AND against_id = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                  AND tablename = 'dispute_events' AND policyname = 'dispute_events_read') THEN
    CREATE POLICY dispute_events_read ON public.dispute_events
      FOR SELECT TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.disputes d WHERE d.id = dispute_events.dispute_id)
      );
  END IF;
END $$;

-- Replaces the guard from migration 14. Same rules for ordinary reports, plus: a transaction
-- case is written only by the three functions below (they run as the table owner), so its
-- history cannot be edited from a browser, whatever the caller's role.
CREATE OR REPLACE FUNCTION public.fn_guard_dispute_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.transaction_ref IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND (OLD.transaction_ref IS NOT NULL OR NEW.transaction_ref IS NOT NULL)) THEN
    RAISE EXCEPTION 'a transaction case is changed only through open_dispute, add_dispute_note and decide_dispute'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin_staff() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' OR NEW.resolution IS NOT NULL
       OR NEW.case_state IS DISTINCT FROM 'open'
       OR NEW.decision IS NOT NULL OR NEW.decision_reason IS NOT NULL OR NEW.decided_at IS NOT NULL
       OR NEW.assigned_to IS NOT NULL
       OR COALESCE(array_length(NEW.evidence_paths, 1), 0) > 0 THEN
      RAISE EXCEPTION 'a dispute starts as open' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id
     OR NEW.against_id IS DISTINCT FROM OLD.against_id
     OR NEW.case_state IS DISTINCT FROM OLD.case_state
     OR NEW.decision IS DISTINCT FROM OLD.decision
     OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
     OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.evidence_paths IS DISTINCT FROM OLD.evidence_paths THEN
    RAISE EXCEPTION 'only staff can change a dispute outcome' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_guard_dispute_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND OLD.transaction_ref IS NOT NULL THEN
    RAISE EXCEPTION 'a transaction case cannot be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER trg_guard_dispute_delete
  BEFORE DELETE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_dispute_delete();

-- 6. The three case functions ---------------------------------------------------------------

-- Report a problem. Either party, on funded work that is not finished.
CREATE OR REPLACE FUNCTION public.open_dispute(
  p_transaction_ref text,
  p_reason          text,
  p_details         text,
  p_evidence_paths  text[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_tx    record;
  v_id    uuid;
  v_path  text;
  v_other uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 OR length(p_reason) > 200 THEN
    RAISE EXCEPTION 'The reason must be 3 to 200 characters';
  END IF;
  IF p_details IS NULL OR length(trim(p_details)) < 10 OR length(p_details) > 4000 THEN
    RAISE EXCEPTION 'Tell us what happened in 10 to 4000 characters';
  END IF;
  IF COALESCE(array_length(p_evidence_paths, 1), 0) > 10 THEN
    RAISE EXCEPTION 'Too many evidence files';
  END IF;
  FOREACH v_path IN ARRAY COALESCE(p_evidence_paths, '{}') LOOP
    IF left(v_path, length(v_uid::text) + 1) <> v_uid::text || '/' THEN
      RAISE EXCEPTION 'Invalid evidence path';
    END IF;
  END LOOP;

  SELECT * INTO v_tx FROM public.protected_transactions WHERE ref = p_transaction_ref;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_uid NOT IN (v_tx.buyer_id, v_tx.provider_id) THEN
    RAISE EXCEPTION 'You are not a party to this transaction';
  END IF;

  -- Serialise two people reporting at once, then read the state again under the lock.
  PERFORM 1 FROM public.transactions WHERE id = v_tx.source_id FOR UPDATE;
  SELECT * INTO v_tx FROM public.protected_transactions WHERE ref = p_transaction_ref;
  IF v_tx.display_state NOT IN ('in_progress', 'awaiting_completion') THEN
    RAISE EXCEPTION 'A problem can only be reported on funded work that is not finished';
  END IF;
  IF EXISTS (SELECT 1 FROM public.disputes WHERE transaction_ref = p_transaction_ref AND case_state <> 'resolved') THEN
    RAISE EXCEPTION 'A case is already open for this transaction';
  END IF;

  v_other := CASE WHEN v_uid = v_tx.buyer_id THEN v_tx.provider_id ELSE v_tx.buyer_id END;

  INSERT INTO public.disputes
    (transaction_ref, reporter_id, against_id, reason, description, evidence_paths, status, case_state)
  VALUES
    (p_transaction_ref, v_uid, v_other, trim(p_reason), trim(p_details), COALESCE(p_evidence_paths, '{}'), 'open', 'awaiting_response')
  RETURNING id INTO v_id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_role, note)
  VALUES (v_id, 'opened', v_uid, 'party', trim(p_reason));

  INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id, actor_role)
  VALUES (p_transaction_ref, 'dispute_opened', v_uid, 'party');

  -- Pause release while the case is reviewed.
  UPDATE public.transactions SET status = 'DISPUTED', updated_at = now()
   WHERE id = v_tx.source_id AND status = 'FUNDED';

  RETURN v_id;
END;
$$;

-- Add a note or more evidence. Either party or an admin, until the case is resolved.
CREATE OR REPLACE FUNCTION public.add_dispute_note(
  p_dispute_id     uuid,
  p_note           text,
  p_evidence_paths text[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_d     record;
  v_admin boolean := public.is_admin();
  v_path  text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_d FROM public.disputes WHERE id = p_dispute_id AND transaction_ref IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF NOT v_admin AND v_uid NOT IN (v_d.reporter_id, v_d.against_id) THEN
    RAISE EXCEPTION 'You are not a party to this case';
  END IF;
  IF v_d.case_state = 'resolved' THEN RAISE EXCEPTION 'This case is resolved'; END IF;
  IF p_note IS NULL OR length(trim(p_note)) < 1 OR length(p_note) > 4000 THEN
    RAISE EXCEPTION 'The note must be 1 to 4000 characters';
  END IF;
  IF COALESCE(array_length(p_evidence_paths, 1), 0) + COALESCE(array_length(v_d.evidence_paths, 1), 0) > 10 THEN
    RAISE EXCEPTION 'Too many evidence files';
  END IF;
  FOREACH v_path IN ARRAY COALESCE(p_evidence_paths, '{}') LOOP
    IF left(v_path, length(v_uid::text) + 1) <> v_uid::text || '/' THEN
      RAISE EXCEPTION 'Invalid evidence path';
    END IF;
  END LOOP;

  UPDATE public.disputes
     SET evidence_paths = evidence_paths || COALESCE(p_evidence_paths, '{}'),
         case_state = CASE WHEN v_uid = against_id AND case_state = 'awaiting_response' THEN 'under_review' ELSE case_state END,
         status     = CASE WHEN v_uid = against_id AND case_state = 'awaiting_response' THEN 'investigating' ELSE status END
   WHERE id = p_dispute_id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_role, note)
  VALUES (p_dispute_id, 'note', v_uid, CASE WHEN v_admin THEN 'admin' ELSE 'party' END, trim(p_note));
END;
$$;

-- Staff decision. A reason is required. It is recorded and final.
-- It does not move money. Only a dismissal moves the transaction, back to FUNDED.
CREATE OR REPLACE FUNCTION public.decide_dispute(
  p_dispute_id uuid,
  p_decision   text,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Staff only'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('release_to_provider', 'refund_to_customer', 'split', 'dismissed') THEN
    RAISE EXCEPTION 'Unknown decision';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'A reason of 10 to 2000 characters is required';
  END IF;
  SELECT * INTO v_d FROM public.disputes WHERE id = p_dispute_id AND transaction_ref IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF v_d.case_state = 'resolved' THEN RAISE EXCEPTION 'This case is already resolved'; END IF;

  UPDATE public.disputes
     SET decision        = p_decision,
         decision_reason = trim(p_reason),
         decided_at      = now(),
         case_state      = 'resolved',
         status          = CASE WHEN p_decision = 'dismissed' THEN 'dismissed' ELSE 'resolved' END,
         resolution      = trim(p_reason),
         assigned_to     = COALESCE(assigned_to, v_uid)
   WHERE id = p_dispute_id;

  INSERT INTO public.dispute_events (dispute_id, event_type, actor_id, actor_role, detail, note)
  VALUES (p_dispute_id, 'decision', v_uid, 'admin', p_decision, trim(p_reason));

  INSERT INTO public.transaction_events (transaction_ref, event_type, actor_id, actor_role, note)
  VALUES (v_d.transaction_ref, 'dispute_decided', v_uid, 'admin', p_decision);

  -- Dismissed: nothing is wrong, so the work and the release carry on.
  IF p_decision = 'dismissed' THEN
    UPDATE public.transactions SET status = 'FUNDED', updated_at = now()
     WHERE 'transaction:' || id::text = v_d.transaction_ref AND status = 'DISPUTED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.open_dispute(text, text, text, text[])  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_dispute_note(uuid, text, text[])    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_dispute(uuid, text, text)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_dispute_note(uuid, text, text[])   TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_dispute(uuid, text, text)       TO authenticated;

-- 7. Private evidence bucket. Folder = the uploader's user id. Nobody can overwrite or remove a
--    file from the browser (no UPDATE or DELETE policy), so evidence stays as it was uploaded.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dispute-evidence', 'dispute-evidence', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  -- Only someone who is a party to a transaction can add files, so the bucket cannot be used as
  -- free storage by any signed-in account.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                  AND tablename = 'objects' AND policyname = 'dispute_evidence_insert') THEN
    CREATE POLICY dispute_evidence_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'dispute-evidence'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND EXISTS (
          SELECT 1 FROM public.transactions t
           WHERE t.requester_id = (SELECT auth.uid()) OR t.provider_id = (SELECT auth.uid())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
                  AND tablename = 'objects' AND policyname = 'dispute_evidence_select') THEN
    CREATE POLICY dispute_evidence_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'dispute-evidence'
        AND (
          (storage.foldername(name))[1] = (SELECT auth.uid())::text
          OR public.is_admin()
          OR EXISTS (
            SELECT 1 FROM public.disputes d
             WHERE d.transaction_ref IS NOT NULL
               AND name = ANY (d.evidence_paths)
               AND (d.reporter_id = (SELECT auth.uid()) OR d.against_id = (SELECT auth.uid()))
          )
        )
      );
  END IF;
END $$;

-- =====================================================================
-- Migration: provider identity path, location, reviews, Level 1 cap,
-- verification expiry and server-only payment/identity fields.
--
-- Written against the live schema in this repo:
--   profiles            : id, state, city, identity_verification_status,
--                         is_live_verified, verification_skipped   (baseline)
--   verified_providers  : user_id UNIQUE, level SMALLINT 0..3, level_data JSONB
--                         (migration 20260731000013, ADR-008)
--   verification_submissions, review_verification_submission()  (20260812000000)
--   reviews             : provider_id -> auth.users, reviewer_id, rating NUMERIC(2,1)
--                         (migration 20260828000009)
--   transactions        : id BIGINT, requester_id, provider_id (auth user ids),
--                         amount_cents BIGINT, status transaction_status
--                         ('OPEN','PENDING','FUNDED','COMPLETED','DISPUTED','CANCELLED')
--   student_hostels     : owner_id, listing_paid, listing_paid_at, payment_ref
--   hostel_payments     : owner_id, reference, amount (NAIRA), status, paid_at
--
-- Decisions implemented (ADR-009):
--   * Directory: Level 2+ by default; Level 1 only when min_level = 1 (opt-in tab).
--   * Level 1 cap: 50,000 NGN (5,000,000 kobo) rolling 30 days per requester and
--     Level 1 provider. Enforced by trigger on public.transactions.
--   * Ratings: Bayesian, prior mean 4.0, weight 5. Only reviews linked to a
--     COMPLETED transaction count.
--   * Identity: NIN/BVN is hashed in Node (HMAC-SHA256). Approval of identity
--     sets the provider to Level 1 in the database. Approval is refused without
--     a NIN/BVN hash.
--   * Location (hybrid): a precise point when the provider supplies one, otherwise
--     the centroid of their state (approximate state-capital coordinates).
--   * Verification expiry: 12 months after identity approval; expiry drops one level.
--
-- Not decided here: retention of raw identity documents (see ADR-009).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------
-- 1. verified_providers: location, rating, identity and expiry columns
-- ---------------------------------------------------------------------
ALTER TABLE public.verified_providers
  ADD COLUMN IF NOT EXISTS state                  text,
  ADD COLUMN IF NOT EXISTS location               geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS location_precision     text
    CHECK (location_precision IS NULL OR location_precision IN ('precise', 'state')),
  ADD COLUMN IF NOT EXISTS bayesian_rating        numeric(3,2)  NOT NULL DEFAULT 4.00,
  ADD COLUMN IF NOT EXISTS rating_count           integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_sum             numeric(10,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_hmac          varchar(64),
  ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_verified_providers_location
  ON public.verified_providers USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_verified_providers_level_rating
  ON public.verified_providers (level, bayesian_rating DESC);

-- One identity, one provider account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_verified_providers_identity_hmac
  ON public.verified_providers (identity_hmac)
  WHERE identity_hmac IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. profiles: identity hash (one identity, one account at submission time)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_hmac varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_identity_hmac
  ON public.profiles (identity_hmac)
  WHERE identity_hmac IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Nigerian state centroids (hybrid location fallback)
--    Approximate coordinates of each state capital. Replace with a surveyed
--    dataset before any distance-sensitive pricing depends on them.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nigeria_state_centroids (
  state    text PRIMARY KEY,
  location geography(Point, 4326) NOT NULL
);

ALTER TABLE public.nigeria_state_centroids ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nigeria_state_centroids_read ON public.nigeria_state_centroids;
CREATE POLICY nigeria_state_centroids_read ON public.nigeria_state_centroids
  FOR SELECT USING (true);

INSERT INTO public.nigeria_state_centroids (state, location) VALUES
  ('Abia',          ST_SetSRID(ST_MakePoint(7.49,  5.53), 4326)::geography),
  ('Adamawa',       ST_SetSRID(ST_MakePoint(12.48, 9.21), 4326)::geography),
  ('Akwa Ibom',     ST_SetSRID(ST_MakePoint(7.93,  5.03), 4326)::geography),
  ('Anambra',       ST_SetSRID(ST_MakePoint(7.07,  6.21), 4326)::geography),
  ('Bauchi',        ST_SetSRID(ST_MakePoint(9.84, 10.31), 4326)::geography),
  ('Bayelsa',       ST_SetSRID(ST_MakePoint(6.26,  4.92), 4326)::geography),
  ('Benue',         ST_SetSRID(ST_MakePoint(8.52,  7.74), 4326)::geography),
  ('Borno',         ST_SetSRID(ST_MakePoint(13.16, 11.85), 4326)::geography),
  ('Cross River',   ST_SetSRID(ST_MakePoint(8.33,  4.96), 4326)::geography),
  ('Delta',         ST_SetSRID(ST_MakePoint(6.73,  6.20), 4326)::geography),
  ('Ebonyi',        ST_SetSRID(ST_MakePoint(8.11,  6.32), 4326)::geography),
  ('Edo',           ST_SetSRID(ST_MakePoint(5.63,  6.33), 4326)::geography),
  ('Ekiti',         ST_SetSRID(ST_MakePoint(5.22,  7.62), 4326)::geography),
  ('Enugu',         ST_SetSRID(ST_MakePoint(7.51,  6.45), 4326)::geography),
  ('FCT (Abuja)',   ST_SetSRID(ST_MakePoint(7.49,  9.07), 4326)::geography),
  ('Gombe',         ST_SetSRID(ST_MakePoint(11.17, 10.29), 4326)::geography),
  ('Imo',           ST_SetSRID(ST_MakePoint(7.03,  5.48), 4326)::geography),
  ('Jigawa',        ST_SetSRID(ST_MakePoint(9.34, 11.76), 4326)::geography),
  ('Kaduna',        ST_SetSRID(ST_MakePoint(7.44, 10.52), 4326)::geography),
  ('Kano',          ST_SetSRID(ST_MakePoint(8.52, 12.00), 4326)::geography),
  ('Katsina',       ST_SetSRID(ST_MakePoint(7.60, 12.99), 4326)::geography),
  ('Kebbi',         ST_SetSRID(ST_MakePoint(4.20, 12.45), 4326)::geography),
  ('Kogi',          ST_SetSRID(ST_MakePoint(6.74,  7.80), 4326)::geography),
  ('Kwara',         ST_SetSRID(ST_MakePoint(4.55,  8.50), 4326)::geography),
  ('Lagos',         ST_SetSRID(ST_MakePoint(3.35,  6.60), 4326)::geography),
  ('Nasarawa',      ST_SetSRID(ST_MakePoint(8.52,  8.49), 4326)::geography),
  ('Niger',         ST_SetSRID(ST_MakePoint(6.55,  9.61), 4326)::geography),
  ('Ogun',          ST_SetSRID(ST_MakePoint(3.35,  7.15), 4326)::geography),
  ('Ondo',          ST_SetSRID(ST_MakePoint(5.19,  7.25), 4326)::geography),
  ('Osun',          ST_SetSRID(ST_MakePoint(4.56,  7.77), 4326)::geography),
  ('Oyo',           ST_SetSRID(ST_MakePoint(3.90,  7.38), 4326)::geography),
  ('Plateau',       ST_SetSRID(ST_MakePoint(8.89,  9.90), 4326)::geography),
  ('Rivers',        ST_SetSRID(ST_MakePoint(7.03,  4.82), 4326)::geography),
  ('Sokoto',        ST_SetSRID(ST_MakePoint(5.24, 13.06), 4326)::geography),
  ('Taraba',        ST_SetSRID(ST_MakePoint(11.36, 8.89), 4326)::geography),
  ('Yobe',          ST_SetSRID(ST_MakePoint(11.96, 11.75), 4326)::geography),
  ('Zamfara',       ST_SetSRID(ST_MakePoint(6.66, 12.17), 4326)::geography)
ON CONFLICT (state) DO NOTHING;

-- Browser-friendly view (lat/lng as plain numbers, for the client to use as a search origin)
CREATE OR REPLACE VIEW public.nigeria_state_points AS
  SELECT state,
         ST_Y(location::geometry) AS lat,
         ST_X(location::geometry) AS lng
    FROM public.nigeria_state_centroids;

GRANT SELECT ON public.nigeria_state_points TO anon, authenticated;

-- Maps the free-text state on a profile to the canonical key above.
CREATE OR REPLACE FUNCTION public.normalise_nigeria_state(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT c.state
    FROM (SELECT CASE
                   WHEN lower(btrim(p)) IN ('fct', 'abuja', 'fct abuja', 'fct (abuja)', 'federal capital territory')
                     THEN 'FCT (Abuja)'
                   ELSE btrim(p)
                 END AS val) k
    JOIN public.nigeria_state_centroids c ON lower(c.state) = lower(k.val)
   LIMIT 1
$$;

-- ---------------------------------------------------------------------
-- 4. Identity approval path (fixes "no identity": Level 1 was never set)
--    Admin approval writes profiles.identity_verification_status = 'approved'.
--    This trigger turns that into verified_providers.level = 1, with the
--    identity hash and a location, in the same transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_identity_to_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state  text;
BEGIN
  IF NEW.identity_verification_status = 'approved'
     AND OLD.identity_verification_status IS DISTINCT FROM 'approved' THEN

    IF NEW.identity_hmac IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_NIN_REQUIRED: the NIN/BVN must be submitted before approval'
        USING ERRCODE = 'check_violation';
    END IF;

    v_state := public.normalise_nigeria_state(NEW.state);

    BEGIN
      INSERT INTO public.verified_providers
        (user_id, level, level_data, identity_hmac, state, location, location_precision,
         verification_expires_at, updated_at)
      VALUES
        (NEW.id, 1,
         jsonb_build_object('nin_verified', true, 'identity_approved_at', now()),
         NEW.identity_hmac,
         v_state,
         (SELECT location FROM public.nigeria_state_centroids WHERE state = v_state),
         CASE WHEN v_state IS NULL THEN NULL ELSE 'state' END,
         now() + interval '12 months',
         now())
      ON CONFLICT (user_id) DO UPDATE
        SET level                   = GREATEST(public.verified_providers.level, 1),
            identity_hmac           = EXCLUDED.identity_hmac,
            level_data              = public.verified_providers.level_data || EXCLUDED.level_data,
            state                   = COALESCE(EXCLUDED.state, public.verified_providers.state),
            location                = CASE WHEN public.verified_providers.location_precision = 'precise'
                                           THEN public.verified_providers.location
                                           ELSE COALESCE(EXCLUDED.location, public.verified_providers.location) END,
            location_precision      = CASE WHEN public.verified_providers.location_precision = 'precise'
                                           THEN 'precise' ELSE COALESCE(EXCLUDED.location_precision, public.verified_providers.location_precision) END,
            verification_expires_at = EXCLUDED.verification_expires_at,
            updated_at              = now();
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'IDENTITY_ALREADY_REGISTERED: this NIN/BVN is already linked to another provider account'
        USING ERRCODE = 'unique_violation';
    END;

  ELSIF OLD.identity_verification_status = 'approved'
        AND NEW.identity_verification_status IS DISTINCT FROM 'approved' THEN
    -- Identity revoked: no level, and the hash is released so the number can be re-verified.
    UPDATE public.verified_providers
       SET level = 0,
           identity_hmac = NULL,
           verification_expires_at = NULL,
           updated_at = now()
     WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_identity_to_provider ON public.profiles;
CREATE TRIGGER trg_sync_identity_to_provider
  AFTER UPDATE OF identity_verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_identity_to_provider();

-- Keep a provider's state centroid in step when their profile state changes
CREATE OR REPLACE FUNCTION public.sync_provider_state_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state text := public.normalise_nigeria_state(NEW.state);
BEGIN
  UPDATE public.verified_providers vp
     SET state = v_state,
         location = (SELECT location FROM public.nigeria_state_centroids WHERE state = v_state),
         location_precision = 'state',
         updated_at = now()
   WHERE vp.user_id = NEW.id
     AND vp.location_precision IS DISTINCT FROM 'precise'
     AND v_state IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_provider_state_location ON public.profiles;
CREATE TRIGGER trg_sync_provider_state_location
  AFTER UPDATE OF state ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_state_location();

-- ---------------------------------------------------------------------
-- 5. Identity fields are server-only. Owners may only move their own
--    status to 'submitted'. Approval, revocation and the hash all come from
--    staff (admin/superadmin) or the service role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_identity_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_privileged boolean;
BEGIN
  v_privileged := auth.role() = 'service_role'
               OR public.get_my_role() IN ('admin', 'superadmin')
               OR public.is_admin_staff();
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.identity_hmac IS DISTINCT FROM OLD.identity_hmac THEN
    RAISE EXCEPTION 'IDENTITY_FIELDS_SERVER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status
     AND NEW.identity_verification_status <> 'submitted' THEN
    RAISE EXCEPTION 'IDENTITY_STATUS_SERVER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_identity ON public.profiles;
CREATE TRIGGER trg_guard_profile_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_identity_fields();

-- ---------------------------------------------------------------------
-- 6. Reviews must be linked to a COMPLETED transaction by the reviewer,
--    about the provider on that transaction (RATE-3).
-- ---------------------------------------------------------------------
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS transaction_id bigint REFERENCES public.transactions(id);

-- Old rule was one review per reviewer per provider, ever. Now one per transaction.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_provider_id_reviewer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_transaction
  ON public.reviews (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_review_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.transaction_id IS NULL THEN
      RAISE EXCEPTION 'REVIEW_REQUIRES_TRANSACTION' USING ERRCODE = 'check_violation';
    END IF;
    SELECT requester_id, provider_id, status INTO t
      FROM public.transactions WHERE id = NEW.transaction_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REVIEW_TRANSACTION_NOT_FOUND' USING ERRCODE = 'check_violation';
    END IF;
    IF t.status <> 'COMPLETED' THEN
      RAISE EXCEPTION 'REVIEW_ONLY_AFTER_COMPLETION' USING ERRCODE = 'check_violation';
    END IF;
    IF t.requester_id <> NEW.reviewer_id THEN
      RAISE EXCEPTION 'REVIEW_NOT_BY_REQUESTER' USING ERRCODE = 'check_violation';
    END IF;
    IF t.provider_id IS DISTINCT FROM NEW.provider_id THEN
      RAISE EXCEPTION 'REVIEW_PROVIDER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'REVIEW_LINK_IMMUTABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_review_transaction ON public.reviews;
CREATE TRIGGER trg_enforce_review_transaction
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_transaction();

-- Bayesian rating from linked reviews only: (C * m + sum) / (C + n), m = 4.0, C = 5
CREATE OR REPLACE FUNCTION public.refresh_provider_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider uuid;
  v_count    integer;
  v_sum      numeric;
  c_prior_mean   constant numeric := 4.0;
  c_prior_weight constant numeric := 5;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_provider := OLD.provider_id;
  ELSE
    v_provider := NEW.provider_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(rating), 0)
    INTO v_count, v_sum
    FROM public.reviews
   WHERE provider_id = v_provider
     AND transaction_id IS NOT NULL;

  UPDATE public.verified_providers
     SET rating_count    = v_count,
         rating_sum      = v_sum,
         bayesian_rating = ROUND((c_prior_weight * c_prior_mean + v_sum) / (c_prior_weight + v_count), 2)
   WHERE user_id = v_provider;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_provider_rating ON public.reviews;
CREATE TRIGGER trg_refresh_provider_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_provider_rating();

-- ---------------------------------------------------------------------
-- 7. Level 1 rolling 30-day cap (ESC-1, ABUSE-2), enforced in the database.
--    5,000,000 kobo = 50,000 NGN. The advisory lock serialises writes for the
--    same requester/provider pair, so two bookings cannot both pass.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_level1_booking_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_level    smallint;
  v_rolling  bigint;
  c_cap_kobo constant bigint := 5000000;
BEGIN
  IF NEW.provider_id IS NULL OR NEW.amount_cents IS NULL OR NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  SELECT level INTO v_level
    FROM public.verified_providers
   WHERE user_id = NEW.provider_id;

  IF v_level IS DISTINCT FROM 1 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.requester_id::text || ':' || NEW.provider_id::text, 0)
  );

  SELECT COALESCE(SUM(t.amount_cents), 0)
    INTO v_rolling
    FROM public.transactions t
   WHERE t.requester_id = NEW.requester_id
     AND t.provider_id  = NEW.provider_id
     AND t.id IS DISTINCT FROM NEW.id
     AND t.amount_cents IS NOT NULL
     AND t.status <> 'CANCELLED'
     AND t.created_at >= now() - interval '30 days';

  IF v_rolling + NEW.amount_cents > c_cap_kobo THEN
    RAISE EXCEPTION 'LEVEL1_CAP_EXCEEDED: 30-day total with this provider would be % kobo (cap 5000000 kobo = 50,000 NGN)',
      v_rolling + NEW.amount_cents
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_level1_cap ON public.transactions;
CREATE TRIGGER trg_enforce_level1_cap
  BEFORE INSERT OR UPDATE OF provider_id, amount_cents, status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_level1_booking_cap();

-- ---------------------------------------------------------------------
-- 8. Provider search RPC. SECURITY INVOKER: RLS applies, so it can never
--    return more than verified_providers already exposes publicly.
--    min_level defaults to 2 (Option C: Level 1 only on the explicit tab).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_providers_rpc(
  client_lat   double precision,
  client_lng   double precision,
  radius_m     double precision DEFAULT 10000,
  min_level    smallint         DEFAULT 2,
  min_rating   numeric          DEFAULT NULL,
  page_limit   integer          DEFAULT 20,
  page_offset  integer          DEFAULT 0
)
RETURNS TABLE (
  user_id         uuid,
  level           smallint,
  bayesian_rating numeric,
  rating_count    integer,
  location_precision text,
  distance_m      double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH origin AS (
    SELECT ST_SetSRID(ST_MakePoint(client_lng, client_lat), 4326)::geography AS pt
  )
  SELECT vp.user_id,
         vp.level,
         vp.bayesian_rating,
         vp.rating_count,
         vp.location_precision,
         ST_Distance(vp.location, o.pt) AS distance_m
    FROM public.verified_providers vp
    CROSS JOIN origin o
   WHERE vp.level >= GREATEST(min_level, 1)
     AND vp.location IS NOT NULL
     AND ST_DWithin(vp.location, o.pt, radius_m)
     AND (min_rating IS NULL OR vp.bayesian_rating >= min_rating)
   ORDER BY vp.level DESC, vp.bayesian_rating DESC, ST_Distance(vp.location, o.pt) ASC
   LIMIT LEAST(GREATEST(page_limit, 1), 100)
   OFFSET GREATEST(page_offset, 0)
$$;

GRANT EXECUTE ON FUNCTION public.search_providers_rpc(double precision, double precision, double precision, smallint, numeric, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Verification expiry: drop one level when a verification lapses.
--    Called daily from cron-process-payouts (api/platform.js).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demote_expired_verifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.verified_providers
     SET level = level - 1,
         updated_at = now()
   WHERE level > 0
     AND verification_expires_at IS NOT NULL
     AND verification_expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.demote_expired_verifications() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. Listing payment fields are server-only (SEC-3).
--     The owner RLS policy on student_hostels allows any column update, so an
--     owner could set listing_paid = true from the browser console. Only the
--     service role (the Flutterwave webhook) and staff may change payment fields.
--     Owners may insert hostel_payments only as 'pending'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_listing_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_privileged boolean;
BEGIN
  v_privileged := auth.role() = 'service_role'
               OR public.get_my_role() IN ('admin', 'superadmin')
               OR public.is_admin_staff();
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'student_hostels' THEN
    IF NEW.listing_paid    IS DISTINCT FROM OLD.listing_paid
    OR NEW.listing_paid_at IS DISTINCT FROM OLD.listing_paid_at
    OR NEW.payment_ref     IS DISTINCT FROM OLD.payment_ref THEN
      RAISE EXCEPTION 'LISTING_PAYMENT_FIELDS_SERVER_ONLY' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'hostel_payments' THEN
    IF TG_OP = 'INSERT' AND NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'HOSTEL_PAYMENT_MUST_START_PENDING' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status
                          OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN
      RAISE EXCEPTION 'HOSTEL_PAYMENT_STATUS_SERVER_ONLY' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_listing_payment_fields ON public.student_hostels;
CREATE TRIGGER trg_guard_listing_payment_fields
  BEFORE UPDATE ON public.student_hostels
  FOR EACH ROW EXECUTE FUNCTION public.guard_listing_payment_fields();

DROP TRIGGER IF EXISTS trg_guard_hostel_payment_fields ON public.hostel_payments;
CREATE TRIGGER trg_guard_hostel_payment_fields
  BEFORE INSERT OR UPDATE ON public.hostel_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_listing_payment_fields();

-- ---------------------------------------------------------------------
-- 11. identity_hmac must never be readable by clients. verified_providers has
--     a public-read policy (level >= 1), which would otherwise expose the hash
--     column too. Clients get explicit columns only. Server code uses the
--     service role and is not affected.
-- ---------------------------------------------------------------------
REVOKE SELECT ON public.verified_providers FROM anon, authenticated;
GRANT SELECT (id, user_id, level, level_data, created_at, updated_at, state, location,
              location_precision, bayesian_rating, rating_count, rating_sum,
              verification_expires_at)
  ON public.verified_providers TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. Identity document purge, 90 days after account deletion (founder decision).
--     erase_account_data() nulls the profile pointers but leaves the objects in
--     the private 'identity-docs' bucket. This trigger queues those objects at the
--     moment the pointer is cleared, in the same transaction, so no deletion path
--     can skip the queue. The daily cron (cron-process-payouts) removes the
--     objects once purge_after has passed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identity_doc_purge_queue (
  id            bigserial PRIMARY KEY,
  user_id       uuid        NOT NULL,
  storage_path  text,
  queued_at     timestamptz NOT NULL DEFAULT now(),
  purge_after   timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  purged_at     timestamptz,
  attempts      integer     NOT NULL DEFAULT 0,
  last_error    text
);

CREATE INDEX IF NOT EXISTS identity_doc_purge_due_idx
  ON public.identity_doc_purge_queue (purge_after)
  WHERE purged_at IS NULL;

ALTER TABLE public.identity_doc_purge_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_doc_purge_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.identity_doc_purge_queue TO service_role;
-- No policies: only the service role (server code) can read or write this table.

CREATE OR REPLACE FUNCTION public.queue_identity_doc_purge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fires only when a pointer is cleared (account erasure), not on re-upload.
  IF OLD.identity_photo_url IS NOT NULL AND NEW.identity_photo_url IS NULL THEN
    INSERT INTO public.identity_doc_purge_queue (user_id, storage_path)
    VALUES (OLD.id, OLD.identity_photo_url);
  END IF;
  IF OLD.identity_selfie_url IS NOT NULL AND NEW.identity_selfie_url IS NULL THEN
    INSERT INTO public.identity_doc_purge_queue (user_id, storage_path)
    VALUES (OLD.id, OLD.identity_selfie_url);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_identity_doc_purge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_queue_identity_doc_purge ON public.profiles;
CREATE TRIGGER trg_queue_identity_doc_purge
  AFTER UPDATE OF identity_photo_url, identity_selfie_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.queue_identity_doc_purge();

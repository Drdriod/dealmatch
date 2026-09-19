-- ═══════════════════════════════════════════════════════════════════════════
-- DealMatch - Physical Verification Telemetry Gates (Phase 1 & 2)
-- Run in Supabase SQL Editor AFTER agent-accountability.sql
-- Adds: verification_sessions (capture-time handshake) +
--       integrity columns on the existing agent_verifications table
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. VERIFICATION SESSIONS ──────────────────────────────────────────────
-- Issued by the backend BEFORE an agent visits a property. server_t0 is the
-- only trusted time anchor - the device's own wall clock is never trusted.
-- The HMAC session key itself is NEVER stored here - it's deterministically
-- re-derivable server-side as HMAC(MASTER_SECRET, session_id), so there is
-- nothing secret to leak from a DB dump of this table.

CREATE TABLE IF NOT EXISTS public.verification_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform      text NOT NULL CHECK (platform IN ('android','ios')),
  server_t0     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','consumed','expired','rejected')),
  attempts      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_sessions_agent    ON public.verification_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_verification_sessions_property ON public.verification_sessions(property_id);

ALTER TABLE public.verification_sessions ENABLE ROW LEVEL SECURITY;

-- No client-side INSERT/UPDATE policy on purpose: sessions are only ever
-- created/mutated server-side (service role) via the two API endpoints
-- below, since server_t0 and status transitions must never be
-- client-settable. Agents may only read their own session history.
DROP POLICY IF EXISTS "Agents view own sessions" ON public.verification_sessions;
CREATE POLICY "Agents view own sessions" ON public.verification_sessions
  FOR SELECT USING (agent_id = auth.uid());


-- ─── 2. INTEGRITY COLUMNS ON agent_verifications ───────────────────────────
-- Extends the EXISTING agent_verifications table (do not replace it - the
-- agent scoring/complaint triggers already fire off this table's verdict
-- column). These columns carry proof that the telemetry gate was passed;
-- verdict itself still requires human review, unchanged from today.

ALTER TABLE public.agent_verifications
  ADD COLUMN IF NOT EXISTS session_id            uuid REFERENCES public.verification_sessions(id),
  ADD COLUMN IF NOT EXISTS monotonic_elapsed_ms   bigint,
  ADD COLUMN IF NOT EXISTS captured_at            timestamptz,  -- server_t0 + monotonic_elapsed_ms, the TRUSTED capture time
  ADD COLUMN IF NOT EXISTS is_mock_location       boolean,
  ADD COLUMN IF NOT EXISTS platform               text CHECK (platform IN ('android','ios')),
  ADD COLUMN IF NOT EXISTS hmac_verified          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_variance_m         numeric;  -- distance from property's stored coordinates at submission time

CREATE INDEX IF NOT EXISTS idx_agent_verifications_session ON public.agent_verifications(session_id);

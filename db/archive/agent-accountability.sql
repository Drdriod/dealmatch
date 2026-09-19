-- ═══════════════════════════════════════════════════════════════════════════
-- DealMatch - Agent Accountability System
-- Run in Supabase SQL Editor AFTER blueprint-corrections.sql
-- Tables: agent_verifications, complaints, agent_scores
-- Triggers: auto-strike, auto-suspend, score recalculation
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. ADD COLUMNS TO PROPERTIES ─────────────────────────────────────────
-- Track which agent is assigned and when they verified
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS assigned_agent_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at        timestamptz,
  ADD COLUMN IF NOT EXISTS verification_date  timestamptz,
  ADD COLUMN IF NOT EXISTS verification_notes text;

CREATE INDEX IF NOT EXISTS idx_properties_assigned_agent
  ON public.properties (assigned_agent_id);


-- ─── 2. AGENT VERIFICATIONS TABLE ─────────────────────────────────────────
-- Evidence package submitted by agent for each property visit

CREATE TABLE IF NOT EXISTS public.agent_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,

  -- Evidence
  photos          text[]    NOT NULL DEFAULT '{}',  -- min 3 storage paths
  gps_lat         numeric(10,7),
  gps_lng         numeric(10,7),
  gps_accuracy_m  integer,
  visited_at      timestamptz NOT NULL DEFAULT now(),

  -- Physical checklist
  checklist       jsonb NOT NULL DEFAULT '{
    "water_running": false,
    "electricity_working": false,
    "matches_description": false,
    "landlord_present": false,
    "no_structural_damage": false,
    "address_confirmed": false
  }',

  -- Outcome
  verdict         text NOT NULL DEFAULT 'pending'
                  CHECK (verdict IN ('pending','verified','rejected')),
  rejection_reason text,

  -- Accountability
  liability_acknowledged boolean NOT NULL DEFAULT false,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,

  UNIQUE (property_id, agent_id)  -- one submission per agent per property
);

ALTER TABLE public.agent_verifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_verifications_agent
  ON public.agent_verifications (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_verifications_property
  ON public.agent_verifications (property_id);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agent submits own verifications" ON public.agent_verifications;
  CREATE POLICY "Agent submits own verifications" ON public.agent_verifications
    FOR INSERT WITH CHECK (agent_id = auth.uid());

  DROP POLICY IF EXISTS "Agent views own verifications" ON public.agent_verifications;
  CREATE POLICY "Agent views own verifications" ON public.agent_verifications
    FOR SELECT USING (
      agent_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','verifier')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );

  DROP POLICY IF EXISTS "Agent updates own pending" ON public.agent_verifications;
  CREATE POLICY "Agent updates own pending" ON public.agent_verifications
    FOR UPDATE
    USING (
      (agent_id = auth.uid() AND verdict = 'pending')
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      (agent_id = auth.uid() AND verdict = 'pending')
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;


-- ─── 3. AGENT SCORES TABLE ────────────────────────────────────────────────
-- Live scorecard per agent, updated by triggers

CREATE TABLE IF NOT EXISTS public.agent_scores (
  agent_id              uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_verifications   integer NOT NULL DEFAULT 0,
  verified_count        integer NOT NULL DEFAULT 0,
  rejected_count        integer NOT NULL DEFAULT 0,
  complaints_received   integer NOT NULL DEFAULT 0,
  complaints_upheld     integer NOT NULL DEFAULT 0,
  strike_count          integer NOT NULL DEFAULT 0,
  rating                numeric(3,2) DEFAULT 5.00,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','under_review','suspended','banned')),
  last_activity         timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agent reads own score" ON public.agent_scores;
  CREATE POLICY "Agent reads own score" ON public.agent_scores
    FOR SELECT USING (
      agent_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin','verifier')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );

  DROP POLICY IF EXISTS "System updates scores" ON public.agent_scores;
  CREATE POLICY "System updates scores" ON public.agent_scores
    FOR ALL
    USING (
      public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;

-- Auto-create score row when a new agent is created
CREATE OR REPLACE FUNCTION public.fn_init_agent_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'agent' THEN
    INSERT INTO public.agent_scores (agent_id)
    VALUES (NEW.id)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_agent_score ON public.profiles;
CREATE TRIGGER trg_init_agent_score
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_init_agent_score();

-- Backfill existing agents
INSERT INTO public.agent_scores (agent_id)
SELECT id FROM public.profiles WHERE role = 'agent'
ON CONFLICT (agent_id) DO NOTHING;


-- ─── 4. COMPLAINTS TABLE ──────────────────────────────────────────────────
-- Filed by tenants/buyers against a listing or an agent

CREATE TABLE IF NOT EXISTS public.complaints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  verification_id uuid REFERENCES public.agent_verifications(id) ON DELETE SET NULL,
  agent_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- auto-populated
  complainant_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Complaint detail
  category        text NOT NULL
                  CHECK (category IN (
                    'fake_listing','misrepresentation','wrong_address',
                    'structural_damage','fraud','agent_misconduct','other'
                  )),
  description     text NOT NULL,
  evidence_urls   text[] DEFAULT '{}',

  -- Resolution
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','under_review','upheld','dismissed','escalated')),
  resolution_note text,
  resolved_by     uuid REFERENCES public.profiles(id),
  resolved_at     timestamptz,

  -- Auto-response deadline (48 hours)
  agent_response      text,
  agent_responded_at  timestamptz,
  response_deadline   timestamptz GENERATED ALWAYS AS (created_at + interval '48 hours') STORED,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_complaints_agent      ON public.complaints (agent_id);
CREATE INDEX IF NOT EXISTS idx_complaints_property   ON public.complaints (property_id);
CREATE INDEX IF NOT EXISTS idx_complaints_complainant ON public.complaints (complainant_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status     ON public.complaints (status);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users file complaints" ON public.complaints;
  CREATE POLICY "Users file complaints" ON public.complaints
    FOR INSERT WITH CHECK (complainant_id = auth.uid());

  DROP POLICY IF EXISTS "Complaints visibility" ON public.complaints;
  CREATE POLICY "Complaints visibility" ON public.complaints
    FOR SELECT USING (
      complainant_id = auth.uid()
      OR agent_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );

  DROP POLICY IF EXISTS "Agent responds to complaint" ON public.complaints;
  CREATE POLICY "Agent responds to complaint" ON public.complaints
    FOR UPDATE
    USING (
      agent_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    )
    WITH CHECK (
      agent_id = auth.uid()
      OR public.get_my_role() IN ('admin','superadmin')
      OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
    );
END $$;


-- ─── 5. AUTO-POPULATE agent_id ON COMPLAINT INSERT ───────────────────────
-- When a complaint is filed against a property, find who verified it

CREATE OR REPLACE FUNCTION public.fn_populate_complaint_agent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Find the agent who verified this property
  IF NEW.agent_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT agent_id INTO NEW.agent_id
    FROM public.agent_verifications
    WHERE property_id = NEW.property_id
      AND verdict = 'verified'
    ORDER BY submitted_at DESC
    LIMIT 1;

    -- Also link verification record
    IF NEW.verification_id IS NULL AND NEW.agent_id IS NOT NULL THEN
      SELECT id INTO NEW.verification_id
      FROM public.agent_verifications
      WHERE property_id = NEW.property_id
        AND agent_id = NEW.agent_id
        AND verdict = 'verified'
      ORDER BY submitted_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Increment complaints_received on agent score
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.agent_scores (agent_id, complaints_received)
    VALUES (NEW.agent_id, 1)
    ON CONFLICT (agent_id) DO UPDATE
      SET complaints_received = agent_scores.complaints_received + 1,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_complaint_agent ON public.complaints;
CREATE TRIGGER trg_populate_complaint_agent
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_populate_complaint_agent();


-- ─── 6. STRIKE SYSTEM - AUTO-STRIKE AND AUTO-SUSPEND ─────────────────────
-- When a complaint is upheld → strike the agent → check for suspension

CREATE OR REPLACE FUNCTION public.fn_process_complaint_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_strikes integer;
BEGIN
  -- Only act when status changes TO 'upheld'
  IF NEW.status = 'upheld' AND OLD.status <> 'upheld' AND NEW.agent_id IS NOT NULL THEN

    -- Record upheld complaint and add strike
    UPDATE public.agent_scores
    SET
      complaints_upheld = complaints_upheld + 1,
      strike_count      = strike_count + 1,
      -- Recalculate rating: deduct 0.5 per upheld complaint, min 1.0
      rating = GREATEST(1.00, rating - 0.50),
      updated_at = now()
    WHERE agent_id = NEW.agent_id
    RETURNING strike_count INTO new_strikes;

    -- 3 strikes → auto-suspend
    IF new_strikes >= 3 THEN
      UPDATE public.agent_scores
      SET status = 'suspended', updated_at = now()
      WHERE agent_id = NEW.agent_id;

      -- Suspend the profile itself
      UPDATE public.profiles
      SET role = 'suspended'
      WHERE id = NEW.agent_id;

      -- Audit log
      INSERT INTO public.admin_audit_log (action, metadata, performed_by)
      VALUES (
        'agent_auto_suspended',
        jsonb_build_object(
          'agent_id', NEW.agent_id,
          'strike_count', new_strikes,
          'triggered_by_complaint', NEW.id
        ),
        NEW.resolved_by
      );
    END IF;

    -- Audit the strike
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'agent_strike_issued',
      jsonb_build_object(
        'agent_id', NEW.agent_id,
        'complaint_id', NEW.id,
        'strike_number', new_strikes,
        'complaint_category', NEW.category
      ),
      NEW.resolved_by
    );

  END IF;

  -- Dismissed complaint - still log it
  IF NEW.status = 'dismissed' AND OLD.status <> 'dismissed' AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'complaint_dismissed',
      jsonb_build_object('complaint_id', NEW.id, 'agent_id', NEW.agent_id),
      NEW.resolved_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_complaint_resolution ON public.complaints;
CREATE TRIGGER trg_process_complaint_resolution
  AFTER UPDATE OF status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.fn_process_complaint_resolution();


-- ─── 7. UPDATE AGENT SCORE ON VERIFICATION SUBMIT ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_update_agent_score_on_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.agent_scores (agent_id, total_verifications, verified_count, rejected_count, last_activity)
  VALUES (
    NEW.agent_id, 1,
    CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    total_verifications = agent_scores.total_verifications + 1,
    verified_count      = agent_scores.verified_count + CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    rejected_count      = agent_scores.rejected_count + CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    last_activity       = now(),
    updated_at          = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_score_on_verification ON public.agent_verifications;
CREATE TRIGGER trg_agent_score_on_verification
  AFTER INSERT OR UPDATE OF verdict ON public.agent_verifications
  FOR EACH ROW
  WHEN (NEW.verdict IN ('verified','rejected'))
  EXECUTE FUNCTION public.fn_update_agent_score_on_verification();


-- ─── 8. HELPER VIEW: AGENT SCORECARD ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_agent_scorecard AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  s.total_verifications,
  s.verified_count,
  s.rejected_count,
  s.complaints_received,
  s.complaints_upheld,
  s.strike_count,
  s.rating,
  s.status,
  s.last_activity,
  ROUND(
    CASE WHEN s.total_verifications = 0 THEN 100
    ELSE (s.verified_count::numeric / s.total_verifications * 100)
    END, 1
  ) AS success_rate_pct,
  ROUND(
    CASE WHEN s.complaints_received = 0 THEN 0
    ELSE (s.complaints_upheld::numeric / s.complaints_received * 100)
    END, 1
  ) AS complaint_uphold_rate_pct,
  -- 3 - strikes remaining before suspension
  GREATEST(0, 3 - s.strike_count) AS strikes_remaining
FROM public.profiles p
JOIN public.agent_scores s ON s.agent_id = p.id
WHERE p.role IN ('agent','suspended')
ORDER BY s.rating DESC, s.total_verifications DESC;


-- ─── 9. STORAGE BUCKET FOR AGENT VERIFICATION PHOTOS ─────────────────────
-- Create in Supabase Dashboard: Storage → New Bucket
--   Name: verification-photos | Public: OFF | Max: 10MB

DO $$ BEGIN
  DROP POLICY IF EXISTS "Agents upload verification photos" ON storage.objects;
  CREATE POLICY "Agents upload verification photos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'verification-photos'
      AND public.get_my_role() IN ('agent','admin','superadmin')
    );

  DROP POLICY IF EXISTS "Admin views verification photos" ON storage.objects;
  CREATE POLICY "Admin views verification photos" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'verification-photos'
      AND (
        public.get_my_role() IN ('admin','superadmin','verifier')
        OR auth.email() IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
        -- Agent can view their own
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );
END $$;


-- ─── DONE ─────────────────────────────────────────────────────────────────
-- After running:
-- 1. Supabase → Storage → New Bucket: "verification-photos" | Public: OFF
-- 2. The agent_scores row is auto-created when agent role is assigned
-- 3. Complaints auto-link to the agent who verified the property
-- 4. 3 upheld complaints = automatic suspension + audit log entry
-- 5. Admin can reinstate suspended agents via agent_scores.status → 'active'
--    and profiles.role → 'agent'

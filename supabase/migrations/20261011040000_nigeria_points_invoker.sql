-- ============================================================================
-- nigeria_state_points reads public centroid data only
-- (nigeria_state_centroids has a SELECT policy with USING (true)), so it does
-- not need to run with the creator's permissions. Switch it to invoker mode.
--
-- Deliberately NOT changed here:
--   * public_profiles: runs as definer on purpose, to expose a few public
--     fields for other users. profiles RLS only allows self or staff, so
--     invoker mode would hide other users' profiles. Needs a column-level
--     design, not a mode switch.
--   * provider_stats: depends on transactions, which is restricted to
--     participants. Invoker mode would make completion rates wrong for
--     anyone who is not a participant.
-- ============================================================================

ALTER VIEW public.nigeria_state_points SET (security_invoker = true);

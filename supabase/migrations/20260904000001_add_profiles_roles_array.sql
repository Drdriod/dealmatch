-- ============================================================================
-- Support multi-role onboarding (bug: "Goal step should match multi category
-- from onboarding page" -> onboarding role step is now a multi-select).
--
-- `role` (text) stays as-is and keeps working everywhere it's already used
-- (dashboards, RLS policies, verify-identity routing, etc.) - it's simply
-- set to the first role a user picks, so nothing downstream breaks.
--
-- `roles` (text[]) is new and stores the FULL set of roles a user selected
-- in onboarding (e.g. a user who is both a landlord and a buyer). Backfilled
-- from the existing single `role` column so no one ends up with an empty set.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

UPDATE public.profiles
SET roles = ARRAY[role]
WHERE role IS NOT NULL
  AND role <> ''
  AND (roles IS NULL OR roles = '{}');

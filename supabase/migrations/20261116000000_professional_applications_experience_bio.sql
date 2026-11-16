-- Professional applications: years of experience and a short bio.
-- Both are optional and additive. Read access is unchanged (the applicant and staff only).
ALTER TABLE public.professional_applications
  ADD COLUMN IF NOT EXISTS years_experience smallint,
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.professional_applications
  DROP CONSTRAINT IF EXISTS professional_applications_years_experience_check,
  DROP CONSTRAINT IF EXISTS professional_applications_bio_length_check;

ALTER TABLE public.professional_applications
  ADD CONSTRAINT professional_applications_years_experience_check
    CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 60)),
  ADD CONSTRAINT professional_applications_bio_length_check
    CHECK (bio IS NULL OR char_length(bio) <= 600);

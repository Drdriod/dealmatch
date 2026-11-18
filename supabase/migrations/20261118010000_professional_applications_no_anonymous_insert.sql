-- Close the anonymous insert on professional_applications (audit item B16). The app always sends
-- the signed-in user's id; "Authenticated users can apply" already covers it.
DROP POLICY IF EXISTS "Self or anonymous applications" ON public.professional_applications;

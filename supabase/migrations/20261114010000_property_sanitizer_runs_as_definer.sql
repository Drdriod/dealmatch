-- Submitting a listing failed with "permission denied for function fn_sanitize_text".
-- The October hardening removed EXECUTE on fn_sanitize_text from signed-in users, but the property
-- trigger ran as the signed-in user and calls it. The testimonial trigger already runs as its owner.
-- The property trigger does the same now (it uses no per-user data), so the text cleaner stays
-- locked away from direct calls while listings can be saved again.
ALTER FUNCTION public.fn_sanitize_property_inputs()
  SECURITY DEFINER SET search_path = public, extensions, pg_temp;

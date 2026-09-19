-- ============================================================================
-- fn_auto_approve_paid_professional (20260904000003) correctly flips a paid
-- professional_applications row to 'approved' once identity verification
-- passes, but it never touched verified_providers - so an approved paid
-- property professional still had level=0 (or no row at all) and could
-- never appear under Find a Provider, not even behind the Advanced /
-- "Property Professional" filter. That filter reads verified_providers
-- with level >= 2 exclusively (see FindProviderPage.jsx), so this was a
-- dead end for every paying professional: approved in the database, invisible
-- everywhere in the product. Extending the same trigger to also call
-- set_verification_level(level=2) closes that loop, the same way
-- review_verification_submission() already does for the free Skill
-- Verified path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_approve_paid_professional() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_app public.professional_applications%ROWTYPE;
  v_current_level SMALLINT;
BEGIN
  IF NEW.identity_verification_status = 'approved'
     AND (OLD.identity_verification_status IS DISTINCT FROM 'approved') THEN

    UPDATE public.professional_applications
    SET status = 'approved',
        activated_at = now()
    WHERE user_id = NEW.id
      AND status = 'pending'
      AND subscription_start IS NOT NULL -- only ones who already paid
    RETURNING * INTO v_app;

    IF v_app.id IS NOT NULL THEN
      SELECT COALESCE(level, 0) INTO v_current_level
      FROM public.verified_providers WHERE user_id = NEW.id;

      -- Only move forward, never backward - mirrors
      -- review_verification_submission()'s own rule for the free path.
      IF v_current_level IS NULL OR v_current_level < 2 THEN
        PERFORM public.set_verification_level(NEW.id, 2, jsonb_build_object(
          'category_type', 'property_professional',
          'category',      COALESCE(v_app.professional_type, 'Property Professional'),
          'area',           v_app.coverage_areas,
          'open_price',     true,
          'source',         'paid_application'
        ));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_auto_approve_paid_professional failed for profile %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged (same name, same firing conditions) -
-- CREATE OR REPLACE above is sufficient, no DROP/CREATE TRIGGER needed.

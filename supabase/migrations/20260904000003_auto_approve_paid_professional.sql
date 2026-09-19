-- ============================================================================
-- Close the loop opened by the paystack-webhook.js change: a Skilled
-- Professional who pays before their identity is verified is now held at
-- status='pending' (payment info still recorded). The moment an admin
-- approves their identity_verification_status, this trigger automatically
-- flips any of their already-paid professional_applications rows to
-- 'approved' - no re-payment, no separate manual admin step needed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_auto_approve_paid_professional() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF NEW.identity_verification_status = 'approved'
     AND (OLD.identity_verification_status IS DISTINCT FROM 'approved') THEN
    UPDATE public.professional_applications
    SET status = 'approved',
        activated_at = now()
    WHERE user_id = NEW.id
      AND status = 'pending'
      AND subscription_start IS NOT NULL; -- only ones who already paid
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_auto_approve_paid_professional failed for profile %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_paid_professional ON public.profiles;
CREATE TRIGGER trg_auto_approve_paid_professional
  AFTER UPDATE OF identity_verification_status ON public.profiles
  FOR EACH ROW
  WHEN (NEW.identity_verification_status = 'approved')
  EXECUTE FUNCTION public.fn_auto_approve_paid_professional();

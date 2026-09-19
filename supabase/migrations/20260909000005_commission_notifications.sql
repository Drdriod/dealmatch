-- ============================================================================
-- Commission-change notifications, scoped down from the original brief's
-- "notify everyone on every change" to: only fire for a genuinely major
-- move, and only to the providers actually in that category, not a
-- platform-wide blast. A 0.25 point nudge on one category doesn't need to
-- interrupt a user's day.
--
-- THRESHOLD_POINTS below is the one number to tune if "major" needs
-- redefining later, everything else reads from it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_commission_activated() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  THRESHOLD_POINTS CONSTANT NUMERIC := 1.00;  -- percentage points, e.g. 5% -> 6.5% qualifies, 5% -> 5.25% does not
  v_previous_rate  NUMERIC;
  v_delta          NUMERIC;
  v_category_name  TEXT;
BEGIN
  -- Covers both paths into ACTIVE: the scheduler flipping a SCHEDULED row
  -- (UPDATE), and an admin directly inserting a commission that's ACTIVE
  -- from the start with no scheduling step (INSERT). TG_OP distinguishes
  -- them since OLD doesn't exist on INSERT.
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT percentage_rate INTO v_previous_rate
  FROM public.commissions
  WHERE target_category_id IS NOT DISTINCT FROM NEW.target_category_id
    AND id <> NEW.id
    AND status IN ('EXPIRED', 'ARCHIVED')
  ORDER BY updated_at DESC
  LIMIT 1;

  v_delta := ABS(NEW.percentage_rate - COALESCE(v_previous_rate, 0));
  IF v_delta < THRESHOLD_POINTS THEN
    RETURN NEW;  -- not major enough, stay silent
  END IF;

  -- Platform-wide defaults (no category) deliberately do NOT auto-notify
  -- every user, that's the "everyone, every time" fatigue problem this
  -- migration exists to avoid. A change this broad should go through a
  -- deliberate announcement, not an automatic per-user notification.
  IF NEW.target_category_id IS NULL THEN
    RAISE NOTICE 'Major platform-wide commission change (% -> %%%), consider a manual announcement instead of auto-notifying every user', COALESCE(v_previous_rate, 0), NEW.percentage_rate;
    RETURN NEW;
  END IF;

  SELECT name INTO v_category_name FROM public.categories WHERE id = NEW.target_category_id;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT DISTINCT cl.user_id,
    'commission_change',
    'Fee update for ' || COALESCE(v_category_name, 'your category'),
    'The DealMatch fee for ' || COALESCE(v_category_name, 'this category') || ' is now ' || NEW.percentage_rate || '%, effective now.',
    '/how-it-works'
  FROM public.category_listings cl
  WHERE cl.category_id = NEW.target_category_id AND cl.status = 'ACTIVE';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_commission_activated ON public.commissions;
CREATE TRIGGER trg_notify_commission_activated
  AFTER INSERT OR UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_commission_activated();

COMMENT ON FUNCTION public.notify_commission_activated() IS
  'Fires on any transition into ACTIVE (cron-driven or admin-manual). '
  'Only inserts notifications when the rate moved by at least '
  'THRESHOLD_POINTS, and only to providers with an active listing in the '
  'affected category. Platform-wide default changes are logged, not '
  'auto-blasted to every user.';

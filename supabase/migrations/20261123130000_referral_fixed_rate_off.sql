-- Founder decision, 23 Nov 2026: the referral programme pays ONE fixed share, not levels or tiers.
--   * 5% of DealMatch's own commission (before VAT) on payments by the person the referrer invited.
--   * No level 2 or level 3 share; builder, champion and founding rates equal the base rate and no
--     founding places (so every referrer earns the same 5%).
--   * No unlock-credit payout on small deals and no activation bonus credits.
--   * Programme OFF: nothing is earned until the owner switches it on in Admin > Referral settings
--     (after the accountant confirms the tax treatment).
-- Runs after 20261120010000_referral_engine_v2.sql. Settings only; no code or table change.
-- Every change is written to referral_setting_history.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('program_enabled', 0), ('l1_pct', 5), ('l2_pct', 0), ('l3_pct', 0),
      ('builder_l1_pct', 5), ('champion_l1_pct', 5), ('founding_l1_pct', 5), ('founding_slots', 0),
      ('small_deal_naira', 0), ('activation_credits', 0)
    ) AS v(k, val)
  LOOP
    INSERT INTO public.referral_setting_history (key, old_value, new_value, changed_by)
    SELECT s.key, s.value, r.val, NULL FROM public.referral_settings s WHERE s.key = r.k AND s.value <> r.val;
    UPDATE public.referral_settings SET value = r.val, updated_at = now() WHERE key = r.k AND value <> r.val;
  END LOOP;
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES ('referral_settings_fixed_rate_migration', jsonb_build_object('rate_pct', 5, 'program_enabled', 0), NULL);
END $$;

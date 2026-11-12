-- Audit F-001: one referral row per payment, per referrer, per level. The webhook, the "I have
-- paid" button and the reconciliation job can all finish the same payment, so the database is
-- what makes the payout happen once.
CREATE UNIQUE INDEX IF NOT EXISTS referral_transactions_one_per_payment
  ON public.referral_transactions (payment_id, referrer_id, referral_level)
  WHERE payment_id IS NOT NULL AND payout_type IN ('cash', 'points');

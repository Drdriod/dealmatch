-- ============================================================================
-- Retire the registry's marketplace job commission row (October 2026).
--
-- Job commission is set in Commission Schedules (the `commissions` table that
-- accept_bid reads). The registry row 'job_escrow' was a second place to set
-- the same fee and nothing read it, so it is switched off here. It is kept,
-- not deleted, so the change can be reversed from the Monetisation history.
-- ============================================================================

UPDATE public.platform_fees
   SET is_active = false,
       updated_at = now()
 WHERE key = 'job_escrow'
   AND is_active = true;

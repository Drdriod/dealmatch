-- 23. Indexes for three foreign keys the Supabase advisor reported as unindexed.
--
-- Why
--   Without an index on the referencing column, deleting or updating a profile makes the database
--   scan the whole table to check these links, and queries that filter by them are slow. The tables
--   are small today (payment_refunds has 0 rows, disputes has 0), so this is cheap now and
--   expensive to do later.
--
--     payment_refunds.profile_id     -> profiles   (who is owed the refund)
--     payment_refunds.refunded_by    -> profiles   (the staff member who paid it)
--     disputes.assigned_to           -> profiles   (the staff member handling a case)
--
-- Safe to run twice. Only adds indexes. No BEGIN or ROLLBACK: paste as is.

CREATE INDEX IF NOT EXISTS payment_refunds_profile_id_idx
  ON public.payment_refunds (profile_id);

CREATE INDEX IF NOT EXISTS payment_refunds_refunded_by_idx
  ON public.payment_refunds (refunded_by);

CREATE INDEX IF NOT EXISTS disputes_assigned_to_idx
  ON public.disputes (assigned_to);

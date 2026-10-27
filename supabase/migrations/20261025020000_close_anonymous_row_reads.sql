-- 25. Stop three read policies from showing rows that have no owner to everybody.
--
-- What was wrong
--   These policies read: "the row is yours (auth.uid() = user_id) OR user_id IS NULL".
--   The second half was meant for rows saved before sign-in, but a row with no owner is not "yours":
--   it is readable by ANY visitor, signed in or not. Proven on production on 2026-10-25 in a rolled-back
--   test: a logged-out visitor (the `anon` role) read the name, email and phone of an application saved
--   with no user_id.
--       professional_applications  "Users can view own applications"  (anon can read the table's columns)
--       crypto_payments            "Users view own crypto payments"
--       crypto_payments            "Admins read all crypto"
--   The two crypto_payments policies could not be exploited today (no browser role has SELECT on that
--   table, checked 2026-10-25), so changing them is defence in depth: if a grant is ever added, an
--   ownerless row will not leak.
--
-- Nobody has been exposed so far: production has 1 professional application (it has an owner) and
-- 0 crypto payments. The app only ever saves an application while signed in, with user_id set, so
-- removing the "no owner" branch changes nothing for real use.
--
-- What it does
--   Rewrites the three conditions in place (ALTER POLICY, no DROP):
--       own row, or (for the admin policy) an admin.
--   Does not touch who can INSERT, UPDATE or DELETE.
--
-- Safe to run twice. No BEGIN or ROLLBACK: paste as is.

ALTER POLICY "Users can view own applications" ON public.professional_applications
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users view own crypto payments" ON public.crypto_payments
  USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Admins read all crypto" ON public.crypto_payments
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'::text
    )
  );

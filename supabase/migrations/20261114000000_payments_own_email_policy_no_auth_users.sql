-- The "Users can view own payments" rule read the email from auth.users, which the signed-in role
-- may not touch. Postgres checks every read rule on the table, so ANY read of public.payments
-- failed with "permission denied for table users", including the admin Transactions tab.
-- The email is already inside the sign-in token, so the rule now reads it from there.
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT TO public
  USING (email = ((select auth.jwt()) ->> 'email'));

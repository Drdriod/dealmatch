-- Testimonial submission always failed with 42P17 "infinite recursion detected in policy".
-- The INSERT policy's WITH CHECK read the testimonials table itself to enforce
-- "one live story per user". Enforce that with a partial unique index instead, and
-- drop the self-referencing subquery from the policy.
CREATE UNIQUE INDEX IF NOT EXISTS uq_testimonials_one_live_per_user
  ON public.testimonials (user_id)
  WHERE status <> 'rejected';

DROP POLICY IF EXISTS "Users submit own testimonial" ON public.testimonials;
CREATE POLICY "Users submit own testimonial" ON public.testimonials
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');

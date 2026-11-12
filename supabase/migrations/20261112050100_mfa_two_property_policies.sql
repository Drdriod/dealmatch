-- Audit F-006 (completion, part 2): two more policies on properties looked the role up in
-- profiles directly (written with "role = ANY (ARRAY[...])", which the first sweep missed).
ALTER POLICY "Staff can view all properties" ON public.properties
  USING (
    (status = 'active'::text)
    OR ((SELECT auth.uid()) = seller_id)
    OR public.has_mfa_role(ARRAY['admin','agent','verifier'])
  );
ALTER POLICY "Admins and agents manage all properties" ON public.properties
  USING (
    ((SELECT auth.uid()) = seller_id)
    OR public.has_mfa_role(ARRAY['admin','agent'])
  );

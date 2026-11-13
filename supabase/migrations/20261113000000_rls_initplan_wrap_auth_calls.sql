-- F-013: evaluate auth.<fn>() once per query instead of once per row.
-- Same rules as before; only the wrapping changes. ALTER POLICY keeps roles and command.
ALTER POLICY "Authenticated users can apply" ON public.professional_applications
  WITH CHECK (((select auth.role()) = 'authenticated') AND ((select auth.uid()) = user_id));
ALTER POLICY "Authenticated users can submit crypto" ON public.crypto_payments
  WITH CHECK (((select auth.role()) = 'authenticated') AND ((select auth.uid()) = user_id));
ALTER POLICY "Authenticated users can submit enquiry" ON public.rental_enquiries
  WITH CHECK ((select auth.role()) = 'authenticated');
ALTER POLICY "Admins manage pinecone status" ON public.pinecone_index_status
  USING (((select auth.jwt()) ->> 'role') = 'service_role');
ALTER POLICY "Authenticated users can request professionals" ON public.professional_requests
  WITH CHECK (((select auth.role()) = 'authenticated') AND ((select auth.uid()) = user_id));
ALTER POLICY "user_earnings: service role can update" ON public.user_earnings
  USING ((select auth.role()) = 'service_role');
ALTER POLICY "pro_activation: service role can update" ON public.pro_activation_requests
  USING ((select auth.role()) = 'service_role');
ALTER POLICY "service_role_insert_audit_log" ON public.admin_audit_log
  WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "invitee_reads_own_pending_invite" ON public.staff_invites
  USING ((lower(email) = lower((select auth.email()))) AND (status = 'pending'));

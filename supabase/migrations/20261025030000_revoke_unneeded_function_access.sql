-- 26. Take away function access nobody needs. (Supabase advisor: SECURITY DEFINER functions callable
--     by logged-out visitors.)
--
-- What it does
--   * admin_create_platform_fee, admin_set_platform_fee, mark_payment_refunded: staff-only functions
--     that check the caller's role inside. A logged-out visitor can never pass that check, but they
--     can still call the function, so each call is a free attempt and shows up in the API as exposed.
--     Execute is removed from logged-out visitors. Signed-in users and the server keep it, exactly as
--     before, so the admin screens work the same.
--   * log_transaction_change: a trigger function. Triggers do not need the caller to hold execute, so
--     nobody else should either. Execute is removed from every browser role. The transaction log keeps
--     working: that is tested in the dry run.
--
-- What it does NOT touch
--   The helper functions that row policies call as the visitor (is_admin, is_staff, get_my_role and
--   similar). Taking those away from logged-out visitors would make public reads fail.
--
-- Safe to run twice. No BEGIN or ROLLBACK: paste as is.

REVOKE ALL ON FUNCTION public.admin_create_platform_fee(text, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_platform_fee(text, text, text, text, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_platform_fee(text, numeric, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_fee(text, numeric, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_payment_refunded(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payment_refunded(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_transaction_change() FROM PUBLIC, anon, authenticated;

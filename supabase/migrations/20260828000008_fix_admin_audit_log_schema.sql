-- ============================================================================
-- Fix admin_audit_log: every audit-writing function in this project -
-- including fn_audit_admin_action(), which already existed in the original
-- baseline schema before any of my migrations - inserts
-- (action, metadata, performed_by). The real table only ever had
-- (id, action, meta, created_at). No "metadata" column, no "performed_by"
-- column. That means every one of these has been silently failing since
-- before this round of fixes even started:
--
--   - fn_audit_admin_action()                 (pre-existing, baseline schema)
--   - cancel_transaction()                     (20260828000002)
--   - fn_lock_sensitive_profile_columns()      (20260828000003)
--   - accept_staff_invite()                    (20260828000004)
--   - process_referral_payouts_for_transaction (20260828000007)
--   - the staff-invite API's admin_audit_log insert (api/admin/[resource].js)
--
-- I modeled all the new ones after the existing fn_audit_admin_action()
-- without checking it against the live table first - that was the mistake.
-- The real "column does not exist" error only surfaced now because the
-- Pipeline page's Cancel button was the first UI action to actually
-- trigger one of these inserts and show the resulting error to a person
-- rather than swallowing it silently.
--
-- Fix: add the two columns every one of those inserts already expects,
-- rather than rewriting six call sites. This is retroactive - once this
-- runs, all of the above start working with no other changes needed.
-- The old `meta` text column is unused anywhere (verified: nothing reads
-- from it) and is left in place as harmless legacy rather than dropped,
-- since dropping a column is the one kind of schema change that can't be
-- undone by re-running a corrected migration.
-- ============================================================================

ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS target_id UUID;
-- target_id: api/admin/[resource].js's role-change audit insert also
-- references this column (the user a role change or suspension was
-- applied *to*, distinct from performed_by, the admin who did it) and it
-- was equally nonexistent. That insert is wrapped in .catch(() => {}), so
-- it was failing completely silently - the role change itself always
-- succeeded, but no audit record was ever actually written for it.

CREATE INDEX IF NOT EXISTS admin_audit_log_performed_by_idx ON public.admin_audit_log (performed_by);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

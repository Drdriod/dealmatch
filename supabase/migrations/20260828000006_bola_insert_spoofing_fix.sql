-- ============================================================================
-- BOLA / identity-spoofing fix: two INSERT policies only checked that the
-- caller was signed in, not that the row they were inserting actually
-- belonged to them.
--
-- "Auth users file disputes" WITH CHECK (auth.uid() IS NOT NULL) let any
-- logged-in user insert a disputes row with reporter_id set to ANYONE's
-- id - so User A could file a dispute that appears to have been reported
-- by User B, with no relationship to the actual login making the request.
--
-- "Auth users submit crypto" had the identical shape on crypto_payments.user_id
-- - any authenticated user could insert a payment record claiming to be
-- for a different user_id than their own.
--
-- property_reviews already got this right (WITH CHECK (auth.uid() =
-- reviewer_id)) - these two are brought in line with that pattern.
-- ============================================================================

DROP POLICY IF EXISTS "Auth users file disputes" ON public.disputes;
CREATE POLICY "Auth users file disputes" ON public.disputes
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Auth users submit crypto" ON public.crypto_payments;
CREATE POLICY "Auth users submit crypto" ON public.crypto_payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- "Anyone can submit crypto payment" (WITH CHECK (true), no role
-- restriction - applies to PUBLIC, including anon) sat alongside the two
-- policies above. Because RLS permissive policies are OR'd, this one alone
-- meant literally anyone, signed in or not, could insert a crypto_payments
-- row with an arbitrary user_id, making every other check on this table
-- pointless. "Authenticated users can submit crypto" (auth.uid() = user_id)
-- already covers the legitimate case correctly, so this is a straight
-- removal, not a replacement.
DROP POLICY IF EXISTS "Anyone can submit crypto payment" ON public.crypto_payments;

-- ----------------------------------------------------------------------------
-- Same "true, no ownership check" shape found on three more tables while
-- auditing for the pattern above. Two are financial ledgers, which makes
-- this more than an information-disclosure issue.
-- ----------------------------------------------------------------------------

-- professional_applications: any authenticated user could submit an
-- application row with user_id set to someone else's account, attributing
-- an application (and whatever admin follow-up it triggers) to a person
-- who never applied. Anonymous applications (user_id IS NULL) still work.
DROP POLICY IF EXISTS "Public can insert applications" ON public.professional_applications;
CREATE POLICY "Self or anonymous applications" ON public.professional_applications
  FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- notifications: "System can insert notifications" (WITH CHECK (true)) was
-- named as though only backend code used it, but nothing enforced that -
-- any authenticated user could insert directly into another user's
-- notification feed. The app's own notifyUser() helper legitimately
-- notifies a *different* user_id all the time (e.g. "you got a message"),
-- so this cannot simply become auth.uid() = user_id without breaking that
-- feature. What it can safely require: the link field can only ever be a
-- relative in-app path, never an absolute URL - closing off the most
-- damaging use of this hole, a notification that looks like it's from
-- DealMatch but points at an external phishing page. Every real call site
-- already only ever sends relative paths like '/dashboard' or '/referrals'.
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Users notify with safe relative links only" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (link IS NULL OR link LIKE '/%')
    AND length(title) <= 200
    AND length(message) <= 1000
  );

-- loyalty_points: "System manages points" had no FOR clause at all, which
-- Postgres treats as FOR ALL, and only a WITH CHECK (true) with no USING -
-- which Postgres then also uses as USING when none is given. That combination
-- meant any authenticated user (this policy carried no TO restriction) could
-- read, overwrite, or delete ANY OTHER user's points balance outright, not
-- just their own. Replaced with an owner-scoped policy; service_role writes
-- (the paystack webhook's authoritative point-crediting path) bypass RLS
-- entirely as the table owner already, so this does not affect it.
DROP POLICY IF EXISTS "System manages points" ON public.loyalty_points;
CREATE POLICY "Owner writes own loyalty points row" ON public.loyalty_points
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- ("Users view own points" already exists and correctly scopes SELECT to
-- auth.uid() = user_id - not duplicated here.)

-- referral_transactions: same "true" shape, and this is the one that pays
-- out real money. Restricting INSERT to referrer_id = auth.uid() stops
-- User A from writing a transaction that frames User B as the referrer
-- (or targets an arbitrary referee_id) - the direct cross-user isolation
-- fix. It intentionally does NOT fully solve self-serving fraud (a user
-- crediting *themselves* an inflated referral_earning for a deal they
-- were not actually part of) - that needs the amount and relationship
-- validated against the real transaction/profiles data, which belongs in
-- a proper server-side RPC or the existing paystack-webhook path, not a
-- client-writable table. Flagging this here rather than silently leaving
-- it unaddressed: src/lib/referral.js currently writes to this table
-- directly from the browser for the client-side referral flow, and that
-- whole path should be moved behind a validated RPC in a follow-up.
DROP POLICY IF EXISTS "System can insert referral transactions" ON public.referral_transactions;
CREATE POLICY "Referrer-scoped referral transaction insert" ON public.referral_transactions
  FOR INSERT WITH CHECK (auth.uid() = referrer_id);

-- ═══════════════════════════════════════════════════════════════════════
-- DealMatch — Notifications System
-- Run in Supabase SQL Editor
--
-- Powers automatic in-app popup + bell notifications whenever a referral
-- payout or points award happens. Paired with referral.js automation so
-- no one ever has to be manually looked up or notified by hand.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,   -- 'referral_cash' | 'referral_points' | 'points_redeemed' | 'listing_approved' | 'booking_conflict' | 'general'
  title       text NOT NULL,
  message     text NOT NULL,
  amount      numeric,         -- cash or points amount, if applicable
  link        text,            -- where tapping the notification should navigate to
  read        boolean DEFAULT false,
  email_sent  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read, created_at DESC);

-- Enable realtime so the bell/popup updates instantly without polling
-- Safe to re-run: DO block checks if already a member before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

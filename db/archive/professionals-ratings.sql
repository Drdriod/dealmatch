-- Professional ratings & reviews
CREATE TABLE IF NOT EXISTS public.professional_reviews (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id     text NOT NULL,
  reviewer_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name       text NOT NULL,
  rating              numeric(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text         text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
ON public.professional_reviews FOR SELECT USING (true);

CREATE POLICY "Auth users can write reviews"
ON public.professional_reviews FOR INSERT
WITH CHECK (auth.uid() = reviewer_id);

-- Add rating columns to professional_applications
ALTER TABLE public.professional_applications
  ADD COLUMN IF NOT EXISTS rating       numeric(2,1) DEFAULT 4.5,
  ADD COLUMN IF NOT EXISTS review_count int          DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified  boolean      DEFAULT true,
  ADD COLUMN IF NOT EXISTS avatar_url   text;

-- Professional contact requests (replaces WhatsApp redirect)
CREATE TABLE IF NOT EXISTS public.professional_requests (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  professional_id     text NOT NULL,
  professional_type   text NOT NULL,
  professional_name   text NOT NULL,
  client_name         text NOT NULL,
  client_phone        text NOT NULL,
  client_email        text,
  details             text,
  urgency             text DEFAULT 'normal' CHECK (urgency IN ('normal','soon','urgent')),
  status              text DEFAULT 'pending' CHECK (status IN ('pending','connected','completed','cancelled')),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create requests"
ON public.professional_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own requests"
ON public.professional_requests FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_reviews_pro ON public.professional_reviews(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_requests_type ON public.professional_requests(professional_type, status);
CREATE INDEX IF NOT EXISTS idx_pro_requests_user ON public.professional_requests(user_id);

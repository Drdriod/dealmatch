-- ═══════════════════════════════════════════════════════════════════════
-- DealMatch — Student Hostels Feature Migration
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Nigerian Universities / Polytechnics / Colleges ─────────────────
CREATE TABLE IF NOT EXISTS public.institutions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  short_name text,               -- e.g. "UNILAG", "OAU"
  state      text NOT NULL,
  city       text NOT NULL,
  type       text DEFAULT 'university' CHECK (type IN ('university','polytechnic','college')),
  created_at timestamptz DEFAULT now()
);

-- Seed with major Nigerian institutions
INSERT INTO public.institutions (name, short_name, state, city, type) VALUES
  ('University of Lagos','UNILAG','Lagos','Yaba','university'),
  ('Lagos State University','LASU','Lagos','Ojo','university'),
  ('Obafemi Awolowo University','OAU','Osun','Ile-Ife','university'),
  ('University of Ibadan','UI','Oyo','Ibadan','university'),
  ('University of Nigeria Nsukka','UNN','Enugu','Nsukka','university'),
  ('Nnamdi Azikiwe University','UNIZIK','Anambra','Awka','university'),
  ('University of Benin','UNIBEN','Edo','Benin City','university'),
  ('Ambrose Alli University','AAU','Edo','Ekpoma','university'),
  ('Delta State University','DELSU','Delta','Abraka','university'),
  ('Rivers State University','RSU','Rivers','Port Harcourt','university'),
  ('University of Port Harcourt','UNIPORT','Rivers','Port Harcourt','university'),
  ('University of Abuja','UNIABUJA','Abuja (FCT)','Gwagwalada','university'),
  ('Ahmadu Bello University','ABU','Kaduna','Zaria','university'),
  ('Bayero University Kano','BUK','Kano','Kano','university'),
  ('University of Ilorin','UNILORIN','Kwara','Ilorin','university'),
  ('Federal University of Technology Akure','FUTA','Ondo','Akure','university'),
  ('Federal University of Technology Minna','FUTMINNA','Niger','Minna','university'),
  ('Covenant University','CU','Ogun','Ota','university'),
  ('Babcock University','Babcock','Ogun','Ilishan-Remo','university'),
  ('Lagos State Polytechnic','LASPOTECH','Lagos','Ikorodu','polytechnic'),
  ('Yaba College of Technology','YabaTech','Lagos','Yaba','polytechnic'),
  ('Federal Polytechnic Nekede','FPN','Imo','Owerri','polytechnic'),
  ('Enugu State University of Science and Technology','ESUT','Enugu','Enugu','university'),
  ('Imo State University','IMSU','Imo','Owerri','university'),
  ('Abia State University','ABSU','Abia','Uturu','university'),
  ('Cross River University of Technology','CRUTECH','Cross River','Calabar','university'),
  ('Usman Dan Fodio University','UDUS','Sokoto','Sokoto','university')
ON CONFLICT DO NOTHING;

-- ─── 2. Student Hostels table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_hostels (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Listing details
  title            text NOT NULL,
  description      text,
  address          text NOT NULL,
  city             text NOT NULL,
  state            text NOT NULL,
  latitude         numeric,
  longitude        numeric,

  -- Academic targeting
  institution_id   uuid REFERENCES public.institutions(id),
  institution_name text,               -- stored flat for display speed
  distance_km      numeric,            -- walking distance to campus
  distance_label   text,               -- e.g. "5 min walk", "10 min drive"

  -- Room details
  room_type        text NOT NULL CHECK (room_type IN ('single','shared_2','shared_4','shared_6','self_contain','mini_flat','2_bedroom')),
  gender_policy    text DEFAULT 'mixed' CHECK (gender_policy IN ('male_only','female_only','mixed')),
  rooms_available  int  DEFAULT 1,
  total_rooms      int  DEFAULT 1,
  price_per_year   numeric NOT NULL,   -- annual rent in NGN
  caution_fee      numeric DEFAULT 0,  -- refundable caution
  agency_fee       numeric DEFAULT 0,

  -- Amenities
  amenities        text[] DEFAULT '{}',-- wifi, gen, water, security, etc.
  images           text[] DEFAULT '{}',

  -- Listing status
  status           text DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review','active','paused','rejected','filled')),
  listing_paid     boolean DEFAULT false,
  listing_paid_at  timestamptz,
  payment_ref      text,

  -- Verification
  verified         boolean DEFAULT false,
  verified_by      uuid REFERENCES auth.users(id),
  verified_at      timestamptz,

  -- Meta
  views            int DEFAULT 0,
  enquiry_count    int DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ─── 3. Student verification table ───────────────────────────────────────
-- Students must verify their student status to access contact details
CREATE TABLE IF NOT EXISTS public.student_verifications (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  institution_id    uuid REFERENCES public.institutions(id),
  institution_name  text,
  matric_number     text,
  jamb_reg_number   text,              -- alternative for freshers without matric no.
  application_number text,             -- given when purchasing admission form / pre-admission
  school_email      text,
  id_image_url      text,             -- uploaded student ID card photo
  status            text DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  rejection_reason  text,
  reviewed_by       uuid REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ─── 4. Hostel enquiries ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hostel_enquiries (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hostel_id      uuid REFERENCES public.student_hostels(id) ON DELETE CASCADE,
  student_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  student_name   text,
  student_phone  text,
  student_email  text,
  matric_number  text,
  message        text,
  move_in_date   date,
  status         text DEFAULT 'pending' CHECK (status IN ('pending','contacted','converted','closed')),
  created_at     timestamptz DEFAULT now()
);

-- ─── 5. Hostel listing fee payments ──────────────────────────────────────
-- Separate from properties payments for clarity
CREATE TABLE IF NOT EXISTS public.hostel_payments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hostel_id    uuid REFERENCES public.student_hostels(id) ON DELETE SET NULL,
  owner_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference    text UNIQUE NOT NULL,
  amount       numeric NOT NULL,       -- in NGN
  plan         text NOT NULL CHECK (plan IN ('semester','annual')),
  status       text DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  paid_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ─── 6. Add is_student_verified flag to profiles ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_student_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_institution text;

-- ─── 7. RLS Policies ─────────────────────────────────────────────────────

-- Institutions: public read
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read institutions" ON public.institutions
  FOR SELECT USING (true);

-- Hostels: public read active, owner manages own
ALTER TABLE public.student_hostels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active hostels" ON public.student_hostels
  FOR SELECT USING (status = 'active' OR auth.uid() = owner_id);

CREATE POLICY "Owner insert hostel" ON public.student_hostels
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner update hostel" ON public.student_hostels
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin manage all hostels" ON public.student_hostels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','verifier'))
  );

-- Student verifications: user manages own, admin reads all
ALTER TABLE public.student_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manage own verification" ON public.student_verifications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admin read all verifications" ON public.student_verifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','verifier'))
  );

CREATE POLICY "Admin update verifications" ON public.student_verifications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','verifier'))
  );

-- Hostel enquiries
ALTER TABLE public.hostel_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student inserts enquiry" ON public.hostel_enquiries
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owner reads own hostel enquiries" ON public.hostel_enquiries
  FOR SELECT USING (
    auth.uid() = student_id
    OR EXISTS (
      SELECT 1 FROM public.student_hostels h
      WHERE h.id = hostel_id AND h.owner_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hostel payments
ALTER TABLE public.hostel_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own hostel payments" ON public.hostel_payments
  FOR SELECT USING (
    auth.uid() = owner_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owner inserts hostel payment" ON public.hostel_payments
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- ─── 8. Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_hostels_institution ON public.student_hostels(institution_id);
CREATE INDEX IF NOT EXISTS idx_student_hostels_status      ON public.student_hostels(status);
CREATE INDEX IF NOT EXISTS idx_student_hostels_state       ON public.student_hostels(state);
CREATE INDEX IF NOT EXISTS idx_student_verifications_user  ON public.student_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_hostel_enquiries_hostel     ON public.hostel_enquiries(hostel_id);

-- ─── 9. Add 'hostel' category to properties check constraint ─────────────
-- (Only if your DB allows it — otherwise student_hostels is its own table)
-- ALTER TABLE public.properties
--   DROP CONSTRAINT IF EXISTS properties_category_check;
-- ALTER TABLE public.properties
--   ADD CONSTRAINT properties_category_check
--   CHECK (category IN ('sale','rental','shortlet','hotel','hostel'));

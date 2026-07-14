-- Rental interest / enquiry form submissions
CREATE TABLE IF NOT EXISTS public.rental_enquiries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  tenant_name   text NOT NULL,
  tenant_phone  text NOT NULL,
  tenant_email  text,
  move_in_date  date,
  duration      int DEFAULT 12,
  message       text,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','contacted','converted','closed')),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit enquiry"
ON public.rental_enquiries FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can manage enquiries"
ON public.rental_enquiries FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_rental_enquiries_property ON public.rental_enquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_enquiries_status   ON public.rental_enquiries(status);

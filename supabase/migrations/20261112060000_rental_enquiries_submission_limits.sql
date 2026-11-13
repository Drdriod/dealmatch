-- Audit F-022: the public enquiry form accepted unlimited submissions from anyone.
-- A person (identified by phone, email or account) may send at most 5 enquiries an hour and 15 a
-- day, and the text fields are bounded. Real tenants asking about several homes stay well inside this.
CREATE OR REPLACE FUNCTION public.fn_limit_rental_enquiries() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_hour int;
  v_day  int;
BEGIN
  IF length(COALESCE(NEW.tenant_name, '')) > 120 OR length(COALESCE(NEW.tenant_phone, '')) > 30
     OR length(COALESCE(NEW.tenant_email, '')) > 200 OR length(COALESCE(NEW.message, '')) > 2000 THEN
    RAISE EXCEPTION 'One of the enquiry fields is too long' USING ERRCODE = '22001';
  END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'),
         count(*) FILTER (WHERE created_at > now() - interval '1 day')
    INTO v_hour, v_day
    FROM public.rental_enquiries
   WHERE created_at > now() - interval '1 day'
     AND ( (NEW.tenant_phone IS NOT NULL AND tenant_phone = NEW.tenant_phone)
        OR (NEW.tenant_email IS NOT NULL AND lower(tenant_email) = lower(NEW.tenant_email))
        OR (NEW.user_id IS NOT NULL AND user_id = NEW.user_id) );

  IF v_hour >= 5 OR v_day >= 15 THEN
    RAISE EXCEPTION 'Too many enquiries sent. Please try again later.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_limit_rental_enquiries ON public.rental_enquiries;
CREATE TRIGGER trg_limit_rental_enquiries BEFORE INSERT ON public.rental_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.fn_limit_rental_enquiries();

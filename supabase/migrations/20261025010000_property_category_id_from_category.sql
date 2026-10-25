-- 24. Fill properties.category_id from the old properties.category word.
--
-- Why
--   Category pages list places through properties.category_id, but the listing forms, the WhatsApp
--   engine and everything else only ever write the old `category` word ('sale', 'rental',
--   'shortlet', 'hotel'). Nothing wrote category_id, so every category page was empty even when
--   listings existed. One database trigger fixes it for every writer at once.
--
-- What it does
--   Before a property is inserted, or its `category` changes, and only if category_id is still empty,
--   it sets category_id to the matching leaf category:
--       sale      -> homes-residential-sales
--       rental    -> annual-leases
--       shortlet  -> short-lets-serviced-apartments
--       hotel     -> hotels-boutique-stays
--   A word not in this list, or a category that is missing or switched off, leaves category_id empty
--   (nothing fails). A category_id that is already set is never changed. Existing rows are filled the
--   same way (production has 0 properties today).
--
-- Safe to run twice. No BEGIN or ROLLBACK: paste as is.

CREATE OR REPLACE FUNCTION public.fn_set_property_category_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_slug := CASE lower(btrim(coalesce(NEW.category::text, '')))
    WHEN 'sale'     THEN 'homes-residential-sales'
    WHEN 'rental'   THEN 'annual-leases'
    WHEN 'shortlet' THEN 'short-lets-serviced-apartments'
    WHEN 'hotel'    THEN 'hotels-boutique-stays'
    ELSE NULL
  END;
  IF v_slug IS NOT NULL THEN
    SELECT c.id INTO NEW.category_id
      FROM public.categories c
     WHERE c.slug = v_slug AND COALESCE(c.is_active, true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_property_category_id() FROM PUBLIC, anon, authenticated;

-- Named so it fires after the existing property guards (trg_guard_..., trg_sanitize_...).
CREATE OR REPLACE TRIGGER trg_set_property_category_id
  BEFORE INSERT OR UPDATE OF category ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_property_category_id();

-- Rows that exist already.
UPDATE public.properties p
   SET category_id = c.id
  FROM public.categories c
 WHERE p.category_id IS NULL
   AND COALESCE(c.is_active, true)
   AND c.slug = CASE lower(btrim(coalesce(p.category::text, '')))
        WHEN 'sale'     THEN 'homes-residential-sales'
        WHEN 'rental'   THEN 'annual-leases'
        WHEN 'shortlet' THEN 'short-lets-serviced-apartments'
        WHEN 'hotel'    THEN 'hotels-boutique-stays'
      END;

-- Campaign pages: STAGING ONLY. Runs in one transaction and rolls back on purpose.
-- Expected result: an error whose message is CAMPAIGN_TESTS_PASSED (rolled back on purpose).
DO $$
DECLARE
  v_id uuid;
  v_json jsonb;
  v_res jsonb;
  v_n int;
  v_ok boolean;
BEGIN
  INSERT INTO public.campaign_pages (slug, title, headline, status)
  VALUES ('test-land-page', 'Test land page', 'Land for sale in Uyo', 'draft') RETURNING id INTO v_id;

  -- 1. A draft is invisible to the public function and takes no enquiries or visits.
  IF public.get_published_campaign('test-land-page') IS NOT NULL THEN RAISE EXCEPTION 'FAIL 1: draft was readable'; END IF;
  BEGIN
    PERFORM public.submit_campaign_lead('test-land-page','Ada Obi','08031234567',NULL,'hi',true,'email1','{}');
    RAISE EXCEPTION 'FAIL 1b: draft took an enquiry';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM public.record_campaign_visit('test-land-page','email1');
  SELECT count(*) INTO v_n FROM public.campaign_visits WHERE campaign_id = v_id;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL 1c: draft visit was counted'; END IF;

  -- 2. Publishing makes it public, without private fields.
  UPDATE public.campaign_pages SET status='published', notify_email='owner@example.com',
         facts='[{"label":"Size","value":"about 700 sqm"}]'::jsonb WHERE id = v_id;
  v_json := public.get_published_campaign('TEST-land-page');
  IF v_json IS NULL OR v_json->>'headline' <> 'Land for sale in Uyo' THEN RAISE EXCEPTION 'FAIL 2: published page not readable'; END IF;
  IF v_json ? 'notify_email' OR v_json ? 'created_by' OR v_json ? 'trust_claims_approved' THEN RAISE EXCEPTION 'FAIL 2b: private field exposed'; END IF;
  IF (SELECT published_at FROM public.campaign_pages WHERE id = v_id) IS NULL THEN RAISE EXCEPTION 'FAIL 2c: published_at not set'; END IF;

  -- 3. Trust words need a deliberate tick.
  BEGIN
    UPDATE public.campaign_pages SET description = 'Fully escrow protected sale' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL 3: escrow wording published without approval';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.campaign_pages SET description = 'Fully escrow protected sale', trust_claims_approved = true WHERE id = v_id;
  UPDATE public.campaign_pages SET description = NULL, trust_claims_approved = false WHERE id = v_id;

  -- 4. Enquiries.
  BEGIN
    PERFORM public.submit_campaign_lead('test-land-page','Ada Obi','08031234567',NULL,'hi',false,'email1','{}');
    RAISE EXCEPTION 'FAIL 4a: saved without consent';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.submit_campaign_lead('test-land-page','Ada Obi',NULL,NULL,'hi',true,'email1','{}');
    RAISE EXCEPTION 'FAIL 4b: saved without phone or email';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  v_res := public.submit_campaign_lead('test-land-page','Ada Obi','0803 123 4567','','Is it still available?',true,'Email1','{"utm_campaign":"nov"}');
  IF (v_res->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL 4c: first enquiry marked duplicate'; END IF;
  IF v_res->>'notify_email' <> 'owner@example.com' THEN RAISE EXCEPTION 'FAIL 4d: notify email not returned to server'; END IF;
  IF (SELECT phone FROM public.campaign_leads WHERE id = (v_res->>'id')::uuid) <> '08031234567' THEN RAISE EXCEPTION 'FAIL 4e: phone not cleaned'; END IF;
  IF (SELECT source FROM public.campaign_leads WHERE id = (v_res->>'id')::uuid) <> 'email1' THEN RAISE EXCEPTION 'FAIL 4f: source not lower-cased'; END IF;
  IF (SELECT consent_text FROM public.campaign_leads WHERE id = (v_res->>'id')::uuid) IS NULL THEN RAISE EXCEPTION 'FAIL 4g: consent text not stored'; END IF;
  v_res := public.submit_campaign_lead('test-land-page','Ada Obi','08031234567',NULL,'again',true,'email1','{}');
  IF NOT (v_res->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL 4h: double send saved twice'; END IF;
  SELECT count(*) INTO v_n FROM public.campaign_leads WHERE campaign_id = v_id;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 4i: expected 1 enquiry, found %', v_n; END IF;

  -- 5. Visits count per day and source.
  PERFORM public.record_campaign_visit('test-land-page','email1');
  PERFORM public.record_campaign_visit('test-land-page','email1');
  PERFORM public.record_campaign_visit('test-land-page','fb-ad');
  PERFORM public.record_campaign_visit('test-land-page','Bad Source!');
  IF (SELECT sum(visits) FROM public.campaign_visits WHERE campaign_id = v_id AND source='email1') <> 2 THEN RAISE EXCEPTION 'FAIL 5a: email1 visits'; END IF;
  IF (SELECT sum(visits) FROM public.campaign_visits WHERE campaign_id = v_id AND source='other') <> 1 THEN RAISE EXCEPTION 'FAIL 5b: bad source not mapped to other'; END IF;

  -- 6. The public roles cannot reach the tables or the server-only functions.
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.campaign_pages LIMIT 1;
    RESET ROLE; RAISE EXCEPTION 'FAIL 6a: anon read campaign_pages';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.campaign_leads LIMIT 1;
    RESET ROLE; RAISE EXCEPTION 'FAIL 6b: anon read campaign_leads';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.submit_campaign_lead('test-land-page','Eve','08099999999',NULL,'x',true,'x','{}');
    RESET ROLE; RAISE EXCEPTION 'FAIL 6c: anon called submit_campaign_lead';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_visit('test-land-page','x');
    RESET ROLE; RAISE EXCEPTION 'FAIL 6d: anon called record_campaign_visit';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;
  SET LOCAL ROLE anon;
  v_json := public.get_published_campaign('test-land-page');
  RESET ROLE;
  IF v_json IS NULL THEN RAISE EXCEPTION 'FAIL 6e: anon cannot read a published page through the function'; END IF;

  -- 7. A signed-in non-staff user sees nothing and cannot call the stats.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SELECT count(*) INTO v_n FROM public.campaign_leads;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'FAIL 7a: non-staff read enquiries'; END IF;
  BEGIN
    PERFORM * FROM public.admin_campaign_stats();
    RESET ROLE; RAISE EXCEPTION 'FAIL 7b: non-staff read stats';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; END;

  -- 8. Archiving closes the page.
  UPDATE public.campaign_pages SET status='archived' WHERE id = v_id;
  IF public.get_published_campaign('test-land-page') IS NOT NULL THEN RAISE EXCEPTION 'FAIL 8: archived page still readable'; END IF;

  RAISE EXCEPTION 'CAMPAIGN_TESTS_PASSED (rolled back on purpose)';
END $$;

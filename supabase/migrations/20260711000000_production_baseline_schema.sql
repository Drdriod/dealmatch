--
-- PostgreSQL database dump
--

\restrict 8Y5ov9mBHGWzRahYZ8un5nNtRy1AEDyOElNRzB90deAxLExMtYvndnPThoR40XI

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: calculate_lead_score(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_lead_score(p_intent text, p_timeline text, p_budget text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN (
    CASE p_intent
      WHEN 'urgent_buyer'     THEN 40
      WHEN 'make_offer'       THEN 35
      WHEN 'schedule_viewing' THEN 25
      WHEN 'interested'       THEN 15
      ELSE 5
    END
    +
    CASE p_timeline
      WHEN 'immediate' THEN 30
      WHEN '1_month'   THEN 20
      WHEN '3_months'  THEN 10
      WHEN '6_months'  THEN 5
      ELSE 0
    END
    +
    CASE WHEN p_budget IS NOT NULL AND p_budget <> '' THEN 10 ELSE 0 END
  );
END;$$;


--
-- Name: check_booking_availability(uuid, date, date, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_booking_availability(p_property_id uuid, p_checkin date, p_checkout date, p_rooms integer DEFAULT 1, p_category_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_available int;
  v_booked    int;
BEGIN
  IF p_category_id IS NOT NULL THEN
    SELECT available_rooms INTO v_available
      FROM public.room_categories WHERE id = p_category_id AND is_active = true;
  ELSE
    SELECT COALESCE(SUM(available_rooms), 0) INTO v_available
      FROM public.room_categories WHERE property_id = p_property_id AND is_active = true;
  END IF;
  IF v_available IS NULL THEN v_available := 0; END IF;
  SELECT COALESCE(SUM(rooms_booked), 0) INTO v_booked
    FROM public.bookings
   WHERE property_id = p_property_id
     AND status NOT IN ('cancelled','no_show')
     AND checkin_date < p_checkout
     AND checkout_date > p_checkin
     AND (p_category_id IS NULL OR category_id = p_category_id);
  RETURN (v_available - v_booked) >= p_rooms;
END;$$;


--
-- Name: check_device_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_device_exists(p_fingerprint text) RETURNS TABLE(exists_count integer, existing_email text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::int, MIN(p.email)
  FROM public.profiles p
  WHERE p.device_fingerprint = p_fingerprint
    AND p_fingerprint IS NOT NULL
    AND p_fingerprint != '';
$$;


--
-- Name: check_email_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_exists(p_email text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)
  );
$$;


--
-- Name: check_phone_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_phone_exists(p_phone text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = p_phone
  );
$$;


--
-- Name: check_signup_conflicts(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_signup_conflicts(p_email text, p_phone text DEFAULT NULL::text, p_username text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_email_taken    boolean := false;
  v_phone_taken    boolean := false;
  v_username_taken boolean := false;
BEGIN
  -- Check email in auth.users (catches ALL signup methods)
  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE LOWER(email) = LOWER(p_email) AND deleted_at IS NULL
  ) INTO v_email_taken;

  -- Check phone in profiles
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE phone = p_phone AND phone IS NOT NULL AND phone <> ''
    ) INTO v_phone_taken;
  END IF;

  -- Check username in profiles
  IF p_username IS NOT NULL AND p_username <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE LOWER(username) = LOWER(p_username) AND username IS NOT NULL
    ) INTO v_username_taken;
  END IF;

  RETURN json_build_object(
    'email_taken',    v_email_taken,
    'phone_taken',    v_phone_taken,
    'username_taken', v_username_taken,
    'any_conflict',   v_email_taken OR v_phone_taken OR v_username_taken
  );
END;
$$;


--
-- Name: check_username_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_username_exists(p_username text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  );
$$;


--
-- Name: confirm_referral_earning(uuid, text, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_referral_earning(p_referee_id uuid, p_payment_id text, p_transaction_type text, p_deal_amount numeric, p_platform_fee numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_referrer_id      uuid;
  v_referral_rate    numeric := 0.10;
  v_referral_earning numeric;
BEGIN
  SELECT invited_by INTO v_referrer_id
  FROM public.profiles WHERE id = p_referee_id;

  IF v_referrer_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.referral_transactions WHERE payment_id = p_payment_id
  ) THEN RETURN; END IF;

  v_referral_earning := ROUND(p_platform_fee * v_referral_rate, 2);

  INSERT INTO public.referral_transactions (
    referrer_id, referee_id, payment_id, transaction_type,
    deal_amount, referral_rate, platform_fee, referral_earning, status, confirmed_at
  ) VALUES (
    v_referrer_id, p_referee_id, p_payment_id, p_transaction_type,
    p_deal_amount, v_referral_rate, p_platform_fee, v_referral_earning, 'confirmed', NOW()
  );

  UPDATE public.profiles
  SET referral_earnings = COALESCE(referral_earnings, 0) + v_referral_earning
  WHERE id = v_referrer_id;
END;
$$;


--
-- Name: fn_audit_admin_action(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_admin_action() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.admin_audit_log (action, metadata, performed_by)
  VALUES (
    TG_ARGV[0],
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id,
      'new_status', CASE TG_TABLE_NAME
        WHEN 'properties' THEN NEW.status
        WHEN 'profiles'   THEN NEW.identity_verification_status
        ELSE NULL
      END
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$$;


--
-- Name: fn_auto_release_expired_escrows(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_release_expired_escrows() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  released integer := 0;
  esc_row  public.escrow_transactions%ROWTYPE;
BEGIN
  FOR esc_row IN
    SELECT * FROM public.escrow_transactions
    WHERE status = 'funded'
      AND transaction_type = 'rental'
      AND auto_release_at IS NOT NULL
      AND auto_release_at <= now()
      AND dispute_filed_at IS NULL
      AND confirmed_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.escrow_transactions
    SET status = 'released', released_at = now()
    WHERE id = esc_row.id;

    -- Write audit entry
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES ('escrow_auto_released_72h',
      jsonb_build_object('escrow_id', esc_row.id, 'property_id', esc_row.property_id),
      NULL);

    -- Trigger payout split
    PERFORM public.fn_calculate_revenue_split(esc_row.id);

    released := released + 1;
  END LOOP;
  RETURN released;
END;
$$;


--
-- Name: fn_calculate_revenue_split(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calculate_revenue_split(p_escrow_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  esc         public.escrow_transactions%ROWTYPE;
  plat_amt    numeric;
  agent_amt   numeric;
  ref_amt     numeric;
  owner_amt   numeric;
  ref_id      uuid;
BEGIN
  -- Lock the row to prevent concurrent execution
  SELECT * INTO esc
  FROM public.escrow_transactions
  WHERE id = p_escrow_id
  FOR UPDATE;

  -- Guard: only process once
  IF esc.payout_locked THEN
    RAISE EXCEPTION 'Payout already processed for escrow %', p_escrow_id;
  END IF;

  -- Mark as locked immediately
  UPDATE public.escrow_transactions
  SET payout_locked = true
  WHERE id = p_escrow_id;

  -- ── RENTAL: 7.5% total (3.75% each side) ──────────────────
  IF esc.transaction_type = 'rental' THEN
    -- Total fee pool = gross * 0.075
    -- Split: 65% platform, 25% agent, 10% referrer
    plat_amt  := ROUND(esc.gross_amount * 0.075 * 0.65, 2);
    agent_amt := ROUND(esc.gross_amount * 0.075 * 0.25, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.075 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.0375, 2); -- landlord net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.075,
      platform_amount   = plat_amt,
      agent_pct         = 0.25,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.0375, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.0375, 2)
    WHERE id = p_escrow_id;

  -- ── SALE: 3.0% total (1.5% each side) ──────────────────────
  ELSIF esc.transaction_type = 'sale' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.030 * 0.60, 2);
    agent_amt := ROUND(esc.gross_amount * 0.030 * 0.30, 2);
    ref_amt   := ROUND(esc.gross_amount * 0.030 * 0.10, 2);
    owner_amt := esc.gross_amount - ROUND(esc.gross_amount * 0.015, 2); -- seller net

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.030,
      platform_amount   = plat_amt,
      agent_pct         = 0.30,
      agent_payout      = agent_amt,
      referral_pct      = 0.10,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt,
      fee_from_tenant   = ROUND(esc.gross_amount * 0.015, 2),
      fee_from_landlord = ROUND(esc.gross_amount * 0.015, 2)
    WHERE id = p_escrow_id;

  -- ── HOTEL: 12% commission built into price ──────────────────
  ELSIF esc.transaction_type = 'hotel' THEN
    plat_amt  := ROUND(esc.gross_amount * 0.10, 2);  -- 10% platform
    ref_amt   := ROUND(esc.gross_amount * 0.02, 2);  -- 2% referrer
    owner_amt := esc.gross_amount - plat_amt - ref_amt; -- 88% hotel owner

    UPDATE public.escrow_transactions SET
      platform_pct      = 0.10,
      platform_amount   = plat_amt,
      agent_pct         = 0,
      agent_payout      = 0,
      referral_pct      = 0.02,
      referral_payout   = ref_amt,
      landlord_receives = owner_amt
    WHERE id = p_escrow_id;
  END IF;

  -- Re-fetch updated row
  SELECT * INTO esc FROM public.escrow_transactions WHERE id = p_escrow_id;

  -- Get referrer id from property's seller referral tracking
  SELECT p.referred_by INTO ref_id
  FROM public.properties pr
  JOIN public.profiles p ON p.id = pr.seller_id
  WHERE pr.id = esc.property_id
  LIMIT 1;

  -- Write immutable ledger entries
  -- Platform
  INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
  SELECT p_escrow_id, id, 'platform', esc.platform_amount,
    'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-PLT'
  FROM public.profiles
  WHERE email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
  LIMIT 1;

  -- Agent
  IF esc.agent_id IS NOT NULL AND esc.agent_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, esc.agent_id, 'agent', esc.agent_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-AGT');
  END IF;

  -- Referrer
  IF ref_id IS NOT NULL AND esc.referral_payout > 0 THEN
    INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
    VALUES (p_escrow_id, ref_id,
      CASE esc.transaction_type WHEN 'hotel' THEN 'referrer' ELSE 'referrer' END,
      esc.referral_payout,
      'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-REF');
  END IF;

  -- Owner / Landlord / Seller / Hotel
  DECLARE
    owner_uid uuid := COALESCE(esc.seller_id,
      (SELECT seller_id FROM public.properties WHERE id = esc.property_id LIMIT 1));
  BEGIN
    IF owner_uid IS NOT NULL THEN
      INSERT INTO public.wallet_ledger (escrow_id, recipient_id, recipient_role, amount, reference)
      VALUES (p_escrow_id, owner_uid,
        CASE esc.transaction_type
          WHEN 'rental' THEN 'landlord'
          WHEN 'sale'   THEN 'seller'
          ELSE 'hotel_owner'
        END,
        esc.landlord_receives,
        'LED-' || upper(substring(p_escrow_id::text,1,8)) || '-OWN');
    END IF;
  END;

  -- Mark split complete
  UPDATE public.escrow_transactions
  SET payout_processed_at = now()
  WHERE id = p_escrow_id;

END;
$$;


--
-- Name: fn_check_deed_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_deed_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  buyer_deed  public.deed_submissions%ROWTYPE;
  seller_deed public.deed_submissions%ROWTYPE;
BEGIN
  SELECT * INTO buyer_deed  FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'buyer'  LIMIT 1;
  SELECT * INTO seller_deed FROM public.deed_submissions
  WHERE escrow_id = NEW.escrow_id AND party_role = 'seller' LIMIT 1;

  -- Both submitted - attempt auto-verify (basic metadata match)
  IF buyer_deed.id IS NOT NULL AND seller_deed.id IS NOT NULL THEN
    -- In production: call OCR edge function here
    -- For now: mark deed_verified_at and release if both have legal stamp
    IF buyer_deed.has_legal_stamp AND seller_deed.has_legal_stamp THEN
      UPDATE public.escrow_transactions
      SET deed_verified_at = now(),
          deed_buyer_url   = buyer_deed.document_path,
          deed_seller_url  = seller_deed.document_path,
          status           = 'released',
          released_at      = now()
      WHERE id = NEW.escrow_id AND status = 'funded';

      INSERT INTO public.admin_audit_log (action, metadata)
      VALUES ('deed_auto_verified',
        jsonb_build_object('escrow_id', NEW.escrow_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_generate_checkin_token(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_checkin_token(p_escrow_id uuid, p_guest_id uuid, p_property_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  token text;
BEGIN
  -- Generate 6-digit numeric token
  token := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO public.checkin_tokens
    (escrow_id, property_id, guest_id, token, expires_at)
  VALUES
    (p_escrow_id, p_property_id, p_guest_id, token, now() + interval '24 hours');

  -- Store on escrow record too
  UPDATE public.escrow_transactions
  SET checkin_token = token
  WHERE id = p_escrow_id;

  RETURN token;
END;
$$;


--
-- Name: fn_init_agent_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_init_agent_score() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.role = 'agent' THEN
    INSERT INTO public.agent_scores (agent_id)
    VALUES (NEW.id)
    ON CONFLICT (agent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_populate_complaint_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_populate_complaint_agent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Set 48-hour response deadline
  NEW.response_deadline := NEW.created_at + interval '48 hours';

  -- Find the agent who verified this property
  IF NEW.agent_id IS NULL AND NEW.property_id IS NOT NULL THEN
    SELECT agent_id INTO NEW.agent_id
    FROM public.agent_verifications
    WHERE property_id = NEW.property_id
      AND verdict = 'verified'
    ORDER BY submitted_at DESC
    LIMIT 1;

    -- Also link verification record
    IF NEW.verification_id IS NULL AND NEW.agent_id IS NOT NULL THEN
      SELECT id INTO NEW.verification_id
      FROM public.agent_verifications
      WHERE property_id = NEW.property_id
        AND agent_id = NEW.agent_id
        AND verdict = 'verified'
      ORDER BY submitted_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Increment complaints_received on agent score
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.agent_scores (agent_id, complaints_received)
    VALUES (NEW.agent_id, 1)
    ON CONFLICT (agent_id) DO UPDATE
      SET complaints_received = agent_scores.complaints_received + 1,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_post_release_split(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_release_split() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'released' AND OLD.status <> 'released'
     AND NOT NEW.payout_locked THEN
    PERFORM public.fn_calculate_revenue_split(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_process_complaint_resolution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_process_complaint_resolution() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_strikes integer;
BEGIN
  -- Only act when status changes TO 'upheld'
  IF NEW.status = 'upheld' AND OLD.status <> 'upheld' AND NEW.agent_id IS NOT NULL THEN

    UPDATE public.agent_scores
    SET
      complaints_upheld = complaints_upheld + 1,
      strike_count      = strike_count + 1,
      rating            = GREATEST(1.00, rating - 0.50),
      updated_at        = now()
    WHERE agent_id = NEW.agent_id
    RETURNING strike_count INTO new_strikes;

    -- 3 strikes → auto-suspend
    IF new_strikes >= 3 THEN
      UPDATE public.agent_scores
      SET status = 'suspended', updated_at = now()
      WHERE agent_id = NEW.agent_id;

      UPDATE public.profiles
      SET role = 'suspended'
      WHERE id = NEW.agent_id;

      INSERT INTO public.admin_audit_log (action, metadata, performed_by)
      VALUES (
        'agent_auto_suspended',
        jsonb_build_object(
          'agent_id', NEW.agent_id,
          'strike_count', new_strikes,
          'triggered_by_complaint', NEW.id
        ),
        NEW.resolved_by
      );
    END IF;

    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'agent_strike_issued',
      jsonb_build_object(
        'agent_id', NEW.agent_id,
        'complaint_id', NEW.id,
        'strike_number', new_strikes,
        'complaint_category', NEW.category
      ),
      NEW.resolved_by
    );

  END IF;

  IF NEW.status = 'dismissed' AND OLD.status <> 'dismissed' AND NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (action, metadata, performed_by)
    VALUES (
      'complaint_dismissed',
      jsonb_build_object('complaint_id', NEW.id, 'agent_id', NEW.agent_id),
      NEW.resolved_by
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_release_on_move_in_confirm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_release_on_move_in_confirm() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL
     AND NEW.transaction_type = 'rental' AND NEW.status = 'funded'
     AND NEW.dispute_filed_at IS NULL THEN
    NEW.status      := 'released';
    NEW.released_at := now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_property_inputs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_property_inputs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.title       := public.fn_sanitize_text(COALESCE(NEW.title, ''));
  NEW.description := public.fn_sanitize_text(COALESCE(NEW.description, ''));
  NEW.address     := public.fn_sanitize_text(COALESCE(NEW.address, ''));
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_testimonial_inputs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_testimonial_inputs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.name       := public.fn_sanitize_text(COALESCE(NEW.name, ''));
  NEW.role_label := public.fn_sanitize_text(COALESCE(NEW.role_label, ''));
  NEW.content    := public.fn_sanitize_text(COALESCE(NEW.content, ''));
  -- Hard length caps regardless of what the client sends
  NEW.name       := left(NEW.name, 80);
  NEW.role_label := left(NEW.role_label, 80);
  NEW.content    := left(NEW.content, 600);
  RETURN NEW;
END;
$$;


--
-- Name: fn_sanitize_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sanitize_text(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
BEGIN
  -- Remove script tags, SQL comment sequences, null bytes
  input := regexp_replace(input, '<[^>]+>', '', 'g');
  input := regexp_replace(input, '--', '', 'g');
  input := regexp_replace(input, chr(0), '', 'g');
  input := regexp_replace(input, '(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC)\s', '', 'gi');
  RETURN trim(input);
END;
$$;


--
-- Name: fn_set_auto_release(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_auto_release() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.move_in_date IS NOT NULL AND NEW.status = 'funded'
     AND NEW.transaction_type = 'rental' THEN
    NEW.auto_release_at := (NEW.move_in_date::timestamptz + interval '72 hours');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_update_agent_score_on_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_agent_score_on_verification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.agent_scores (agent_id, total_verifications, verified_count, rejected_count, last_activity)
  VALUES (
    NEW.agent_id, 1,
    CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    total_verifications = agent_scores.total_verifications + 1,
    verified_count      = agent_scores.verified_count + CASE WHEN NEW.verdict = 'verified' THEN 1 ELSE 0 END,
    rejected_count      = agent_scores.rejected_count + CASE WHEN NEW.verdict = 'rejected' THEN 1 ELSE 0 END,
    last_activity       = now(),
    updated_at          = now();
  RETURN NEW;
END;
$$;


--
-- Name: fn_validate_checkin_token(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_checkin_token(p_token text, p_validator uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  tok public.checkin_tokens%ROWTYPE;
BEGIN
  SELECT * INTO tok FROM public.checkin_tokens
  WHERE token = p_token AND expires_at > now() AND validated_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Invalid or expired token');
  END IF;

  -- Mark validated
  UPDATE public.checkin_tokens
  SET validated_at = now(), validated_by = p_validator
  WHERE id = tok.id;

  UPDATE public.escrow_transactions
  SET token_validated_at = now()
  WHERE id = tok.escrow_id;

  -- Schedule release for next morning 06:00
  UPDATE public.escrow_transactions
  SET auto_release_at = date_trunc('day', now() + interval '1 day') + interval '6 hours'
  WHERE id = tok.escrow_id AND status = 'funded';

  RETURN jsonb_build_object(
    'success', true,
    'escrow_id', tok.escrow_id,
    'release_at', date_trunc('day', now() + interval '1 day') + interval '6 hours'
  );
END;
$$;


--
-- Name: generate_mortgage_ticket_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_mortgage_ticket_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.ticket_id := 'MTG-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  RETURN NEW;
END;
$$;


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        new.id,
            new.raw_user_meta_data->>'full_name',
                new.email,
                    COALESCE(new.raw_user_meta_data->>'role', 'buyer')
                      )
                        ON CONFLICT (id) DO NOTHING;
                          RETURN new;
                          END;
                          $$;


--
-- Name: handle_new_user_earnings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_earnings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.user_earnings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR email = 'divineandbassey@gmail.com')
  )
$$;


--
-- Name: is_admin_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','agent','verifier')
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email IN ('divineandbassey@gmail.com','prosperwithbassey@gmail.com')
  )
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','agent')
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'divineandbassey@gmail.com'
  )
$$;


--
-- Name: trigger_initialize_escrow(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_initialize_escrow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'executed' AND (OLD.status IS DISTINCT FROM 'executed') THEN
    INSERT INTO public.escrow_transactions (
      property_id, amount, platform_fee, status, payment_ref, created_at
    ) VALUES (
      NEW.property_id,
      NEW.amount,
      ROUND(NEW.amount * 0.025, 2),
      'awaiting_payment',
      'ESC-' || upper(substring(NEW.id::text, 1, 8)),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: admin_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text DEFAULT 'info'::text,
    target text DEFAULT 'all'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_announcements_type_check CHECK ((type = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'critical'::text])))
);


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    meta text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    badge_number text,
    assigned_states text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    agent_id uuid,
    assigned_by uuid,
    status text DEFAULT 'assigned'::text,
    visit_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_assignments_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: agent_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    property_id uuid,
    payment_type text,
    amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    CONSTRAINT agent_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['field_verification'::text, 'senior_override'::text]))),
    CONSTRAINT agent_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: agent_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_scores (
    agent_id uuid NOT NULL,
    total_verifications integer DEFAULT 0 NOT NULL,
    verified_count integer DEFAULT 0 NOT NULL,
    rejected_count integer DEFAULT 0 NOT NULL,
    complaints_received integer DEFAULT 0 NOT NULL,
    complaints_upheld integer DEFAULT 0 NOT NULL,
    strike_count integer DEFAULT 0 NOT NULL,
    rating numeric(3,2) DEFAULT 5.00,
    status text DEFAULT 'active'::text NOT NULL,
    last_activity timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_scores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'under_review'::text, 'suspended'::text, 'banned'::text])))
);


--
-- Name: agent_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    photos text[] DEFAULT '{}'::text[] NOT NULL,
    gps_lat numeric(10,7),
    gps_lng numeric(10,7),
    gps_accuracy_m integer,
    visited_at timestamp with time zone DEFAULT now() NOT NULL,
    checklist jsonb DEFAULT '{"water_running": false, "landlord_present": false, "address_confirmed": false, "electricity_working": false, "matches_description": false, "no_structural_damage": false}'::jsonb NOT NULL,
    verdict text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    liability_acknowledged boolean DEFAULT false NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT agent_verifications_verdict_check CHECK ((verdict = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: bank_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_name text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    account_type text DEFAULT 'business'::text,
    currency text DEFAULT 'NGN'::text,
    is_active boolean DEFAULT true,
    is_primary boolean DEFAULT false,
    notes text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_details_account_type_check CHECK ((account_type = ANY (ARRAY['business'::text, 'domiciliary'::text]))),
    CONSTRAINT bank_details_currency_check CHECK ((currency = ANY (ARRAY['NGN'::text, 'USD'::text])))
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    category_id uuid,
    guest_name text NOT NULL,
    guest_phone text NOT NULL,
    guest_email text,
    checkin_date date NOT NULL,
    checkout_date date NOT NULL,
    rooms_booked integer DEFAULT 1 NOT NULL,
    total_amount numeric,
    payment_ref text,
    source text DEFAULT 'dealmatch'::text,
    status text DEFAULT 'confirmed'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    checkin_at timestamp with time zone,
    checkout_at timestamp with time zone,
    admin_note text,
    guests integer DEFAULT 1,
    room_type text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: checkin_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    property_id uuid,
    guest_id uuid,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    validated_at timestamp with time zone,
    validated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    verification_id uuid,
    agent_id uuid,
    complainant_id uuid NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    agent_response text,
    agent_responded_at timestamp with time zone,
    response_deadline timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT complaints_category_check CHECK ((category = ANY (ARRAY['fake_listing'::text, 'misrepresentation'::text, 'wrong_address'::text, 'structural_damage'::text, 'fraud'::text, 'agent_misconduct'::text, 'other'::text]))),
    CONSTRAINT complaints_status_check CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'upheld'::text, 'dismissed'::text, 'escalated'::text])))
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    buyer_id uuid,
    seller_id uuid,
    amount numeric(15,2),
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'signed'::text, 'executed'::text, 'cancelled'::text])))
);


--
-- Name: crypto_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_name text,
    user_phone text,
    user_email text,
    reference text NOT NULL,
    description text NOT NULL,
    usdt_amount numeric NOT NULL,
    network text NOT NULL,
    wallet_addr text,
    tx_hash text,
    status text DEFAULT 'pending'::text,
    metadata jsonb,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT crypto_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text])))
);


--
-- Name: crypto_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crypto_wallets (
    id text NOT NULL,
    coin text NOT NULL,
    network text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    icon text DEFAULT '💰'::text,
    color text DEFAULT '#888888'::text,
    fee_label text DEFAULT ''::text,
    fee_fixed numeric DEFAULT 0,
    confirm_label text DEFAULT ''::text,
    recommended boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: deal_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    buyer_id uuid,
    buyer_name text NOT NULL,
    buyer_email text,
    buyer_phone text,
    buyer_signature text NOT NULL,
    agreement_text text NOT NULL,
    category text DEFAULT 'sale'::text,
    status text DEFAULT 'buyer_signed'::text,
    lister_signed_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT deal_agreements_status_check CHECK ((status = ANY (ARRAY['buyer_signed'::text, 'lister_signed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: deed_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deed_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    property_id uuid,
    submitted_by uuid NOT NULL,
    party_role text NOT NULL,
    document_path text NOT NULL,
    extracted_name text,
    extracted_plot text,
    has_legal_stamp boolean DEFAULT false,
    verified boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deed_submissions_party_role_check CHECK ((party_role = ANY (ARRAY['buyer'::text, 'seller'::text])))
);


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    reporter_id uuid,
    against_id uuid,
    booking_id uuid,
    reason text NOT NULL,
    description text,
    evidence_urls text[] DEFAULT '{}'::text[],
    status text DEFAULT 'open'::text,
    resolution text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: escrow_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escrow_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    tenant_id uuid,
    status text DEFAULT 'pending'::text,
    transaction_type text DEFAULT 'rental'::text,
    buyer_id uuid,
    seller_id uuid,
    agent_id uuid,
    referrer_id uuid,
    gross_amount numeric,
    platform_pct numeric,
    platform_amount numeric,
    agent_pct numeric,
    agent_payout numeric,
    referral_pct numeric,
    referral_payout numeric,
    landlord_receives numeric,
    fee_from_tenant numeric,
    fee_from_landlord numeric,
    move_in_date date,
    confirmed_at timestamp with time zone,
    auto_release_at timestamp with time zone,
    dispute_filed_at timestamp with time zone,
    checkin_token text,
    token_validated_at timestamp with time zone,
    deed_buyer_url text,
    deed_seller_url text,
    deed_verified_at timestamp with time zone,
    idempotency_key text,
    payout_processed_at timestamp with time zone,
    payout_locked boolean DEFAULT false,
    CONSTRAINT escrow_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['rental'::text, 'sale'::text, 'hotel'::text])))
);


--
-- Name: hostel_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hostel_id uuid,
    student_id uuid,
    student_name text,
    student_phone text,
    student_email text,
    matric_number text,
    message text,
    move_in_date date,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hostel_enquiries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'converted'::text, 'closed'::text])))
);


--
-- Name: hostel_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hostel_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hostel_id uuid,
    owner_id uuid,
    reference text NOT NULL,
    amount numeric NOT NULL,
    plan text NOT NULL,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hostel_payments_plan_check CHECK ((plan = ANY (ARRAY['semester'::text, 'annual'::text]))),
    CONSTRAINT hostel_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text])))
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    short_name text,
    state text NOT NULL,
    city text NOT NULL,
    type text DEFAULT 'university'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT institutions_type_check CHECK ((type = ANY (ARRAY['university'::text, 'polytechnic'::text, 'college'::text])))
);


--
-- Name: loyalty_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    points_balance integer DEFAULT 0,
    points_lifetime integer DEFAULT 0,
    points_redeemed integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    property_id uuid,
    match_score integer,
    match_reasons text[] DEFAULT '{}'::text[],
    is_shortlisted boolean DEFAULT false,
    contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_id uuid,
    sender_name text,
    recipient_id uuid,
    property_id uuid,
    content text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mortgage_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mortgage_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    monthly_income numeric,
    employment_type text DEFAULT 'employed'::text,
    property_value numeric,
    down_payment numeric,
    loan_term_years integer DEFAULT 15,
    property_type text,
    property_state text,
    lender_id text,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    ticket_id text,
    CONSTRAINT mortgage_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'reviewing'::text, 'approved'::text, 'declined'::text, 'finished'::text, 'on_hold'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    amount numeric,
    link text,
    read boolean DEFAULT false,
    email_sent boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    reference text NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'NGN'::text,
    professional_type text,
    plan_type text,
    email text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid
);


--
-- Name: pinecone_index_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pinecone_index_status (
    property_id uuid NOT NULL,
    is_indexed boolean DEFAULT false,
    last_indexed timestamp with time zone DEFAULT now(),
    error_log text
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text,
    label text,
    category text DEFAULT 'general'::text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: pro_activation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pro_activation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    city text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    notes text
);


--
-- Name: professional_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_applications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    professional_type text,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    company_name text,
    license_number text,
    coverage_areas text,
    plan_type text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    subscription_plan text DEFAULT 'basic'::text,
    subscription_start timestamp with time zone,
    subscription_expiry timestamp with time zone,
    referred_amount numeric DEFAULT 0,
    activated_at timestamp with time zone,
    rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    is_verified boolean DEFAULT false,
    avatar_url text,
    CONSTRAINT professional_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: professional_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    professional_id text NOT NULL,
    professional_type text NOT NULL,
    professional_name text NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    client_email text,
    details text,
    urgency text DEFAULT 'normal'::text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professional_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'connected'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT professional_requests_urgency_check CHECK ((urgency = ANY (ARRAY['normal'::text, 'soon'::text, 'urgent'::text])))
);


--
-- Name: professional_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id text NOT NULL,
    reviewer_id uuid,
    reviewer_name text NOT NULL,
    rating numeric(2,1) NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professional_reviews_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: professionals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professionals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    professional_type text,
    full_name text NOT NULL,
    company_name text,
    email text NOT NULL,
    phone text,
    license_number text,
    coverage_areas text,
    bio text,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT false,
    subscription_plan text,
    subscription_started_at timestamp with time zone,
    subscription_expires_at timestamp with time zone,
    referral_count integer DEFAULT 0,
    rating numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT professionals_professional_type_check CHECK ((professional_type = ANY (ARRAY['surveyor'::text, 'inspector'::text, 'lender'::text]))),
    CONSTRAINT professionals_subscription_plan_check CHECK ((subscription_plan = ANY (ARRAY['monthly'::text, 'annual'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    location text,
    bio text,
    role text DEFAULT 'buyer'::text,
    buyer_preferences jsonb DEFAULT '{}'::jsonb,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    state text,
    city text,
    is_photo_verified boolean DEFAULT false,
    is_live_verified boolean DEFAULT false,
    live_verified_at timestamp with time zone,
    budget_max numeric,
    budget_min numeric,
    property_goal text,
    preferred_states text[] DEFAULT '{}'::text[],
    property_types text[] DEFAULT '{}'::text[],
    needs_financing boolean DEFAULT false,
    id_doc_url text,
    id_doc_type text,
    id_verified boolean DEFAULT false,
    id_verified_at timestamp with time zone,
    face_video_url text,
    bank_name text,
    account_number text,
    account_name text,
    routing_number text,
    identity_photo_url text,
    identity_selfie_url text,
    identity_doc_type text,
    identity_verification_status text DEFAULT 'unverified'::text,
    identity_verified_at timestamp with time zone,
    identity_rejection_note text,
    identity_verified_by uuid,
    username text,
    is_deactivated boolean DEFAULT false,
    verification_skipped boolean DEFAULT false,
    invite_code text,
    invited_by uuid,
    referral_earnings numeric DEFAULT 0,
    referral_paid_out numeric DEFAULT 0,
    is_student_verified boolean DEFAULT false,
    student_institution text,
    referral_level integer DEFAULT 0,
    device_fingerprint text,
    account_flagged boolean DEFAULT false,
    flagged_reason text,
    account_status text DEFAULT 'active'::text,
    CONSTRAINT profiles_identity_verification_status_check CHECK ((identity_verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['buyer'::text, 'seller'::text, 'renter'::text, 'landlord'::text, 'agent'::text, 'investor'::text, 'student'::text, 'verifier'::text, 'admin'::text, 'superadmin'::text, 'suspended'::text, 'deleted'::text])))
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    seller_id uuid,
    title text NOT NULL,
    description text,
    property_type text,
    listing_type text DEFAULT 'For Sale'::text,
    price bigint NOT NULL,
    state text NOT NULL,
    city text NOT NULL,
    address text,
    bedrooms integer,
    bathrooms integer,
    size_sqm numeric,
    features text[] DEFAULT '{}'::text[],
    documents text[] DEFAULT '{}'::text[],
    status text DEFAULT 'active'::text,
    view_count integer DEFAULT 0,
    like_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category text DEFAULT 'sale'::text,
    price_period text DEFAULT 'month'::text,
    contact_phone text,
    contact_email text,
    max_guests integer,
    video_url text,
    landlord_name text,
    rules text,
    rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    custom_terms text,
    verified_by uuid,
    verified_at timestamp with time zone,
    verification_note text,
    latitude numeric,
    longitude numeric,
    payment_ref text,
    assigned_agent_id uuid,
    occupancy_status text DEFAULT 'vacant'::text,
    assigned_at timestamp with time zone,
    verification_date timestamp with time zone,
    verification_notes text,
    CONSTRAINT properties_occupancy_status_check CHECK ((occupancy_status = ANY (ARRAY['vacant'::text, 'occupied'::text]))),
    CONSTRAINT properties_property_type_check CHECK ((property_type = ANY (ARRAY['land'::text, 'apartment'::text, 'duplex'::text, 'detached'::text, 'terrace'::text, 'commercial'::text]))),
    CONSTRAINT properties_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'sold'::text, 'removed'::text])))
);


--
-- Name: property_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_images (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    property_id uuid,
    url text NOT NULL,
    is_primary boolean DEFAULT false,
    caption text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: property_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    landlord_id uuid NOT NULL,
    assigned_agent uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    proposed_date timestamp with time zone,
    confirmed_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT property_inspections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: property_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_interest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    property_id uuid,
    intent text DEFAULT 'interested'::text,
    budget_range text,
    timeline text,
    message text,
    phone text,
    status text DEFAULT 'new'::text,
    lead_score integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    referred_by uuid,
    CONSTRAINT property_interest_intent_check CHECK ((intent = ANY (ARRAY['interested'::text, 'schedule_viewing'::text, 'make_offer'::text, 'request_info'::text, 'urgent_buyer'::text]))),
    CONSTRAINT property_interest_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text, 'junk'::text]))),
    CONSTRAINT property_interest_timeline_check CHECK ((timeline = ANY (ARRAY['immediate'::text, '1_month'::text, '3_months'::text, '6_months'::text, 'just_browsing'::text])))
);


--
-- Name: property_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    reviewer_id uuid,
    reviewer_name text NOT NULL,
    landlord_id uuid,
    rating numeric(2,1) NOT NULL,
    review_text text,
    category text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT property_reviews_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: referral_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id uuid NOT NULL,
    referee_id uuid NOT NULL,
    payment_id text,
    transaction_type text NOT NULL,
    deal_amount numeric NOT NULL,
    referral_rate numeric DEFAULT 0.10 NOT NULL,
    platform_fee numeric NOT NULL,
    referral_earning numeric NOT NULL,
    status text DEFAULT 'pending'::text,
    confirmed_at timestamp with time zone,
    paid_out_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    buyer_id uuid,
    transaction_id uuid,
    dm_commission numeric DEFAULT 0,
    referral_level integer,
    payout_type text,
    points_awarded integer DEFAULT 0,
    points_redeemed integer DEFAULT 0,
    payout_ref text,
    paid_at timestamp with time zone,
    CONSTRAINT referral_transactions_payout_type_check CHECK ((payout_type = ANY (ARRAY['cash'::text, 'points'::text, 'points_redemption'::text]))),
    CONSTRAINT referral_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'paid_out'::text, 'cancelled'::text]))),
    CONSTRAINT referral_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['property_sale'::text, 'rental'::text, 'hotel'::text, 'escrow'::text, 'subscription'::text])))
);


--
-- Name: rental_enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    tenant_name text NOT NULL,
    tenant_phone text NOT NULL,
    tenant_email text,
    move_in_date date,
    duration integer DEFAULT 12,
    message text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: room_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid,
    name text NOT NULL,
    total_rooms integer DEFAULT 1 NOT NULL,
    available_rooms integer DEFAULT 1 NOT NULL,
    price_per_night numeric,
    description text,
    amenities text[],
    is_active boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_hostels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_hostels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    title text NOT NULL,
    description text,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    latitude numeric,
    longitude numeric,
    institution_id uuid,
    institution_name text,
    distance_km numeric,
    distance_label text,
    room_type text NOT NULL,
    gender_policy text DEFAULT 'mixed'::text,
    rooms_available integer DEFAULT 1,
    total_rooms integer DEFAULT 1,
    price_per_year numeric NOT NULL,
    caution_fee numeric DEFAULT 0,
    agency_fee numeric DEFAULT 0,
    amenities text[] DEFAULT '{}'::text[],
    images text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending_review'::text,
    listing_paid boolean DEFAULT false,
    listing_paid_at timestamp with time zone,
    payment_ref text,
    verified boolean DEFAULT false,
    verified_by uuid,
    verified_at timestamp with time zone,
    views integer DEFAULT 0,
    enquiry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_hostels_gender_policy_check CHECK ((gender_policy = ANY (ARRAY['male_only'::text, 'female_only'::text, 'mixed'::text]))),
    CONSTRAINT student_hostels_room_type_check CHECK ((room_type = ANY (ARRAY['single'::text, 'shared_2'::text, 'shared_4'::text, 'shared_6'::text, 'self_contain'::text, 'mini_flat'::text, '2_bedroom'::text]))),
    CONSTRAINT student_hostels_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'active'::text, 'paused'::text, 'rejected'::text, 'filled'::text])))
);


--
-- Name: student_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    institution_id uuid,
    institution_name text,
    matric_number text,
    jamb_reg_number text,
    application_number text,
    school_email text,
    id_image_url text,
    status text DEFAULT 'pending'::text,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: swipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swipes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    property_id uuid,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT swipes_action_check CHECK ((action = ANY (ARRAY['like'::text, 'pass'::text, 'super'::text])))
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    role_label text,
    content text NOT NULL,
    rating smallint DEFAULT 5 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    CONSTRAINT testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT testimonials_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: user_earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_earnings (
    user_id uuid NOT NULL,
    total_earned numeric DEFAULT 0,
    is_ambassador boolean DEFAULT false,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_agent_scorecard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_agent_scorecard AS
 SELECT p.id,
    p.full_name,
    p.email,
    p.phone,
    s.total_verifications,
    s.verified_count,
    s.rejected_count,
    s.complaints_received,
    s.complaints_upheld,
    s.strike_count,
    s.rating,
    s.status,
    s.last_activity,
    round(
        CASE
            WHEN (s.total_verifications = 0) THEN (100)::numeric
            ELSE (((s.verified_count)::numeric / (s.total_verifications)::numeric) * (100)::numeric)
        END, 1) AS success_rate_pct,
    round(
        CASE
            WHEN (s.complaints_received = 0) THEN (0)::numeric
            ELSE (((s.complaints_upheld)::numeric / (s.complaints_received)::numeric) * (100)::numeric)
        END, 1) AS complaint_uphold_rate_pct,
    GREATEST(0, (3 - s.strike_count)) AS strikes_remaining
   FROM (public.profiles p
     JOIN public.agent_scores s ON ((s.agent_id = p.id)))
  WHERE (p.role = ANY (ARRAY['agent'::text, 'suspended'::text]))
  ORDER BY s.rating DESC, s.total_verifications DESC;


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    escrow_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_role text NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency text DEFAULT 'NGN'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT wallet_ledger_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_ledger_recipient_role_check CHECK ((recipient_role = ANY (ARRAY['platform'::text, 'agent'::text, 'referrer'::text, 'landlord'::text, 'seller'::text, 'hotel_owner'::text, 'refund'::text]))),
    CONSTRAINT wallet_ledger_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_07_09; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_09 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_10; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_10 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_11; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_11 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_12; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_12 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_13; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_13 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_14; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_14 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: messages_2026_07_15; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_07_15 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_2026_07_09; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_09 FOR VALUES FROM ('2026-07-09 00:00:00') TO ('2026-07-10 00:00:00');


--
-- Name: messages_2026_07_10; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_10 FOR VALUES FROM ('2026-07-10 00:00:00') TO ('2026-07-11 00:00:00');


--
-- Name: messages_2026_07_11; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_11 FOR VALUES FROM ('2026-07-11 00:00:00') TO ('2026-07-12 00:00:00');


--
-- Name: messages_2026_07_12; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_12 FOR VALUES FROM ('2026-07-12 00:00:00') TO ('2026-07-13 00:00:00');


--
-- Name: messages_2026_07_13; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_13 FOR VALUES FROM ('2026-07-13 00:00:00') TO ('2026-07-14 00:00:00');


--
-- Name: messages_2026_07_14; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_14 FOR VALUES FROM ('2026-07-14 00:00:00') TO ('2026-07-15 00:00:00');


--
-- Name: messages_2026_07_15; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_15 FOR VALUES FROM ('2026-07-15 00:00:00') TO ('2026-07-16 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: admin_announcements admin_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_announcements
    ADD CONSTRAINT admin_announcements_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: agent_accounts agent_accounts_badge_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_badge_number_key UNIQUE (badge_number);


--
-- Name: agent_accounts agent_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_email_key UNIQUE (email);


--
-- Name: agent_accounts agent_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_pkey PRIMARY KEY (id);


--
-- Name: agent_accounts agent_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_user_id_key UNIQUE (user_id);


--
-- Name: agent_assignments agent_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_pkey PRIMARY KEY (id);


--
-- Name: agent_payments agent_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_pkey PRIMARY KEY (id);


--
-- Name: agent_scores agent_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scores
    ADD CONSTRAINT agent_scores_pkey PRIMARY KEY (agent_id);


--
-- Name: agent_verifications agent_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_pkey PRIMARY KEY (id);


--
-- Name: agent_verifications agent_verifications_property_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_property_id_agent_id_key UNIQUE (property_id, agent_id);


--
-- Name: bank_details bank_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: checkin_tokens checkin_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_pkey PRIMARY KEY (id);


--
-- Name: checkin_tokens checkin_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_token_key UNIQUE (token);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: crypto_payments crypto_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_pkey PRIMARY KEY (id);


--
-- Name: crypto_payments crypto_payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_reference_key UNIQUE (reference);


--
-- Name: crypto_wallets crypto_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_wallets
    ADD CONSTRAINT crypto_wallets_pkey PRIMARY KEY (id);


--
-- Name: deal_agreements deal_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_pkey PRIMARY KEY (id);


--
-- Name: deed_submissions deed_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: escrow_transactions escrow_transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: escrow_transactions escrow_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_pkey PRIMARY KEY (id);


--
-- Name: hostel_enquiries hostel_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_pkey PRIMARY KEY (id);


--
-- Name: hostel_payments hostel_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_pkey PRIMARY KEY (id);


--
-- Name: hostel_payments hostel_payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_reference_key UNIQUE (reference);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_user_id_key UNIQUE (user_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: matches matches_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mortgage_applications mortgage_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_pkey PRIMARY KEY (id);


--
-- Name: mortgage_applications mortgage_applications_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_ticket_id_key UNIQUE (ticket_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_reference_key UNIQUE (reference);


--
-- Name: pinecone_index_status pinecone_index_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinecone_index_status
    ADD CONSTRAINT pinecone_index_status_pkey PRIMARY KEY (property_id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: pro_activation_requests pro_activation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_pkey PRIMARY KEY (id);


--
-- Name: professional_applications professional_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_pkey PRIMARY KEY (id);


--
-- Name: professional_requests professional_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_requests
    ADD CONSTRAINT professional_requests_pkey PRIMARY KEY (id);


--
-- Name: professional_reviews professional_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_reviews
    ADD CONSTRAINT professional_reviews_pkey PRIMARY KEY (id);


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_invite_code_key UNIQUE (invite_code);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_images property_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_pkey PRIMARY KEY (id);


--
-- Name: property_inspections property_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_pkey PRIMARY KEY (id);


--
-- Name: property_interest property_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_pkey PRIMARY KEY (id);


--
-- Name: property_interest property_interest_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: property_reviews property_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_pkey PRIMARY KEY (id);


--
-- Name: referral_transactions referral_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_pkey PRIMARY KEY (id);


--
-- Name: rental_enquiries rental_enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_enquiries
    ADD CONSTRAINT rental_enquiries_pkey PRIMARY KEY (id);


--
-- Name: room_categories room_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_categories
    ADD CONSTRAINT room_categories_pkey PRIMARY KEY (id);


--
-- Name: student_hostels student_hostels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_pkey PRIMARY KEY (id);


--
-- Name: student_verifications student_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_pkey PRIMARY KEY (id);


--
-- Name: student_verifications student_verifications_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_user_id_key UNIQUE (user_id);


--
-- Name: swipes swipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_pkey PRIMARY KEY (id);


--
-- Name: swipes swipes_user_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_user_id_property_id_key UNIQUE (user_id, property_id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: profiles unique_phone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT unique_phone UNIQUE (phone);


--
-- Name: user_earnings user_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_earnings
    ADD CONSTRAINT user_earnings_pkey PRIMARY KEY (user_id);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger wallet_ledger_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_reference_key UNIQUE (reference);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_09 messages_2026_07_09_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_09
    ADD CONSTRAINT messages_2026_07_09_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_10 messages_2026_07_10_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_10
    ADD CONSTRAINT messages_2026_07_10_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_11 messages_2026_07_11_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_11
    ADD CONSTRAINT messages_2026_07_11_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_12 messages_2026_07_12_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_12
    ADD CONSTRAINT messages_2026_07_12_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_13 messages_2026_07_13_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_13
    ADD CONSTRAINT messages_2026_07_13_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_14 messages_2026_07_14_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_14
    ADD CONSTRAINT messages_2026_07_14_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_15 messages_2026_07_15_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_07_15
    ADD CONSTRAINT messages_2026_07_15_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: idx_agent_payments_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_payments_agent ON public.agent_payments USING btree (agent_id, status);


--
-- Name: idx_agent_verifications_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_verifications_agent ON public.agent_verifications USING btree (agent_id);


--
-- Name: idx_agent_verifications_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_verifications_property ON public.agent_verifications USING btree (property_id);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.admin_audit_log USING btree (action, created_at DESC);


--
-- Name: idx_audit_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_bookings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_category ON public.bookings USING btree (category_id, checkin_date);


--
-- Name: idx_bookings_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_property ON public.bookings USING btree (property_id, checkin_date, checkout_date);


--
-- Name: idx_bookings_status_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status_checkin ON public.bookings USING btree (status, checkin_date);


--
-- Name: idx_complaints_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_agent ON public.complaints USING btree (agent_id);


--
-- Name: idx_complaints_complainant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_complainant ON public.complaints USING btree (complainant_id);


--
-- Name: idx_complaints_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_property ON public.complaints USING btree (property_id);


--
-- Name: idx_complaints_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_status ON public.complaints USING btree (status);


--
-- Name: idx_escrow_auto_rel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_auto_rel ON public.escrow_transactions USING btree (auto_release_at) WHERE (status = 'funded'::text);


--
-- Name: idx_escrow_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_idem ON public.escrow_transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_escrow_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escrow_type ON public.escrow_transactions USING btree (transaction_type);


--
-- Name: idx_hostel_enquiries_hostel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hostel_enquiries_hostel ON public.hostel_enquiries USING btree (hostel_id);


--
-- Name: idx_inspections_buyer_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inspections_buyer_property ON public.property_inspections USING btree (buyer_id, property_id, status);


--
-- Name: idx_loyalty_points_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_user ON public.loyalty_points USING btree (user_id);


--
-- Name: idx_matches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_user ON public.matches USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read, created_at DESC);


--
-- Name: idx_pro_activation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_activation_status ON public.pro_activation_requests USING btree (status);


--
-- Name: idx_pro_activation_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_activation_user_id ON public.pro_activation_requests USING btree (user_id);


--
-- Name: idx_pro_reviews_pro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pro_reviews_pro ON public.professional_reviews USING btree (professional_id);


--
-- Name: idx_profiles_account_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_account_status ON public.profiles USING btree (account_status);


--
-- Name: idx_profiles_device_fp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_device_fp ON public.profiles USING btree (device_fingerprint);


--
-- Name: idx_profiles_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_email_unique ON public.profiles USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_profiles_identity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_identity_status ON public.profiles USING btree (identity_verification_status) WHERE (identity_verification_status = 'submitted'::text);


--
-- Name: idx_profiles_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_invite_code ON public.profiles USING btree (invite_code);


--
-- Name: idx_profiles_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_invited_by ON public.profiles USING btree (invited_by);


--
-- Name: idx_profiles_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_phone_unique ON public.profiles USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_properties_assigned_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_assigned_agent ON public.properties USING btree (assigned_agent_id);


--
-- Name: idx_properties_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_category ON public.properties USING btree (category, status);


--
-- Name: idx_properties_occupancy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_occupancy ON public.properties USING btree (category, occupancy_status) WHERE (category = ANY (ARRAY['rental'::text, 'shortlet'::text]));


--
-- Name: idx_properties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_properties_status ON public.properties USING btree (status);


--
-- Name: idx_property_interest_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_interest_property ON public.property_interest USING btree (property_id, status);


--
-- Name: idx_property_interest_referred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_interest_referred ON public.property_interest USING btree (referred_by);


--
-- Name: idx_referral_txn_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_payment ON public.referral_transactions USING btree (payment_id);


--
-- Name: idx_referral_txn_referee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_referee ON public.referral_transactions USING btree (referee_id);


--
-- Name: idx_referral_txn_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txn_referrer ON public.referral_transactions USING btree (referrer_id, status);


--
-- Name: idx_referral_txns_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_buyer ON public.referral_transactions USING btree (buyer_id);


--
-- Name: idx_referral_txns_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_referrer ON public.referral_transactions USING btree (referrer_id, status);


--
-- Name: idx_referral_txns_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_txns_type ON public.referral_transactions USING btree (payout_type, status);


--
-- Name: idx_room_categories_property; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_categories_property ON public.room_categories USING btree (property_id);


--
-- Name: idx_student_hostels_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_institution ON public.student_hostels USING btree (institution_id);


--
-- Name: idx_student_hostels_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_state ON public.student_hostels USING btree (state);


--
-- Name: idx_student_hostels_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_hostels_status ON public.student_hostels USING btree (status);


--
-- Name: idx_student_verifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_verifications_user ON public.student_verifications USING btree (user_id);


--
-- Name: idx_swipes_user_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_swipes_user_action ON public.swipes USING btree (user_id, action);


--
-- Name: idx_testimonials_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_status ON public.testimonials USING btree (status);


--
-- Name: idx_testimonials_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_user ON public.testimonials USING btree (user_id);


--
-- Name: idx_user_earnings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_earnings_user_id ON public.user_earnings USING btree (user_id);


--
-- Name: matches_user_id_match_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_user_id_match_score_idx ON public.matches USING btree (user_id, match_score DESC);


--
-- Name: professionals_professional_type_is_active_is_verified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professionals_professional_type_is_active_is_verified_idx ON public.professionals USING btree (professional_type, is_active, is_verified);


--
-- Name: properties_price_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_price_status_idx ON public.properties USING btree (price, status);


--
-- Name: properties_property_type_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_property_type_status_idx ON public.properties USING btree (property_type, status);


--
-- Name: properties_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_seller_id_idx ON public.properties USING btree (seller_id);


--
-- Name: properties_state_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_state_status_idx ON public.properties USING btree (state, status);


--
-- Name: swipes_user_id_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swipes_user_id_action_idx ON public.swipes USING btree (user_id, action);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_09_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_09_inserted_at_topic_idx ON realtime.messages_2026_07_09 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_10_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_10_inserted_at_topic_idx ON realtime.messages_2026_07_10 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_11_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_11_inserted_at_topic_idx ON realtime.messages_2026_07_11 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_12_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_12_inserted_at_topic_idx ON realtime.messages_2026_07_12 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_13_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_13_inserted_at_topic_idx ON realtime.messages_2026_07_13 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_14_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_14_inserted_at_topic_idx ON realtime.messages_2026_07_14 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_15_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_07_15_inserted_at_topic_idx ON realtime.messages_2026_07_15 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_07_09_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_09_inserted_at_topic_idx;


--
-- Name: messages_2026_07_09_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_09_pkey;


--
-- Name: messages_2026_07_10_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_10_inserted_at_topic_idx;


--
-- Name: messages_2026_07_10_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_10_pkey;


--
-- Name: messages_2026_07_11_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_11_inserted_at_topic_idx;


--
-- Name: messages_2026_07_11_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_11_pkey;


--
-- Name: messages_2026_07_12_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_12_inserted_at_topic_idx;


--
-- Name: messages_2026_07_12_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_12_pkey;


--
-- Name: messages_2026_07_13_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_13_inserted_at_topic_idx;


--
-- Name: messages_2026_07_13_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_13_pkey;


--
-- Name: messages_2026_07_14_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_14_inserted_at_topic_idx;


--
-- Name: messages_2026_07_14_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_14_pkey;


--
-- Name: messages_2026_07_15_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_15_inserted_at_topic_idx;


--
-- Name: messages_2026_07_15_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_15_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: users on_new_user_create_earnings; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_new_user_create_earnings AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_earnings();


--
-- Name: agent_verifications trg_agent_score_on_verification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agent_score_on_verification AFTER INSERT OR UPDATE OF verdict ON public.agent_verifications FOR EACH ROW WHEN ((new.verdict = ANY (ARRAY['verified'::text, 'rejected'::text]))) EXECUTE FUNCTION public.fn_update_agent_score_on_verification();


--
-- Name: profiles trg_audit_identity_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_identity_status AFTER UPDATE OF identity_verification_status ON public.profiles FOR EACH ROW WHEN ((old.identity_verification_status IS DISTINCT FROM new.identity_verification_status)) EXECUTE FUNCTION public.fn_audit_admin_action('identity_status_change');


--
-- Name: properties trg_audit_property_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_property_status AFTER UPDATE OF status ON public.properties FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.fn_audit_admin_action('property_status_change');


--
-- Name: deed_submissions trg_check_deed_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_deed_completion AFTER INSERT OR UPDATE OF has_legal_stamp ON public.deed_submissions FOR EACH ROW EXECUTE FUNCTION public.fn_check_deed_completion();


--
-- Name: mortgage_applications trg_generate_mortgage_ticket_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_mortgage_ticket_id BEFORE INSERT ON public.mortgage_applications FOR EACH ROW WHEN ((new.ticket_id IS NULL)) EXECUTE FUNCTION public.generate_mortgage_ticket_id();


--
-- Name: profiles trg_init_agent_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_init_agent_score AFTER INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_init_agent_score();


--
-- Name: contracts trg_initialize_escrow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_initialize_escrow AFTER UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.trigger_initialize_escrow();


--
-- Name: complaints trg_populate_complaint_agent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_populate_complaint_agent BEFORE INSERT ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.fn_populate_complaint_agent();


--
-- Name: escrow_transactions trg_post_release_split; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_release_split AFTER UPDATE OF status ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_post_release_split();


--
-- Name: complaints trg_process_complaint_resolution; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_process_complaint_resolution AFTER UPDATE OF status ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.fn_process_complaint_resolution();


--
-- Name: escrow_transactions trg_release_on_confirm; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_release_on_confirm BEFORE UPDATE OF confirmed_at ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_release_on_move_in_confirm();


--
-- Name: properties trg_sanitize_property; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sanitize_property BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_property_inputs();


--
-- Name: testimonials trg_sanitize_testimonial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sanitize_testimonial BEFORE INSERT OR UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.fn_sanitize_testimonial_inputs();


--
-- Name: escrow_transactions trg_set_auto_release; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_auto_release BEFORE INSERT OR UPDATE OF move_in_date ON public.escrow_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_set_auto_release();


--
-- Name: user_earnings user_earnings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_earnings_updated_at BEFORE UPDATE ON public.user_earnings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_announcements admin_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_announcements
    ADD CONSTRAINT admin_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_accounts agent_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_accounts agent_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_accounts
    ADD CONSTRAINT agent_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_assignments agent_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_assignments agent_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_assignments agent_assignments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: agent_payments agent_payments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: agent_payments agent_payments_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_payments
    ADD CONSTRAINT agent_payments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: agent_scores agent_scores_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_scores
    ADD CONSTRAINT agent_scores_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: agent_verifications agent_verifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_verifications
    ADD CONSTRAINT agent_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: bank_details bank_details_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_details
    ADD CONSTRAINT bank_details_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.room_categories(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: checkin_tokens checkin_tokens_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id) ON DELETE CASCADE;


--
-- Name: checkin_tokens checkin_tokens_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.profiles(id);


--
-- Name: checkin_tokens checkin_tokens_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: checkin_tokens checkin_tokens_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tokens
    ADD CONSTRAINT checkin_tokens_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.profiles(id);


--
-- Name: complaints complaints_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_complainant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_complainant_id_fkey FOREIGN KEY (complainant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: complaints complaints_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);


--
-- Name: complaints complaints_verification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_verification_id_fkey FOREIGN KEY (verification_id) REFERENCES public.agent_verifications(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);


--
-- Name: contracts contracts_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);


--
-- Name: crypto_payments crypto_payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_payments
    ADD CONSTRAINT crypto_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: crypto_wallets crypto_wallets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crypto_wallets
    ADD CONSTRAINT crypto_wallets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_agreements deal_agreements_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: deal_agreements deal_agreements_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_agreements
    ADD CONSTRAINT deal_agreements_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: deed_submissions deed_submissions_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id) ON DELETE CASCADE;


--
-- Name: deed_submissions deed_submissions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);


--
-- Name: deed_submissions deed_submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deed_submissions
    ADD CONSTRAINT deed_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: disputes disputes_against_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_against_id_fkey FOREIGN KEY (against_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: disputes disputes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: disputes disputes_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: escrow_transactions escrow_transactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escrow_transactions
    ADD CONSTRAINT escrow_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: hostel_enquiries hostel_enquiries_hostel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_hostel_id_fkey FOREIGN KEY (hostel_id) REFERENCES public.student_hostels(id) ON DELETE CASCADE;


--
-- Name: hostel_enquiries hostel_enquiries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_enquiries
    ADD CONSTRAINT hostel_enquiries_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: hostel_payments hostel_payments_hostel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_hostel_id_fkey FOREIGN KEY (hostel_id) REFERENCES public.student_hostels(id) ON DELETE SET NULL;


--
-- Name: hostel_payments hostel_payments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hostel_payments
    ADD CONSTRAINT hostel_payments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: loyalty_points loyalty_points_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: matches matches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: messages messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: mortgage_applications mortgage_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mortgage_applications
    ADD CONSTRAINT mortgage_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pinecone_index_status pinecone_index_status_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pinecone_index_status
    ADD CONSTRAINT pinecone_index_status_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pro_activation_requests pro_activation_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: pro_activation_requests pro_activation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pro_activation_requests
    ADD CONSTRAINT pro_activation_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: professional_applications professional_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_applications
    ADD CONSTRAINT professional_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: professional_requests professional_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_requests
    ADD CONSTRAINT professional_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: professional_reviews professional_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_reviews
    ADD CONSTRAINT professional_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: professionals professionals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professionals
    ADD CONSTRAINT professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_identity_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_identity_verified_by_fkey FOREIGN KEY (identity_verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: properties properties_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_images property_images_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_images
    ADD CONSTRAINT property_images_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_assigned_agent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_assigned_agent_fkey FOREIGN KEY (assigned_agent) REFERENCES public.profiles(id);


--
-- Name: property_inspections property_inspections_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: property_inspections property_inspections_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_interest property_interest_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_interest property_interest_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: property_interest property_interest_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interest
    ADD CONSTRAINT property_interest_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: property_reviews property_reviews_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: property_reviews property_reviews_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_reviews property_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_reviews
    ADD CONSTRAINT property_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: referral_transactions referral_transactions_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: referral_transactions referral_transactions_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referral_transactions referral_transactions_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_transactions
    ADD CONSTRAINT referral_transactions_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rental_enquiries rental_enquiries_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_enquiries
    ADD CONSTRAINT rental_enquiries_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: room_categories room_categories_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_categories
    ADD CONSTRAINT room_categories_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: student_hostels student_hostels_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: student_hostels student_hostels_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: student_hostels student_hostels_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hostels
    ADD CONSTRAINT student_hostels_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: student_verifications student_verifications_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: student_verifications student_verifications_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: student_verifications student_verifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_verifications
    ADD CONSTRAINT student_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: swipes swipes_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: swipes swipes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swipes
    ADD CONSTRAINT swipes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: testimonials testimonials_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: testimonials testimonials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_earnings user_earnings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_earnings
    ADD CONSTRAINT user_earnings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wallet_ledger wallet_ledger_escrow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES public.escrow_transactions(id);


--
-- Name: wallet_ledger wallet_ledger_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: professionals Active professionals are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active professionals are public" ON public.professionals FOR SELECT USING (((is_active = true) AND (is_verified = true)));


--
-- Name: properties Active properties are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active properties are public" ON public.properties FOR SELECT USING ((status = 'active'::text));


--
-- Name: profiles Admin can update account status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update account status" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR ((auth.jwt() ->> 'email'::text) = 'divineandbassey@gmail.com'::text) OR ((auth.jwt() ->> 'email'::text) = 'prosperwithbassey@gmail.com'::text)));


--
-- Name: student_hostels Admin manage all hostels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage all hostels" ON public.student_hostels USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: student_verifications Admin read all verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin read all verifications" ON public.student_verifications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: rental_enquiries Admin reads enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin reads enquiries" ON public.rental_enquiries FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications Admin update verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin update verifications" ON public.student_verifications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'verifier'::text]))))));


--
-- Name: properties Admins and agents manage all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and agents manage all properties" ON public.properties FOR UPDATE USING (((auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'agent'::text])))))));


--
-- Name: properties Admins can update any property; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any property" ON public.properties FOR UPDATE USING (((seller_id = auth.uid()) OR public.is_admin()));


--
-- Name: properties Admins can view all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (seller_id = auth.uid()) OR public.is_admin()));


--
-- Name: profiles Admins full access profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access profiles" ON public.profiles USING (public.is_admin());


--
-- Name: agent_accounts Admins manage agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage agents" ON public.agent_accounts USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));


--
-- Name: properties Admins manage all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all properties" ON public.properties USING (public.is_staff());


--
-- Name: pinecone_index_status Admins manage pinecone status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage pinecone status" ON public.pinecone_index_status USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: professional_applications Admins manage professionals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage professionals" ON public.professional_applications USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: referral_transactions Admins manage referrals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage referrals" ON public.referral_transactions USING ((public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text])));


--
-- Name: crypto_payments Admins read all crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all crypto" ON public.crypto_payments FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: escrow_transactions Admins read all escrow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all escrow" ON public.escrow_transactions FOR SELECT USING (((auth.uid() = tenant_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: payments Admins read all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all payments" ON public.payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: admin_audit_log Admins read audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read audit log" ON public.admin_audit_log FOR SELECT USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Admins read mortgage apps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read mortgage apps" ON public.mortgage_applications FOR SELECT USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))));


--
-- Name: disputes Admins resolve disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins resolve disputes" ON public.disputes FOR UPDATE USING (public.is_staff());


--
-- Name: bookings Admins update bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update bookings" ON public.bookings FOR UPDATE USING (public.is_staff());


--
-- Name: crypto_payments Admins update crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update crypto" ON public.crypto_payments FOR UPDATE USING (public.is_staff());


--
-- Name: escrow_transactions Admins update escrow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update escrow" ON public.escrow_transactions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));


--
-- Name: payments Admins update payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update payments" ON public.payments FOR UPDATE USING (public.is_staff());


--
-- Name: payments Admins view all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT USING (public.is_staff());


--
-- Name: agent_scores Agent reads own score; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent reads own score" ON public.agent_scores FOR SELECT USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: complaints Agent responds to complaint; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent responds to complaint" ON public.complaints FOR UPDATE USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_verifications Agent submits own verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent submits own verifications" ON public.agent_verifications FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: agent_verifications Agent updates own pending; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent updates own pending" ON public.agent_verifications FOR UPDATE USING ((((agent_id = auth.uid()) AND (verdict = 'pending'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((((agent_id = auth.uid()) AND (verdict = 'pending'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_verifications Agent views own verifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agent views own verifications" ON public.agent_verifications FOR SELECT USING (((agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: agent_assignments Agents see own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents see own assignments" ON public.agent_assignments USING (((auth.uid() = agent_id) OR (auth.uid() = assigned_by)));


--
-- Name: agent_accounts Agents see own record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents see own record" ON public.agent_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agent_payments Agents view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents view own payments" ON public.agent_payments FOR SELECT USING ((auth.uid() = agent_id));


--
-- Name: admin_announcements Announcements manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements manage" ON public.admin_announcements USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: admin_announcements Announcements select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Announcements select" ON public.admin_announcements FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: professional_reviews Anyone can read reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read reviews" ON public.professional_reviews FOR SELECT USING (true);


--
-- Name: crypto_payments Anyone can submit crypto payment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit crypto payment" ON public.crypto_payments FOR INSERT WITH CHECK (true);


--
-- Name: rental_enquiries Anyone can submit enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK (true);


--
-- Name: mortgage_applications Anyone can submit mortgage app; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit mortgage app" ON public.mortgage_applications FOR INSERT WITH CHECK (true);


--
-- Name: crypto_wallets Anyone can view active crypto wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active crypto wallets" ON public.crypto_wallets FOR SELECT USING (true);


--
-- Name: platform_settings Anyone can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view settings" ON public.platform_settings FOR SELECT USING (true);


--
-- Name: admin_audit_log Anyone insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone insert audit log" ON public.admin_audit_log FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: bookings Auth users can create bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can create bookings" ON public.bookings FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: professional_reviews Auth users can write reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users can write reviews" ON public.professional_reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: deal_agreements Auth users create agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users create agreements" ON public.deal_agreements FOR INSERT WITH CHECK ((auth.uid() = buyer_id));


--
-- Name: disputes Auth users file disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users file disputes" ON public.disputes FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: crypto_payments Auth users submit crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users submit crypto" ON public.crypto_payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: property_reviews Auth users write reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth users write reviews" ON public.property_reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: professional_applications Authenticated users can apply; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can apply" ON public.professional_applications FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: deal_agreements Authenticated users can create agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create agreements" ON public.deal_agreements FOR INSERT WITH CHECK ((auth.uid() = buyer_id));


--
-- Name: bookings Authenticated users can create bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create bookings" ON public.bookings FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: professional_requests Authenticated users can request professionals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can request professionals" ON public.professional_requests FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: crypto_payments Authenticated users can submit crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can submit crypto" ON public.crypto_payments FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)));


--
-- Name: rental_enquiries Authenticated users can submit enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can submit enquiry" ON public.rental_enquiries FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: deal_agreements Buyers can view own agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can view own agreements" ON public.deal_agreements FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: deal_agreements Buyers view own agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers view own agreements" ON public.deal_agreements FOR SELECT USING ((auth.uid() = buyer_id));


--
-- Name: complaints Complaints visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Complaints visibility" ON public.complaints FOR SELECT USING (((complainant_id = auth.uid()) OR (agent_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: contracts Contract parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Contract parties access" ON public.contracts USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: deed_submissions Deed: parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deed: parties access" ON public.deed_submissions USING (((submitted_by = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((submitted_by = auth.uid()));


--
-- Name: escrow_transactions Escrow strict select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrow strict select" ON public.escrow_transactions FOR SELECT USING (((tenant_id = auth.uid()) OR (buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: escrow_transactions Escrow strict update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrow strict update" ON public.escrow_transactions FOR UPDATE USING ((((tenant_id = auth.uid()) AND (status = 'funded'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((((tenant_id = auth.uid()) AND (status = 'funded'::text)) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: bookings Guests view own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Guests view own bookings" ON public.bookings FOR SELECT USING (((auth.uid() = user_id) OR (property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))) OR public.is_staff()));


--
-- Name: property_inspections Inspection parties access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inspection parties access" ON public.property_inspections USING (((buyer_id = auth.uid()) OR (landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK ((buyer_id = auth.uid()));


--
-- Name: property_inspections Landlord agent update inspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Landlord agent update inspection" ON public.property_inspections FOR UPDATE USING (((landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((landlord_id = auth.uid()) OR (assigned_agent = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: wallet_ledger Ledger: recipient reads own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ledger: recipient reads own" ON public.wallet_ledger FOR SELECT USING (((recipient_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Lenders can update mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lenders can update mortgage applications" ON public.mortgage_applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text)))));


--
-- Name: mortgage_applications Lenders can view all mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lenders can view all mortgage applications" ON public.mortgage_applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'lender'::text)))));


--
-- Name: mortgage_applications Mortgage insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage insert" ON public.mortgage_applications FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: mortgage_applications Mortgage select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage select" ON public.mortgage_applications FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: mortgage_applications Mortgage update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mortgage update" ON public.mortgage_applications FOR UPDATE USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'lender'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_hostels Owner insert hostel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner insert hostel" ON public.student_hostels FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: hostel_payments Owner inserts hostel payment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner inserts hostel payment" ON public.hostel_payments FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: hostel_enquiries Owner reads own hostel enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner reads own hostel enquiries" ON public.hostel_enquiries FOR SELECT USING (((auth.uid() = student_id) OR (EXISTS ( SELECT 1
   FROM public.student_hostels h
  WHERE ((h.id = hostel_enquiries.hostel_id) AND (h.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: hostel_payments Owner reads own hostel payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner reads own hostel payments" ON public.hostel_payments FOR SELECT USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: student_hostels Owner update hostel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner update hostel" ON public.student_hostels FOR UPDATE USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));


--
-- Name: bookings Owners can manage bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage bookings" ON public.bookings USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))));


--
-- Name: room_categories Owners manage room categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners manage room categories" ON public.room_categories USING ((property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))));


--
-- Name: profiles Profile select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile select" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: profiles Profile update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile update" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: property_images Property images are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property images are public" ON public.property_images FOR SELECT USING (true);


--
-- Name: properties Property insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property insert" ON public.properties FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: properties Property select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property select" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: properties Property update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Property update" ON public.properties FOR UPDATE USING (((seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((seller_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: professional_applications Public can insert applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert applications" ON public.professional_applications FOR INSERT WITH CHECK (true);


--
-- Name: student_hostels Public read active hostels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read active hostels" ON public.student_hostels FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = owner_id)));


--
-- Name: properties Public read active properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read active properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR public.is_staff()));


--
-- Name: institutions Public read institutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read institutions" ON public.institutions FOR SELECT USING (true);


--
-- Name: pinecone_index_status Public read pinecone status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read pinecone status" ON public.pinecone_index_status FOR SELECT USING (true);


--
-- Name: property_reviews Public read property reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read property reviews" ON public.property_reviews FOR SELECT USING (true);


--
-- Name: room_categories Public read room categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read room categories" ON public.room_categories FOR SELECT USING (true);


--
-- Name: testimonials Public reads approved testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public reads approved testimonials" ON public.testimonials FOR SELECT USING ((status = 'approved'::text));


--
-- Name: referral_transactions Referrers see own earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Referrers see own earnings" ON public.referral_transactions FOR SELECT USING ((auth.uid() = referrer_id));


--
-- Name: profiles Self or staff reads profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Self or staff reads profiles" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.is_admin_staff()));


--
-- Name: properties Sellers can delete own props; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can delete own props" ON public.properties FOR DELETE USING ((auth.uid() = seller_id));


--
-- Name: properties Sellers can insert properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can insert properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() = seller_id));


--
-- Name: property_images Sellers can manage images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can manage images" ON public.property_images USING ((auth.uid() = ( SELECT properties.seller_id
   FROM public.properties
  WHERE (properties.id = property_images.property_id))));


--
-- Name: properties Sellers can update own props; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers can update own props" ON public.properties FOR UPDATE USING ((auth.uid() = seller_id));


--
-- Name: properties Sellers manage own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers manage own properties" ON public.properties USING ((auth.uid() = seller_id));


--
-- Name: property_interest Sellers see interests on own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sellers see interests on own properties" ON public.property_interest FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.properties
  WHERE ((properties.id = property_interest.property_id) AND (properties.seller_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'agent'::text])))))));


--
-- Name: payments Service inserts payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service inserts payments" ON public.payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: user_earnings Service role can insert earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert earnings" ON public.user_earnings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: payments Service role inserts payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role inserts payments" ON public.payments FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: properties Staff can view all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'agent'::text, 'verifier'::text])))))));


--
-- Name: bank_details Staff can view bank details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view bank details" ON public.bank_details FOR SELECT USING ((((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'agent'::text, 'senior_agent'::text, 'regional_coordinator'::text])))))));


--
-- Name: payments Staff reads all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads all payments" ON public.payments FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin_staff()));


--
-- Name: properties Staff reads all properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads all properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id) OR public.is_admin_staff()));


--
-- Name: mortgage_applications Staff reads mortgage applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads mortgage applications" ON public.mortgage_applications FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin_staff()));


--
-- Name: professional_applications Staff reads professional applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads professional applications" ON public.professional_applications FOR SELECT USING (public.is_admin_staff());


--
-- Name: rental_enquiries Staff reads rental enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff reads rental enquiries" ON public.rental_enquiries FOR SELECT USING (public.is_admin_staff());


--
-- Name: hostel_enquiries Student inserts enquiry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student inserts enquiry" ON public.hostel_enquiries FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: student_verifications Student verification select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student verification select" ON public.student_verifications FOR SELECT USING (((user_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications Student verification update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student verification update" ON public.student_verifications FOR UPDATE USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: platform_settings Superadmin can insert settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can insert settings" ON public.platform_settings FOR INSERT WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: bank_details Superadmin can manage bank details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage bank details" ON public.bank_details USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))) WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: crypto_wallets Superadmin can manage crypto wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can manage crypto wallets" ON public.crypto_wallets USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))) WITH CHECK (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: platform_settings Superadmin can update settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmin can update settings" ON public.platform_settings FOR UPDATE USING (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])));


--
-- Name: notifications System can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: referral_transactions System can insert referral transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert referral transactions" ON public.referral_transactions FOR INSERT WITH CHECK (true);


--
-- Name: loyalty_points System manages points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System manages points" ON public.loyalty_points WITH CHECK (true);


--
-- Name: agent_scores System updates scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System updates scores" ON public.agent_scores USING (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])))) WITH CHECK (((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: checkin_tokens Token: guest reads own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Token: guest reads own" ON public.checkin_tokens FOR SELECT USING (((guest_id = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'agent'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text]))));


--
-- Name: student_verifications User manage own verification; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User manage own verification" ON public.student_verifications USING ((auth.uid() = user_id));


--
-- Name: properties Users can insert own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own properties" ON public.properties FOR INSERT WITH CHECK ((auth.uid() = seller_id));


--
-- Name: properties Users can update own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own properties" ON public.properties FOR UPDATE USING ((auth.uid() = seller_id));


--
-- Name: properties Users can view all active properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all active properties" ON public.properties FOR SELECT USING (((status = 'active'::text) OR (auth.uid() = seller_id)));


--
-- Name: professional_applications Users can view own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own applications" ON public.professional_applications FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL)));


--
-- Name: user_earnings Users can view own earnings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own earnings" ON public.user_earnings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments Users can view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING ((email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));


--
-- Name: complaints Users file complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users file complaints" ON public.complaints FOR INSERT WITH CHECK ((complainant_id = auth.uid()));


--
-- Name: profiles Users insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: mortgage_applications Users manage own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own applications" ON public.mortgage_applications USING ((auth.uid() = user_id));


--
-- Name: property_interest Users manage own interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own interests" ON public.property_interest USING ((auth.uid() = user_id));


--
-- Name: matches Users manage own matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own matches" ON public.matches USING ((auth.uid() = user_id));


--
-- Name: swipes Users manage own swipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own swipes" ON public.swipes USING ((auth.uid() = user_id));


--
-- Name: testimonials Users read own testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own testimonials" ON public.testimonials FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: disputes Users see own disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own disputes" ON public.disputes USING ((auth.uid() = reporter_id));


--
-- Name: messages Users see own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own messages" ON public.messages USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));


--
-- Name: professional_requests Users see own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own requests" ON public.professional_requests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: testimonials Users submit own testimonial; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users submit own testimonial" ON public.testimonials FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.testimonials t
  WHERE ((t.user_id = auth.uid()) AND (t.status <> 'rejected'::text)))))));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (((id = auth.uid()) OR public.is_staff()));


--
-- Name: crypto_payments Users view own crypto; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own crypto" ON public.crypto_payments FOR SELECT USING ((((auth.uid())::text = (user_id)::text) OR public.is_staff()));


--
-- Name: crypto_payments Users view own crypto payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own crypto payments" ON public.crypto_payments FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL)));


--
-- Name: notifications Users view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments Users view own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own payments" ON public.payments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: loyalty_points Users view own points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own points" ON public.loyalty_points FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (((id = auth.uid()) OR public.is_staff()));


--
-- Name: referral_transactions Users view own referral transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own referral transactions" ON public.referral_transactions FOR SELECT USING ((auth.uid() = referrer_id));


--
-- Name: disputes Users view relevant disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view relevant disputes" ON public.disputes FOR SELECT USING (((auth.uid() = reporter_id) OR (property_id IN ( SELECT properties.id
   FROM public.properties
  WHERE (properties.seller_id = auth.uid()))) OR public.is_staff()));


--
-- Name: profiles admin_all_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all_profiles ON public.profiles USING (public.is_admin());


--
-- Name: admin_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_details ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: checkin_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: complaints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crypto_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crypto_wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: deed_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deed_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: escrow_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: hostel_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hostel_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: mortgage_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles own_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_profile_insert ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: profiles own_profile_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_profile_update ON public.profiles FOR UPDATE USING ((id = auth.uid()));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: pinecone_index_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pinecone_index_status ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: pro_activation_requests pro_activation: owner can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: owner can insert" ON public.pro_activation_requests FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: pro_activation_requests pro_activation: owner can select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: owner can select" ON public.pro_activation_requests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pro_activation_requests pro_activation: service role can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pro_activation: service role can update" ON public.pro_activation_requests FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: pro_activation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pro_activation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: professional_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: professionals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_policy ON public.profiles FOR SELECT USING (((auth.uid() = id) OR (public.get_my_role() = ANY (ARRAY['admin'::text, 'agent'::text, 'verifier'::text]))));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;

--
-- Name: property_inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: property_interest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_interest ENABLE ROW LEVEL SECURITY;

--
-- Name: property_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: rental_enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rental_enquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: room_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: student_hostels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_hostels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: swipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: user_earnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_earnings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_earnings user_earnings: owner can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: owner can insert" ON public.user_earnings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_earnings user_earnings: owner can select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: owner can select" ON public.user_earnings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_earnings user_earnings: service role can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_earnings: service role can update" ON public.user_earnings FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Admin views verification photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin views verification photos" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'verification-photos'::text) AND ((public.get_my_role() = ANY (ARRAY['admin'::text, 'superadmin'::text, 'verifier'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])) OR ((storage.foldername(name))[1] = (auth.uid())::text))));


--
-- Name: objects Admins read identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins read identity docs" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'identity-docs'::text) AND ((public.get_my_role() = ANY (ARRAY['admin'::text, 'verifier'::text, 'superadmin'::text])) OR (auth.email() = ANY (ARRAY['divineandbassey@gmail.com'::text, 'prosperwithbassey@gmail.com'::text])) OR ((storage.foldername(name))[1] = (auth.uid())::text))));


--
-- Name: objects Agents upload verification photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Agents upload verification photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'verification-photos'::text) AND (public.get_my_role() = ANY (ARRAY['agent'::text, 'admin'::text, 'superadmin'::text]))));


--
-- Name: objects Allow authenticated users to upload 107eh68_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated users to upload 107eh68_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: objects Allow public read 107eh68_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow public read 107eh68_0" ON storage.objects FOR SELECT USING (true);


--
-- Name: objects Avatar public read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Avatar public read" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));


--
-- Name: objects Avatar user update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Avatar user update" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Avatar user upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Avatar user upload" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Owner reads own identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owner reads own identity docs" ON storage.objects FOR SELECT USING (((bucket_id = 'identity-docs'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'agent'::text]))))))));


--
-- Name: objects Property img upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Property img upload" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'property-images'::text) AND (auth.role() = 'authenticated'::text)));


--
-- Name: objects Users delete own identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users delete own identity docs" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'identity-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users upload own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


--
-- Name: objects Users upload own identity docs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users upload own identity docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'identity-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects allow_auth_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY allow_auth_delete ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects allow_auth_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY allow_auth_insert ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects allow_auth_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY allow_auth_update ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects allow_public_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY allow_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict 8Y5ov9mBHGWzRahYZ8un5nNtRy1AEDyOElNRzB90deAxLExMtYvndnPThoR40XI


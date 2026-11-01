-- Tester reports and live progress. STAGING ONLY (project vogjbkgmqanjeaxnpzqs).
-- Deliberately not in supabase/migrations so it can never be applied to production.
-- Testers write; nobody can read the tables directly. The owner reads through test_feed(key).

create table if not exists public.test_settings (
  name text primary key,
  value text not null
);
alter table public.test_settings enable row level security;   -- no policies: unreadable by API roles

create table if not exists public.test_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seat_code text not null check (seat_code ~ '^(T[0-9]{1,2}|S1)-[A-Z]+-[A-Z0-9]{4}$'),
  seat text not null check (char_length(seat) between 2 and 40),
  tester_name text not null check (char_length(tester_name) between 1 and 80),
  outcome text not null check (outcome in ('passed','problems','stuck','not_started')),
  severity text not null default 'none' check (severity in ('none','S3','S2','S1')),
  step_no text check (char_length(step_no) <= 20),
  page_url text check (char_length(page_url) <= 500),
  tried text check (char_length(tried) <= 2000),
  happened text check (char_length(happened) <= 2000),
  expected text check (char_length(expected) <= 2000),
  device text check (char_length(device) <= 200),
  screenshot_url text check (char_length(screenshot_url) <= 500),
  status text not null default 'new' check (status in ('new','seen','fixed'))
);
alter table public.test_reports enable row level security;
drop policy if exists test_reports_insert on public.test_reports;
create policy test_reports_insert on public.test_reports for insert to anon, authenticated with check (true);
grant insert on public.test_reports to anon, authenticated;

create table if not exists public.test_progress (
  seat_code text primary key check (seat_code ~ '^(T[0-9]{1,2}|S1)-[A-Z]+-[A-Z0-9]{4}$'),
  seat text not null,
  done integer[] not null default '{}',
  total integer not null check (total between 1 and 60),
  updated_at timestamptz not null default now()
);
alter table public.test_progress enable row level security;

create or replace function public.test_save_progress(p_code text, p_seat text, p_done integer[], p_total integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_code !~ '^(T[0-9]{1,2}|S1)-[A-Z]+-[A-Z0-9]{4}$' or p_total not between 1 and 60
     or coalesce(array_length(p_done, 1), 0) > 60 then
    raise exception 'bad progress';
  end if;
  insert into public.test_progress (seat_code, seat, done, total, updated_at)
  values (p_code, left(p_seat, 40), coalesce(p_done, '{}'), p_total, now())
  on conflict (seat_code) do update
    set done = excluded.done, total = excluded.total, seat = excluded.seat, updated_at = now();
end $$;

create or replace function public.test_feed(p_key text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or p_key <> (select value from public.test_settings where name = 'feed_key') then
    raise exception 'not allowed';
  end if;
  return json_build_object(
    'reports',  coalesce((select json_agg(r order by r.created_at desc) from (select * from public.test_reports order by created_at desc limit 500) r), '[]'::json),
    'progress', coalesce((select json_agg(p) from public.test_progress p), '[]'::json)
  );
end $$;

revoke all on function public.test_save_progress(text, text, integer[], integer) from public;
revoke all on function public.test_feed(text) from public;
grant execute on function public.test_save_progress(text, text, integer[], integer) to anon, authenticated;
grant execute on function public.test_feed(text) to anon, authenticated;

-- Create the feed key once (run separately, then read it back and keep it private):
--   insert into public.test_settings values ('feed_key', replace(gen_random_uuid()::text, '-', ''))
--   on conflict (name) do nothing;
-- Rotate it:
--   update public.test_settings set value = replace(gen_random_uuid()::text, '-', '') where name = 'feed_key';

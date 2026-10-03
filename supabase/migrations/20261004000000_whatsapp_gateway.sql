-- ============================================================================
-- WhatsApp Gateway (v38)
--
-- Lets a person use DealMatch from WhatsApp without an account.
--
--   wa_contacts      One row per WhatsApp number. The number (wa_id) IS the
--                    primary key, so a person is registered the moment they
--                    first message us. Meta authenticates the sender on every
--                    webhook, so wa_id is a proven phone number, not a claim.
--                    profile_id stays NULL until they link a real DealMatch
--                    account (guest -> linked), and identity verification on
--                    that profile (identity_verification_status = 'approved')
--                    is what makes them fully verified.
--   wa_message_log   Inbound idempotency (Meta retries webhooks) and the
--                    source of truth for rate limiting. No message bodies.
--   wa_link_tokens   Single-use, short-lived, hashed tokens behind the
--                    "verify your account" link sent over WhatsApp.
--   wa_requests      Service / home requests made through WhatsApp.
--   wa_blocked_numbers  Pre-emptive block list (works before a contact row exists).
--
-- Everything here is service-role only. No client policies on purpose:
-- the webhook and the link-claim endpoint use the service-role key.
-- Additive only. No existing table, column, row, or policy is changed.
-- ============================================================================

begin;

-- ── 1. Contacts ─────────────────────────────────────────────────────────────
create table if not exists public.wa_contacts (
  wa_id            text primary key check (wa_id ~ '^[0-9]{8,15}$'),
  wa_profile_name  text,
  display_name     text,
  flow             text,
  flow_step        text,
  flow_data        jsonb not null default '{}'::jsonb,
  flow_expires_at  timestamptz,
  consent_at       timestamptz,
  consent_version  text,
  opted_out        boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'suspended', 'blocked')),
  status_reason    text,
  strikes          integer not null default 0,
  last_strike_at   timestamptz,
  last_notice_at   timestamptz,
  profile_id       uuid unique references public.profiles(id) on delete set null,
  linked_at        timestamptz,
  first_seen_at    timestamptz not null default now(),
  last_inbound_at  timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_wa_contacts_profile on public.wa_contacts(profile_id) where profile_id is not null;
create index if not exists idx_wa_contacts_status  on public.wa_contacts(status) where status <> 'active';

-- ── 2. Message log (idempotency + rate limiting) ────────────────────────────
create table if not exists public.wa_message_log (
  id         bigserial primary key,
  wamid      text,
  wa_id      text not null,
  direction  text not null default 'in' check (direction in ('in', 'out')),
  msg_type   text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_wa_message_log_wamid on public.wa_message_log(wamid) where wamid is not null;
create index if not exists idx_wa_message_log_recent on public.wa_message_log(wa_id, created_at desc);

-- ── 3. Link tokens ──────────────────────────────────────────────────────────
create table if not exists public.wa_link_tokens (
  id          uuid primary key default gen_random_uuid(),
  wa_id       text not null references public.wa_contacts(wa_id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_wa_link_tokens_wa on public.wa_link_tokens(wa_id, created_at desc);

-- ── 4. Requests made through WhatsApp ───────────────────────────────────────
create table if not exists public.wa_requests (
  id            uuid primary key default gen_random_uuid(),
  wa_id         text not null references public.wa_contacts(wa_id) on delete cascade,
  kind          text not null check (kind in ('service', 'home')),
  category      text,
  intent        text,
  location_text text,
  description   text,
  budget_max    bigint,
  result_count  integer not null default 0,
  status        text not null default 'open' check (status in ('open', 'matched', 'closed', 'flagged')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_wa_requests_wa on public.wa_requests(wa_id, created_at desc);

-- ── 5. Pre-emptive block list ───────────────────────────────────────────────
create table if not exists public.wa_blocked_numbers (
  wa_id      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

-- ── 6. Atomic strike counter ────────────────────────────────────────────────
-- Adds one strike and suspends the contact when the threshold is reached.
-- Suspended contacts get one notice a day and nothing else until staff
-- review: UPDATE public.wa_contacts SET status='active', strikes=0 WHERE wa_id='...';
create or replace function public.wa_add_strike(p_wa_id text, p_reason text, p_threshold integer default 3)
returns table (out_strikes integer, out_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.wa_contacts c
     set strikes        = c.strikes + 1,
         last_strike_at = now(),
         status         = case when c.status = 'active' and c.strikes + 1 >= p_threshold
                               then 'suspended' else c.status end,
         status_reason  = case when c.status = 'active' and c.strikes + 1 >= p_threshold
                               then left(coalesce(p_reason, 'strikes'), 200) else c.status_reason end
   where c.wa_id = p_wa_id
  returning c.strikes, c.status;
end;
$$;

revoke all on function public.wa_add_strike(text, text, integer) from public, anon, authenticated;
grant execute on function public.wa_add_strike(text, text, integer) to service_role;

-- ── 7. Retention ────────────────────────────────────────────────────────────
-- Message logs hold no message text, but there is still no reason to keep
-- them forever. Run manually, or schedule with Supabase pg_cron:
--   select cron.schedule('wa-purge', '30 3 * * *', $$select public.wa_purge_old(90)$$);
create or replace function public.wa_purge_old(p_days integer default 90)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.wa_message_log where created_at < now() - make_interval(days => p_days);
  delete from public.wa_link_tokens where expires_at < now() - interval '1 day';
$$;

revoke all on function public.wa_purge_old(integer) from public, anon, authenticated;
grant execute on function public.wa_purge_old(integer) to service_role;

-- ── 8. RLS: service role only ───────────────────────────────────────────────
alter table public.wa_contacts         enable row level security;
alter table public.wa_message_log      enable row level security;
alter table public.wa_link_tokens      enable row level security;
alter table public.wa_requests         enable row level security;
alter table public.wa_blocked_numbers  enable row level security;

drop policy if exists wa_contacts_no_client_access on public.wa_contacts;
create policy wa_contacts_no_client_access on public.wa_contacts for all using (false) with check (false);

drop policy if exists wa_message_log_no_client_access on public.wa_message_log;
create policy wa_message_log_no_client_access on public.wa_message_log for all using (false) with check (false);

drop policy if exists wa_link_tokens_no_client_access on public.wa_link_tokens;
create policy wa_link_tokens_no_client_access on public.wa_link_tokens for all using (false) with check (false);

drop policy if exists wa_requests_no_client_access on public.wa_requests;
create policy wa_requests_no_client_access on public.wa_requests for all using (false) with check (false);

drop policy if exists wa_blocked_numbers_no_client_access on public.wa_blocked_numbers;
create policy wa_blocked_numbers_no_client_access on public.wa_blocked_numbers for all using (false) with check (false);

commit;

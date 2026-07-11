-- ============================================================
-- DealMatch Pro Activation + User Earnings Tables
-- Run with "Run and enable RLS" in Supabase SQL Editor
-- ============================================================

-- ── 1. user_earnings ────────────────────────────────────────
-- Stores each user's cumulative platform earnings and Pro status.
-- Only the service role (backend) can update totals.
-- Users can only read their own row.

create table if not exists user_earnings (
  user_id       uuid references auth.users on delete cascade primary key,
  total_earned  numeric  default 0       not null,
  is_ambassador boolean  default false   not null,
  activated_at  timestamptz,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

alter table user_earnings enable row level security;

-- Users can read only their own earnings row
create policy "user_earnings: owner can select"
  on user_earnings for select
  using (auth.uid() = user_id);

-- Users can create their own row (first-time setup)
create policy "user_earnings: owner can insert"
  on user_earnings for insert
  with check (auth.uid() = user_id);

-- Users CANNOT update their own balance — only service role can.
-- This prevents anyone from manipulating their earning threshold.
-- Your backend/edge function uses the service role key to credit earnings.
create policy "user_earnings: service role can update"
  on user_earnings for update
  using (auth.role() = 'service_role');


-- ── 2. pro_activation_requests ──────────────────────────────
-- Records every DealMatch Pro activation request.
-- Created by the authenticated user. Read only by owner + admin.
-- Admin uses service role to approve and flip is_ambassador on user_earnings.

create table if not exists pro_activation_requests (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references auth.users on delete cascade not null,
  name         text        not null,
  phone        text        not null,
  email        text,
  city         text,
  status       text        default 'pending' not null,
                           -- pending | approved | rejected
  requested_at timestamptz default now() not null,
  reviewed_at  timestamptz,
  reviewed_by  uuid        references auth.users,
  notes        text
);

alter table pro_activation_requests enable row level security;

-- Users can only see their own requests
create policy "pro_activation: owner can select"
  on pro_activation_requests for select
  using (auth.uid() = user_id);

-- Users can submit a request (insert) only for themselves
create policy "pro_activation: owner can insert"
  on pro_activation_requests for insert
  with check (auth.uid() = user_id);

-- Users CANNOT update or delete their own requests
-- Only service role (admin backend) can change status
create policy "pro_activation: service role can update"
  on pro_activation_requests for update
  using (auth.role() = 'service_role');


-- ── 3. Auto-update updated_at on user_earnings ──────────────

create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_earnings_updated_at on user_earnings;
create trigger user_earnings_updated_at
  before update on user_earnings
  for each row execute function update_updated_at_column();


-- ── 4. Auto-create a user_earnings row on signup ────────────
-- So every new user immediately has a row with 0 earnings.

create or replace function handle_new_user_earnings()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_earnings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_new_user_create_earnings on auth.users;
create trigger on_new_user_create_earnings
  after insert on auth.users
  for each row execute function handle_new_user_earnings();


-- ── 5. Indexes for fast queries ──────────────────────────────
create index if not exists idx_user_earnings_user_id
  on user_earnings (user_id);

create index if not exists idx_pro_activation_user_id
  on pro_activation_requests (user_id);

create index if not exists idx_pro_activation_status
  on pro_activation_requests (status);

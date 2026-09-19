-- Item 2 of the fix request: optional payment for contact unlock, on both
-- sides of the marketplace (people AND places), as an alternative to going
-- through full escrow when someone genuinely just wants the contact - e.g.
-- to ask a provider a question before committing, or to call a landlord
-- about a shortlet before reserving it.
--
-- Design: a small prepaid credit wallet, not a one-off card charge per
-- unlock. A person buys a pack of credits once (Paystack, server-confirmed
-- via the webhook - see api/paystack-webhook.js's new 'contact_unlock_credits'
-- case, so a credit is only ever granted after payment actually clears,
-- same enforcement principle as escrow funding elsewhere in this app -
-- item 3/6 of the fix request), then spends 1 credit per contact they
-- unlock. Unlocking is idempotent: unlocking the same contact twice never
-- charges twice.
--
-- This sits ALONGSIDE the existing escrow-gated unlock, not instead of it -
-- get_property_contact() is extended (not replaced) to also grant access
-- when a credit-unlock row exists, and a new get_provider_contact()
-- mirrors the exact same pattern for provider/service listings, which
-- previously had no unlock mechanism at all (ProviderProfilePage.jsx just
-- showed a static "Phone locked" badge with nothing behind it).

begin;

create table if not exists public.unlock_credit_ledger (
  id           bigserial primary key,
  profile_id   uuid not null references auth.users(id) on delete cascade,
  entry_type   text not null check (entry_type in ('purchased','spent','refunded')),
  credits      integer not null check (credits > 0),
  price_cents  bigint, -- only set on 'purchased' rows
  payment_ref  text,   -- Paystack reference, only set on 'purchased' rows
  target_type  text,   -- only set on 'spent'/'refunded' rows: 'property' | 'provider'
  target_id    text,   -- uuid or bigint id of the property/provider, stored as text since it varies by target_type
  created_at   timestamptz not null default now()
);

create index if not exists idx_unlock_credit_ledger_profile on public.unlock_credit_ledger(profile_id, created_at desc);

alter table public.unlock_credit_ledger enable row level security;
drop policy if exists unlock_credit_ledger_select_own on public.unlock_credit_ledger;
create policy unlock_credit_ledger_select_own on public.unlock_credit_ledger
  for select using (auth.uid() = profile_id or public.is_admin());
-- No direct insert policy: 'purchased' rows are written by the webhook
-- (service role), 'spent'/'refunded' rows only by spend_unlock_credit()
-- below (SECURITY DEFINER) - never directly by a client.

create table if not exists public.contact_unlocks (
  id          bigserial primary key,
  buyer_id    uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('property','provider')),
  target_id   text not null,
  unlocked_via text not null default 'credit' check (unlocked_via in ('credit')), -- escrow-based access doesn't need a row here, it's already covered by escrow_transactions
  created_at  timestamptz not null default now(),
  unique (buyer_id, target_type, target_id)
);

alter table public.contact_unlocks enable row level security;
drop policy if exists contact_unlocks_select_own on public.contact_unlocks;
create policy contact_unlocks_select_own on public.contact_unlocks
  for select using (auth.uid() = buyer_id or public.is_admin());

-- ── Balance ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unlock_credit_balance(p_profile_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'spent' THEN -credits ELSE credits END), 0)::INTEGER
  FROM public.unlock_credit_ledger
  WHERE profile_id = COALESCE(p_profile_id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_unlock_credit_balance(UUID) TO authenticated;

-- ── Spend one credit to unlock a contact ────────────────────────────────
CREATE OR REPLACE FUNCTION public.spend_unlock_credit(p_target_type TEXT, p_target_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_balance INTEGER;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF p_target_type NOT IN ('property','provider') THEN
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  -- Idempotent: already unlocked this exact contact -> succeed without
  -- spending again. This is what makes the "unlock" durable rather than
  -- a per-view charge.
  IF EXISTS (SELECT 1 FROM public.contact_unlocks WHERE buyer_id = v_caller AND target_type = p_target_type AND target_id = p_target_id) THEN
    RETURN true;
  END IF;

  SELECT public.get_unlock_credit_balance(v_caller) INTO v_balance;
  IF v_balance < 1 THEN
    RAISE EXCEPTION 'Not enough unlock credits';
  END IF;

  INSERT INTO public.contact_unlocks (buyer_id, target_type, target_id) VALUES (v_caller, p_target_type, p_target_id);
  INSERT INTO public.unlock_credit_ledger (profile_id, entry_type, credits, target_type, target_id)
  VALUES (v_caller, 'spent', 1, p_target_type, p_target_id);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_unlock_credit(TEXT, TEXT) TO authenticated;

-- ── get_property_contact(): now also honors a credit unlock ────────────
CREATE OR REPLACE FUNCTION public.get_property_contact(p_property_id UUID)
RETURNS TABLE (full_name TEXT, phone TEXT, avatar_url TEXT, unlocked_reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID;
  v_caller    UUID := auth.uid();
  v_reason    TEXT := NULL;
BEGIN
  SELECT seller_id INTO v_seller_id FROM public.properties WHERE id = p_property_id;
  IF v_seller_id IS NULL THEN
    RETURN;
  END IF;

  IF v_caller IS NOT NULL AND v_caller = v_seller_id THEN
    v_reason := 'owner';
  ELSIF public.is_admin_staff() THEN
    v_reason := 'staff';
  ELSIF v_caller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.escrow_transactions et
    WHERE et.property_id = p_property_id
      AND et.status = 'funded'
      AND (et.buyer_id = v_caller OR et.tenant_id = v_caller OR et.seller_id = v_caller)
  ) THEN
    v_reason := 'escrow_funded';
  ELSIF v_caller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contact_unlocks
    WHERE buyer_id = v_caller AND target_type = 'property' AND target_id = p_property_id::TEXT
  ) THEN
    -- NEW: paid-credit unlock, an alternative to full escrow for someone
    -- who just wants to talk to the landlord/seller first.
    v_reason := 'credit_unlocked';
  END IF;

  IF v_reason IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.full_name, p.phone, p.avatar_url, v_reason
    FROM public.profiles p
    WHERE p.id = v_seller_id;
END;
$$;

-- ── get_provider_contact(): the same pattern for provider/service
--    listings, which had no unlock mechanism at all before this. Providers
--    are matched by their category_listings / business_pages ownership,
--    with "funded" defined as an active transaction against that provider
--    (mirrors escrow_transactions.status='funded' above, but for the
--    ADR-009 marketplace's `transactions` table).
CREATE OR REPLACE FUNCTION public.get_provider_contact(p_provider_id UUID)
RETURNS TABLE (full_name TEXT, phone TEXT, avatar_url TEXT, unlocked_reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_reason TEXT := NULL;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_provider_id) THEN
    RETURN;
  END IF;

  IF v_caller IS NOT NULL AND v_caller = p_provider_id THEN
    v_reason := 'owner';
  ELSIF public.is_admin_staff() THEN
    v_reason := 'staff';
  ELSIF v_caller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.provider_id = p_provider_id
      AND t.status = 'FUNDED'
      AND (t.requester_id = v_caller OR t.provider_id = v_caller)
  ) THEN
    v_reason := 'escrow_funded';
  ELSIF v_caller IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contact_unlocks
    WHERE buyer_id = v_caller AND target_type = 'provider' AND target_id = p_provider_id::TEXT
  ) THEN
    v_reason := 'credit_unlocked';
  END IF;

  IF v_reason IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.full_name, p.phone, p.avatar_url, v_reason
    FROM public.profiles p
    WHERE p.id = p_provider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_provider_contact(UUID) TO authenticated;

commit;

-- =====================================================================
-- 0007 — Sistema de referidos (idempotente)
-- =====================================================================
-- Tabla de vínculos de referidos + RPC atómica para otorgar el número
-- gratis al referente cuando el invitado aprueba una compra.
-- =====================================================================

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referred_id uuid not null references auth.users (id) on delete cascade,
  rewarded boolean not null default false,
  rewarded_raffle_id uuid references public.raffles (id) on delete set null,
  rewarded_number int,
  created_at timestamptz not null default now(),
  constraint referrals_unique unique (referrer_id, referred_id)
);

create index if not exists referrals_referred_idx
  on public.referrals (referred_id) where rewarded = false;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

drop policy if exists "referrals_insert_referred" on public.referrals;
create policy "referrals_insert_referred"
  on public.referrals for insert
  with check (auth.uid() = referred_id and referrer_id <> referred_id);

-- Sin UPDATE/DELETE desde el cliente.

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert on public.referrals to authenticated;
grant all on public.referrals to service_role;

-- ---------------------------------------------------------------------
-- RPC: otorga un número gratis al referente (atómica e idempotente)
-- SOLO service role (se llama desde el webhook).
-- ---------------------------------------------------------------------
create or replace function public.reward_referral(
  p_referral_id uuid,
  p_raffle_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_number int;
begin
  -- Bloquea la fila del referido para evitar premios duplicados.
  select referrer_id into v_referrer
  from public.referrals
  where id = p_referral_id and rewarded = false
  for update;

  if v_referrer is null then
    return null;
  end if;

  -- Número aleatorio disponible del mismo sorteo.
  select number into v_number
  from public.raffle_numbers
  where raffle_id = p_raffle_id and status = 'available'
  order by random()
  limit 1;

  if v_number is null then
    return null;
  end if;

  -- Marca el número como vendido para el referente (gratis).
  update public.raffle_numbers
  set status = 'sold',
      sold_to = v_referrer,
      sold_at = now(),
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id and number = v_number and status = 'available';

  -- Marca el vínculo como recompensado.
  update public.referrals
  set rewarded = true,
      rewarded_raffle_id = p_raffle_id,
      rewarded_number = v_number
  where id = p_referral_id;

  return v_number;
end;
$$;

revoke execute on function public.reward_referral(uuid, uuid) from public, anon;
grant execute on function public.reward_referral(uuid, uuid) to service_role;

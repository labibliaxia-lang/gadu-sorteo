-- =====================================================================
-- 0108 — Estructura comercial final de planes
-- =====================================================================
-- Starter: 2 sorteos · 300 números · sin landing, referidos ni analíticas.
-- Pro    : 6 sorteos · 1.000 números · landing · 10 referidos por sorteo.
-- Premium: 20 sorteos · 10.000 números · referidos ilimitados + bonus · MP.
-- Social : como Premium salvo Mercado Pago. Solo lo asigna el Superadmin.
--
-- Además:
--   · raffles.currency acepta USD.
--   · Tope de referidos por sorteo aplicado en la base (trigger).
--   · El plan Social no se puede autoasignar.
--
-- Idempotente. No toca prepago, webhook ni el motor de sorteos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuración final
-- ---------------------------------------------------------------------
alter table public.plan_configs
  add column if not exists max_referrals_per_raffle integer not null default 0
    check (max_referrals_per_raffle between 0 and 1000);

insert into public.plan_configs
  (plan_name, label, max_raffles, max_numbers, max_prizes, price_ars,
   allow_referrals, allow_landing, allow_mp, allow_auto_draw,
   max_referrals_per_raffle)
values
  ('organizador', 'Starter', 2, 300, 3, 0, false, false, false, false, 0),
  ('pro', 'Pro', 6, 1000, 10, 0, true, true, false, false, 10),
  ('premium', 'Premium', 20, 10000, 30, 0, true, true, true, true, 0),
  ('social', 'Social / ONG', 20, 10000, 30, 0, true, true, false, true, 0)
on conflict (plan_name) do update set
  label = excluded.label,
  max_raffles = excluded.max_raffles,
  max_numbers = excluded.max_numbers,
  max_prizes = excluded.max_prizes,
  allow_referrals = excluded.allow_referrals,
  allow_landing = excluded.allow_landing,
  allow_mp = excluded.allow_mp,
  allow_auto_draw = excluded.allow_auto_draw,
  max_referrals_per_raffle = excluded.max_referrals_per_raffle,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 2) Multimoneda: USD
-- ---------------------------------------------------------------------
alter table public.raffles drop constraint if exists raffles_currency_check;
alter table public.raffles
  add constraint raffles_currency_check
  check (currency in ('ARS', 'MXN', 'COP', 'CLP', 'USD'));

-- ---------------------------------------------------------------------
-- 3) Tope de referidos por sorteo (según plan del organizador)
-- ---------------------------------------------------------------------
create or replace function public.enforce_referral_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_plan text;
  v_cap integer;
  v_usados int;
  v_origen uuid;
begin
  if not new.rewarded or coalesce(old.rewarded, false) then
    return new;
  end if;

  -- Sorteo que originó el premio (0105); si es legacy, el destino.
  v_origen := coalesce(new.rewarded_via_raffle_id, new.rewarded_raffle_id);

  select created_by into v_owner from public.raffles where id = v_origen;
  if v_owner is null then
    return new;
  end if;

  select plan into v_plan from public.profiles where id = v_owner;

  select coalesce(c.max_referrals_per_raffle, 0) into v_cap
    from public.plan_configs c
   where c.plan_name = coalesce(v_plan, 'organizador');

  if coalesce(v_cap, 0) <= 0 then
    return new;
  end if;

  select count(*) into v_usados
    from public.referrals r
   where r.rewarded
     and coalesce(r.rewarded_via_raffle_id, r.rewarded_raffle_id) = v_origen;

  if v_usados >= v_cap then
    raise exception
      'Este sorteo alcanzó el máximo de % referidos de tu plan', v_cap;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_referral_cap on public.referrals;
create trigger enforce_referral_cap
  before update on public.referrals
  for each row execute procedure public.enforce_referral_cap();

-- ---------------------------------------------------------------------
-- 4) El Plan Social solo lo asigna el Superadmin
-- ---------------------------------------------------------------------
create or replace function public.prevent_social_self_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan = 'social'
     and coalesce(old.plan, '') is distinct from 'social'
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'El Plan Social solo lo puede asignar el Superadmin';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_social_self_assign on public.profiles;
create trigger prevent_social_self_assign
  before update of plan on public.profiles
  for each row execute procedure public.prevent_social_self_assign();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0108', 'planes finales: starter 300, pro con 10 referidos, social sin MP, USD y tope de referidos en la base')
    on conflict (version) do nothing;
  end if;
end;
$$;

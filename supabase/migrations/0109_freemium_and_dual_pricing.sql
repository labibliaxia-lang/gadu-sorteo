-- =====================================================================
-- 0109 — Plan Free, precios duales y orden comercial
-- =====================================================================
-- 1. `plan_configs.price_usd`: precio de referencia en dólares, siempre
--    numérico (nunca null).
-- 2. Plan `free`: 1 sorteo activo, 100 números, sin funciones premium.
-- 3. Precios de los 5 planes (USD de referencia / ARS local):
--      free      0 / 0
--      starter   3 / 3.000
--      pro      10 / 10.000
--      premium  25 / 25.000
--      social    0 / 0 (beneficios premium sin MP)
--
-- No se tocan los triggers de límites: siguen leyendo plan_configs.
-- Idempotente.
-- =====================================================================

alter table public.plan_configs
  add column if not exists price_usd numeric(12, 2) not null default 0;

alter table public.plan_configs
  drop constraint if exists plan_configs_price_usd_check;
alter table public.plan_configs
  add constraint plan_configs_price_usd_check check (price_usd >= 0);

-- Planes permitidos: ahora incluye free (se busca el check por definición).
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.plan_configs'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan_name%'
  loop
    execute format('alter table public.plan_configs drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
     where conrelid = 'public.plan_prices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.plan_prices drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.plan_configs
  add constraint plan_configs_plan_name_check
  check (plan_name in ('free', 'organizador', 'pro', 'premium', 'social'));

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'organizador', 'pro', 'premium', 'social'));

alter table public.plan_prices
  add constraint plan_prices_plan_check
  check (plan in ('free', 'organizador', 'pro', 'premium', 'social'));

-- Semilla y precios duales
insert into public.plan_configs
  (plan_name, label, max_raffles, max_numbers, max_prizes, price_ars, price_usd,
   allow_referrals, allow_landing, allow_mp, allow_auto_draw,
   max_referrals_per_raffle)
values
  ('free', 'Free', 1, 100, 1, 0, 0, false, false, false, false, 0)
on conflict (plan_name) do update set
  label = excluded.label,
  max_raffles = excluded.max_raffles,
  max_numbers = excluded.max_numbers,
  max_prizes = excluded.max_prizes,
  price_ars = excluded.price_ars,
  price_usd = excluded.price_usd,
  allow_referrals = excluded.allow_referrals,
  allow_landing = excluded.allow_landing,
  allow_mp = excluded.allow_mp,
  allow_auto_draw = excluded.allow_auto_draw,
  max_referrals_per_raffle = excluded.max_referrals_per_raffle,
  updated_at = now();

update public.plan_configs set price_usd = 3,  price_ars = 3000,  updated_at = now() where plan_name = 'organizador';
update public.plan_configs set price_usd = 10, price_ars = 10000, updated_at = now() where plan_name = 'pro';
update public.plan_configs set price_usd = 25, price_ars = 25000, updated_at = now() where plan_name = 'premium';
update public.plan_configs set price_usd = 0,  price_ars = 0,     updated_at = now() where plan_name = 'social';

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0109', 'plan free, precio_usd en plan_configs y precios duales de los 5 planes')
    on conflict (version) do nothing;
  end if;
end;
$$;

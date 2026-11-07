-- =====================================================================
-- 0116 — Cotizaciones LATAM y precios locales de planes
-- =====================================================================
-- 1. `exchange_rates`: unidades de moneda local por 1 USD.
-- 2. `plan_configs.price_mxn`, `price_cop`, `price_clp`: precios locales
--    recalculados por el cron a partir de `price_usd`.
--
-- ARS ya existía como `price_ars`. La tabla `plan_prices` no se toca.
-- Idempotente.
-- =====================================================================

create table if not exists public.exchange_rates (
  currency_code text primary key,
  rate_to_usd numeric(14, 4) not null check (rate_to_usd > 0),
  updated_at timestamptz not null default now()
);

-- Valores de respaldo: si la API externa cae, el sistema sigue mostrando
-- estos hasta la próxima actualización exitosa.
insert into public.exchange_rates (currency_code, rate_to_usd, updated_at)
values
  ('ARS', 1000, now()),
  ('MXN', 18, now()),
  ('COP', 4000, now()),
  ('CLP', 950, now())
on conflict (currency_code) do nothing;

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_public_read" on public.exchange_rates;
create policy "exchange_rates_public_read"
  on public.exchange_rates for select
  to anon, authenticated
  using (true);

-- Privilegios de tabla: la política RLS sola NO alcanza. Sin estos grants,
-- el service_role del cron no puede hacer upsert (permission denied) y las
-- cotizaciones quedan viejas aunque el cron responda ok.
grant select on public.exchange_rates to anon, authenticated;
grant select, insert, update, delete on public.exchange_rates to service_role;

-- Precios locales de cada plan.
alter table public.plan_configs
  add column if not exists price_mxn numeric(12, 2) not null default 0;
alter table public.plan_configs
  add column if not exists price_cop numeric(12, 2) not null default 0;
alter table public.plan_configs
  add column if not exists price_clp numeric(12, 2) not null default 0;

alter table public.plan_configs
  drop constraint if exists plan_configs_price_mxn_check;
alter table public.plan_configs
  add constraint plan_configs_price_mxn_check check (price_mxn >= 0);

alter table public.plan_configs
  drop constraint if exists plan_configs_price_cop_check;
alter table public.plan_configs
  add constraint plan_configs_price_cop_check check (price_cop >= 0);

alter table public.plan_configs
  drop constraint if exists plan_configs_price_clp_check;
alter table public.plan_configs
  add constraint plan_configs_price_clp_check check (price_clp >= 0);

-- Relleno inicial desde USD y las cotizaciones de respaldo.
update public.plan_configs c
   set price_mxn = round(c.price_usd * r.rate_to_usd, 2),
       updated_at = now()
  from public.exchange_rates r
 where r.currency_code = 'MXN'
   and c.price_usd > 0
   and c.price_mxn = 0;

update public.plan_configs c
   set price_cop = round(c.price_usd * r.rate_to_usd, 2),
       updated_at = now()
  from public.exchange_rates r
 where r.currency_code = 'COP'
   and c.price_usd > 0
   and c.price_cop = 0;

update public.plan_configs c
   set price_clp = round(c.price_usd * r.rate_to_usd, 2),
       updated_at = now()
  from public.exchange_rates r
 where r.currency_code = 'CLP'
   and c.price_usd > 0
   and c.price_clp = 0;

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0116', 'cotizaciones latam y precios locales por plan')
    on conflict (version) do nothing;
  end if;
end;
$$;

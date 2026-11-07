-- =====================================================================
-- Verificador 0117 — recálculo de precios locales al cambiar USD
-- =====================================================================
-- 1 trigger existe, habilitado y es BEFORE UPDATE OF price_usd
-- 2 función existe
-- 3 cambiar USD recalcula las 4 monedas con la cotización vigente
-- 4 USD 0 deja los 4 locales en 0
-- 5 reenviar el mismo USD (sin cambio de valor) también resincroniza
-- 6 ledger 0117
-- Todo dentro de una transacción con ROLLBACK: no deja cambios.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v117', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v117',
    coalesce(current_setting('test.v117', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_plan text;
  v_usd numeric;
begin
  select plan_name, price_usd into v_plan, v_usd
    from public.plan_configs
   where price_usd > 0
   order by price_usd
   limit 1;

  perform set_config('test.v117.plan', coalesce(v_plan, ''), true);
  perform set_config('test.v117.usd', coalesce(v_usd::text, ''), true);
end $$;

-- 1) Trigger
do $$
begin
  perform pg_temp.anota('1 ' || case when exists (
    select 1 from pg_trigger
     where tgrelid = 'public.plan_configs'::regclass
       and tgname = 'recalcular_precios_plan'
       and tgenabled = 'O'
       and pg_get_triggerdef(oid) like '%BEFORE UPDATE OF price_usd%')
    then 'OK       trigger BEFORE UPDATE OF price_usd habilitado'
    else 'CRÍTICO  falta el trigger o está mal definido' end);
end $$;

-- 2) Función
do $$
begin
  perform pg_temp.anota('2 ' || case when exists (
    select 1 from pg_proc
     where proname = 'recalcular_precios_plan'
       and pronamespace = 'public'::regnamespace)
    then 'OK       existe la función recalcular_precios_plan'
    else 'CRÍTICO  falta la función' end);
end $$;

-- 3) Cambio de USD recalcula
do $$
declare
  v_plan text := nullif(current_setting('test.v117.plan', true), '');
  v_ars numeric; v_mxn numeric; v_cop numeric; v_clp numeric;
  v_ok boolean;
begin
  if v_plan is null then
    perform pg_temp.anota('3 AVISO    no hay plan pago para probar');
    return;
  end if;

  select
    max(rate_to_usd) filter (where currency_code = 'ARS'),
    max(rate_to_usd) filter (where currency_code = 'MXN'),
    max(rate_to_usd) filter (where currency_code = 'COP'),
    max(rate_to_usd) filter (where currency_code = 'CLP')
  into v_ars, v_mxn, v_cop, v_clp
  from public.exchange_rates;

  update public.plan_configs set price_usd = 7 where plan_name = v_plan;

  select (price_ars = round(7 * coalesce(v_ars, 0), 2)
      and price_mxn = round(7 * coalesce(v_mxn, 0), 2)
      and price_cop = round(7 * coalesce(v_cop, 0), 2)
      and price_clp = round(7 * coalesce(v_clp, 0), 2))
    into v_ok
    from public.plan_configs where plan_name = v_plan;

  perform pg_temp.anota('3 ' || case when v_ok
    then 'OK       USD 7 recalcula las cuatro monedas con ROUND(...,2)'
    else 'CRÍTICO  los precios locales no coinciden con la cotización' end);
end $$;

-- 4) USD 0 deja todo en 0
do $$
declare
  v_plan text := nullif(current_setting('test.v117.plan', true), '');
  v_ok boolean;
begin
  if v_plan is null then return; end if;

  update public.plan_configs set price_usd = 0 where plan_name = v_plan;

  select (price_ars = 0 and price_mxn = 0 and price_cop = 0 and price_clp = 0)
    into v_ok
    from public.plan_configs where plan_name = v_plan;

  perform pg_temp.anota('4 ' || case when v_ok
    then 'OK       USD 0 deja los cuatro precios locales en 0'
    else 'CRÍTICO  quedaron precios locales distintos de 0' end);
end $$;

-- 5) Reenviar el mismo USD resincroniza (sin guard de mismo valor)
do $$
declare
  v_plan text := nullif(current_setting('test.v117.plan', true), '');
  v_ars numeric; v_mxn numeric; v_cop numeric; v_clp numeric;
  v_usd numeric;
  v_ok boolean;
begin
  if v_plan is null then return; end if;

  update public.plan_configs set price_usd = 3 where plan_name = v_plan;

  select
    max(rate_to_usd) filter (where currency_code = 'ARS'),
    max(rate_to_usd) filter (where currency_code = 'MXN'),
    max(rate_to_usd) filter (where currency_code = 'COP'),
    max(rate_to_usd) filter (where currency_code = 'CLP')
  into v_ars, v_mxn, v_cop, v_clp
  from public.exchange_rates;

  -- Ensucia los locales y reenvía el MISMO USD (3).
  update public.plan_configs
     set price_ars = 1, price_mxn = 1, price_cop = 1, price_clp = 1
   where plan_name = v_plan;

  update public.plan_configs set price_usd = 3 where plan_name = v_plan;

  select price_usd,
         (price_ars = round(3 * coalesce(v_ars, 0), 2)
      and price_mxn = round(3 * coalesce(v_mxn, 0), 2)
      and price_cop = round(3 * coalesce(v_cop, 0), 2)
      and price_clp = round(3 * coalesce(v_clp, 0), 2))
    into v_usd, v_ok
    from public.plan_configs where plan_name = v_plan;

  perform pg_temp.anota('5 ' || case when v_ok and v_usd = 3
    then 'OK       reenviar el mismo USD también resincroniza los locales'
    else 'CRÍTICO  el mismo USD no resincronizó los precios' end);
end $$;

-- 6) Ledger
do $$
begin
  perform pg_temp.anota('6 ' || case when exists (
    select 1 from public._applied_migrations where version = '0117')
    then 'OK       ledger registra 0117'
    else 'CRÍTICO  falta la fila 0117' end);
end $$;

select current_setting('test.v117', true) as resultado;
rollback;

-- =====================================================================
-- Verificador 0116 — cotizaciones LATAM y precios locales
-- =====================================================================
-- 1 tabla exchange_rates existe
-- 2 monedas ARS/MXN/COP/CLP con cotización válida
-- 3 RLS activa y política de lectura pública
-- 4 plan_configs.price_mxn/cop/clp existen, NOT NULL, default 0
-- 5 constraints de no negativo
-- 6 precios locales de planes pagos > 0
-- 7 coherencia: precio local ≈ price_usd * cotización
-- 8 ledger 0116
-- Solo lectura: no modifica nada.
-- =====================================================================

do $$ begin perform set_config('test.v116', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v116',
    coalesce(current_setting('test.v116', true), '') || p_linea || E'\n', true);
end $$;

-- 1) Tabla
do $$
begin
  perform pg_temp.anota('1 ' || case when to_regclass('public.exchange_rates') is not null
    then 'OK       existe la tabla exchange_rates'
    else 'CRÍTICO  falta exchange_rates' end);
end $$;

-- 2) Monedas
do $$
declare
  v_faltan text;
  v_invalidas text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['ARS', 'MXN', 'COP', 'CLP']) as c
   where not exists (
     select 1 from public.exchange_rates r where r.currency_code = c
   );

  select string_agg(currency_code, ', ') into v_invalidas
    from public.exchange_rates
   where rate_to_usd is null or rate_to_usd <= 0;

  perform pg_temp.anota('2 ' || case
    when v_faltan is null and v_invalidas is null
      then 'OK       ARS/MXN/COP/CLP tienen cotización válida'
    else 'CRÍTICO  faltan: ' || coalesce(v_faltan, 'ninguna')
         || ' · inválidas: ' || coalesce(v_invalidas, 'ninguna') end);
end $$;

-- 3) RLS y política
do $$
declare v_rls boolean; v_politica boolean;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.exchange_rates'::regclass;

  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'exchange_rates'
       and policyname = 'exchange_rates_public_read'
       and cmd = 'SELECT'
  ) into v_politica;

  perform pg_temp.anota('3 ' || case when v_rls and v_politica
    then 'OK       RLS activa con lectura pública'
    else 'CRÍTICO  rls=' || coalesce(v_rls::text, 'null')
         || ' politica=' || coalesce(v_politica::text, 'null') end);
end $$;

-- 3b) Grants de tabla (RLS sola no alcanza: service_role necesita escribir)
do $$
declare
  v_service text;
  v_lectura text;
begin
  select string_agg(privilege_type, ', ' order by privilege_type) into v_service
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'exchange_rates'
     and grantee = 'service_role'
     and privilege_type in ('INSERT', 'UPDATE');

  select string_agg(grantee, ', ' order by grantee) into v_lectura
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'exchange_rates'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'SELECT';

  perform pg_temp.anota('3b ' || case
    when v_service is not null and v_lectura is not null
      then 'OK       grants correctos: service_role escribe y anon/authenticated leen'
    else 'CRÍTICO  grants incompletos · service_role: ' || coalesce(v_service, 'ninguno')
         || ' · lectura pública: ' || coalesce(v_lectura, 'ninguna') end);
end $$;

-- 4) Columnas de precios locales
do $$
declare
  v_faltan text;
  v_mal text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['price_mxn', 'price_cop', 'price_clp']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'plan_configs'
        and column_name = c
   );

  select string_agg(column_name, ', ') into v_mal
    from information_schema.columns
   where table_schema = 'public' and table_name = 'plan_configs'
     and column_name in ('price_mxn', 'price_cop', 'price_clp')
     and (is_nullable = 'YES' or column_default is null or column_default not like '%0%');

  perform pg_temp.anota('4 ' || case when v_faltan is null and v_mal is null
    then 'OK       price_mxn/cop/clp existen con NOT NULL y default 0'
    else 'CRÍTICO  faltan: ' || coalesce(v_faltan, 'ninguna')
         || ' · mal definidas: ' || coalesce(v_mal, 'ninguna') end);
end $$;

-- 5) Constraints
do $$
declare v_faltan text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array[
      'plan_configs_price_mxn_check',
      'plan_configs_price_cop_check',
      'plan_configs_price_clp_check'
    ]) as c
   where not exists (
     select 1 from pg_constraint
      where conrelid = 'public.plan_configs'::regclass and conname = c
   );

  perform pg_temp.anota('5 ' || case when v_faltan is null
    then 'OK       los tres precios tienen check de no negativo'
    else 'CRÍTICO  faltan constraints: ' || v_faltan end);
end $$;

-- 6) Planes pagos con precios locales
do $$
declare v_mal text;
begin
  select string_agg(plan_name, ', ') into v_mal
    from public.plan_configs
   where price_usd > 0
     and (price_mxn <= 0 or price_cop <= 0 or price_clp <= 0);

  perform pg_temp.anota('6 ' || case when v_mal is null
    then 'OK       los planes pagos tienen precios locales cargados'
    else 'CRÍTICO  sin precios locales: ' || v_mal end);
end $$;

-- 7) Coherencia con la cotización guardada (tolerancia de redondeo)
do $$
declare v_mal text;
begin
  select string_agg(c.plan_name, ', ') into v_mal
    from public.plan_configs c
    join public.exchange_rates m on m.currency_code = 'MXN'
    join public.exchange_rates p on p.currency_code = 'COP'
    join public.exchange_rates l on l.currency_code = 'CLP'
   where c.price_usd > 0
     and (
       abs(c.price_mxn - c.price_usd * m.rate_to_usd) > 1
       or abs(c.price_cop - c.price_usd * p.rate_to_usd) > 1
       or abs(c.price_clp - c.price_usd * l.rate_to_usd) > 1
     );

  perform pg_temp.anota('7 ' || case when v_mal is null
    then 'OK       precios locales coherentes con la cotización'
    else 'AVISO    desfasados (correr el cron): ' || v_mal end);
end $$;

-- 8) Ledger
do $$
begin
  perform pg_temp.anota('8 ' || case when exists (
    select 1 from public._applied_migrations where version = '0116')
    then 'OK       ledger registra 0116'
    else 'CRÍTICO  falta la fila 0116' end);
end $$;

select current_setting('test.v116', true) as resultado;

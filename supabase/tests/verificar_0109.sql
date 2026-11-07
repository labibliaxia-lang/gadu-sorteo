-- =====================================================================
-- Verificador 0109 — plan Free y precios duales
-- =====================================================================
-- 1 existen los 5 planes
-- 2 precios duales cargados (USD / ARS)
-- 3 límites del plan Free
-- 4 price_usd no acepta NULL
-- 5 el perfil acepta el plan free
-- 6 el límite de 1 sorteo activo del Free aplica en la base
-- 7 ledger
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v109', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v109',
    coalesce(current_setting('test.v109', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles
   where role = 'admin' order by created_at limit 1;
  if v_owner is null then
    select id into v_owner from public.profiles
     where role = 'superadmin' order by created_at limit 1;
  end if;
  perform set_config('test.v109.owner', coalesce(v_owner::text, ''), true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 1) Cinco planes
do $$
declare v_n int;
begin
  select count(*) into v_n from public.plan_configs;
  perform pg_temp.anota('1 ' || case when v_n = 5
    then 'OK       existen los 5 planes'
    else 'CRÍTICO  planes en la tabla: ' || v_n end);
end $$;

-- 2) Precios duales
do $$
declare v_ok boolean;
begin
  select bool_and(ok) into v_ok from (
    select (price_usd = 0 and price_ars = 0) as ok
      from public.plan_configs where plan_name = 'free'
    union all
    select (price_usd = 3 and price_ars = 3000)
      from public.plan_configs where plan_name = 'organizador'
    union all
    select (price_usd = 10 and price_ars = 10000)
      from public.plan_configs where plan_name = 'pro'
    union all
    select (price_usd = 25 and price_ars = 25000)
      from public.plan_configs where plan_name = 'premium'
    union all
    select (price_usd = 0 and price_ars = 0)
      from public.plan_configs where plan_name = 'social'
  ) filas;

  perform pg_temp.anota('2 ' || case when v_ok
    then 'OK       precios duales USD/ARS de los 5 planes'
    else 'CRÍTICO  algún precio no coincide' end);
end $$;

-- 3) Límites del Free
do $$
declare v_ok boolean;
begin
  select (max_raffles = 1 and max_numbers = 100 and max_prizes = 1
          and not allow_referrals and not allow_landing
          and not allow_mp and not allow_auto_draw) into v_ok
    from public.plan_configs where plan_name = 'free';

  perform pg_temp.anota('3 ' || case when v_ok
    then 'OK       Free: 1 sorteo, 100 números y sin funciones premium'
    else 'CRÍTICO  los límites del Free no coinciden' end);
end $$;

-- 4) price_usd no nulo
do $$
declare v_mal boolean := false;
begin
  begin
    update public.plan_configs set price_usd = null where plan_name = 'free';
  exception when others then v_mal := true; end;

  perform pg_temp.anota('4 ' || case when v_mal
    then 'OK       price_usd rechaza NULL'
    else 'CRÍTICO  price_usd aceptó NULL' end);
end $$;

-- 5) El perfil acepta plan free
do $$
declare
  v_owner uuid := nullif(current_setting('test.v109.owner', true), '')::uuid;
  v_plan text;
begin
  if v_owner is null then return; end if;

  update public.profiles set plan = 'free' where id = v_owner;
  select plan into v_plan from public.profiles where id = v_owner;

  perform pg_temp.anota('5 ' || case when v_plan = 'free'
    then 'OK       el perfil acepta el plan free'
    else 'CRÍTICO  el plan quedó en ' || coalesce(v_plan, 'null') end);
end $$;

-- 6) Tope de 1 sorteo activo del Free
do $$
declare
  v_owner uuid := nullif(current_setting('test.v109.owner', true), '')::uuid;
  v_bloqueo boolean := false;
begin
  if v_owner is null then return; end if;

  insert into public.raffles (title, draw_date, price_per_number, status,
                              created_by, payment_type)
  values ('v109 free 1', now() + interval '5 days', 100, 'active',
          v_owner, 'transferencia');

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type)
    values ('v109 free 2', now() + interval '5 days', 100, 'active',
            v_owner, 'transferencia');
  exception when others then v_bloqueo := true; end;

  perform pg_temp.anota('6 ' || case when v_bloqueo
    then 'OK       el Free no permite un segundo sorteo activo'
    else 'CRÍTICO  el Free creó dos activos' end);
end $$;

-- 7) Ledger
do $$
begin
  perform pg_temp.anota('7 ' || case when exists (
    select 1 from public._applied_migrations where version = '0109')
    then 'OK       ledger registra 0109'
    else 'CRÍTICO  falta la fila 0109' end);
end $$;

select current_setting('test.v109', true) as resultado;
rollback;

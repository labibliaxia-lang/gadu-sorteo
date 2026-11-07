-- =====================================================================
-- Verificador 0107 — planes dinámicos y blindaje
-- =====================================================================
-- 1 plan_configs con los 4 planes
-- 2 límite de sorteos activos leído de la tabla
-- 3 límite de números leído de la tabla
-- 4 MP bloqueado por plan y liberado al habilitarlo
-- 5 auto-draw y referidos bloqueados por plan
-- 6 moneda válida
-- 7 estado paused aceptado
-- 8 downgrade: Starter + sorteos excedidos pausados
-- 9 ledger
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v107', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v107',
    coalesce(current_setting('test.v107', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
begin
  select id into v_owner from public.profiles
   where role = 'admin' order by created_at limit 1;

  -- Si solo hay superadmins, los guards premium no aplican (is_superadmin
  -- los saltea): se usa igual para el resto de las pruebas, pero 4 y 5 avisan.
  if v_owner is null then
    select id into v_owner from public.profiles
     where role = 'superadmin' order by created_at limit 1;
  end if;

  if v_owner is null then
    perform pg_temp.anota('1 AVISO    hace falta un organizador');
    return;
  end if;

  perform set_config('test.v107.owner', v_owner::text, true);
  perform set_config('test.v107.ownerrole',
    (select role from public.profiles where id = v_owner), true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1) Config seed
do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.plan_configs;
  perform pg_temp.anota('1 ' || case when v_n = 4
    then 'OK       plan_configs tiene los 4 planes'
    else 'CRÍTICO  planes en la tabla: ' || v_n end);
end $$;

-- 2) Límite de activos dinámico
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
begin
  if v_owner is null then return; end if;

  update public.plan_configs set max_raffles = 7 where plan_name = 'premium';

  perform pg_temp.anota('2 ' || case when public.plan_max_active_raffles('premium') = 7
    then 'OK       el límite de activos sale de plan_configs'
    else 'CRÍTICO  el límite no es dinámico' end);
end $$;

-- 3) Límite de números dinámico
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_raffle uuid;
  v_error text;
begin
  if v_owner is null then return; end if;

  update public.profiles set plan = 'pro' where id = v_owner;
  update public.plan_configs set max_numbers = 500 where plan_name = 'pro';

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v107 numeros', now() + interval '5 days', 100, 'closed', v_owner)
  returning id into v_raffle;

  begin
    perform public.create_raffle_numbers(v_raffle, 600);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  declare
    v_error2 text;
  begin
    begin
      perform public.create_raffle_numbers(v_raffle, 400);
      v_error2 := null;
    exception when others then
      v_error2 := sqlerrm;
    end;

    perform pg_temp.anota('3 ' || case
      when v_error is not null and v_error2 is null
        then 'OK       números: 600 rechazado y 400 aceptado con el límite dinámico'
      else 'CRÍTICO 600=' || coalesce(v_error, 'ok') || ' 400=' || coalesce(v_error2, 'ok') end);
  end;
end $$;

-- 4) MP bloqueado por plan
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_raffle uuid;
  v_bloqueo boolean := false;
  v_luego boolean := false;
begin
  if v_owner is null then return; end if;

  update public.profiles set plan = 'organizador' where id = v_owner;
  update public.plan_configs set allow_mp = false where plan_name = 'organizador';

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type)
    values ('v107 mp', now() + interval '5 days', 100, 'closed', v_owner, 'mercadopago');
  exception when others then
    v_bloqueo := true;
  end;

  update public.plan_configs set allow_mp = true where plan_name = 'organizador';

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type)
    values ('v107 mp ok', now() + interval '5 days', 100, 'closed', v_owner, 'mercadopago')
    returning id into v_raffle;
    v_luego := v_raffle is not null;
  exception when others then
    v_luego := false;
  end;

  perform pg_temp.anota('4 ' || case when v_bloqueo and v_luego
    then 'OK       MP bloqueado sin flag y liberado al habilitarlo'
    else 'CRÍTICO  bloqueo=' || v_bloqueo || ' liberado=' || v_luego end);
end $$;

-- 5) Auto-draw y referidos
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_auto boolean := false;
  v_ref boolean := false;
begin
  if v_owner is null then return; end if;

  update public.profiles set plan = 'organizador' where id = v_owner;
  update public.plan_configs
     set allow_auto_draw = false, allow_referrals = false
   where plan_name = 'organizador';

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, auto_draw)
    values ('v107 auto', now() + interval '5 days', 100, 'closed', v_owner, true);
  exception when others then
    v_auto := true;
  end;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, referral_enabled)
    values ('v107 ref', now() + interval '5 days', 100, 'closed', v_owner, true);
  exception when others then
    v_ref := true;
  end;

  perform pg_temp.anota('5 ' || case when v_auto and v_ref
    then 'OK       auto-draw y referidos bloqueados por plan en la base'
    else 'CRÍTICO  auto=' || v_auto || ' referidos=' || v_ref end);
end $$;

-- 6) Moneda
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_mal boolean := false;
  v_ok boolean := false;
begin
  if v_owner is null then return; end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, currency)
    values ('v107 btc', now() + interval '5 days', 100, 'closed', v_owner, 'BTC');
  exception when others then
    v_mal := true;
  end;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, currency)
    values ('v107 mxn', now() + interval '5 days', 100, 'closed', v_owner, 'MXN');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;

  perform pg_temp.anota('6 ' || case when v_mal and v_ok
    then 'OK       moneda: BTC rechazado, MXN aceptado'
    else 'CRÍTICO  mal=' || v_mal || ' ok=' || v_ok end);
end $$;

-- 7) Estado paused
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_raffle uuid;
begin
  if v_owner is null then return; end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by)
    values ('v107 pausa', now() + interval '5 days', 100, 'paused', v_owner)
    returning id into v_raffle;
    perform pg_temp.anota('7 ' || case when v_raffle is not null
      then 'OK       el estado paused se acepta'
      else 'CRÍTICO  paused no se insertó' end);
  exception when others then
    perform pg_temp.anota('7 CRÍTICO  paused rechazado: ' || sqlerrm);
  end;
end $$;

-- 8) Downgrade con pausa
do $$
declare
  v_owner uuid := nullif(current_setting('test.v107.owner', true), '')::uuid;
  v_pausados int;
  v_activos int;
  v_limite int;
  v_plan text;
begin
  if v_owner is null then return; end if;

  update public.plan_configs set max_raffles = 3 where plan_name = 'premium';
  update public.profiles set plan = 'premium',
         plan_expires_at = now() - interval '4 days'
   where id = v_owner;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  select 'v107 downgrade ' || n, now() + interval '5 days', 100, 'active', v_owner
    from generate_series(1, 3) n;

  perform public.expire_plans();

  select plan into v_plan from public.profiles where id = v_owner;
  v_limite := public.plan_max_active_raffles('organizador');

  -- Se cuenta solo lo que creó esta prueba: la base real puede tener sorteos
  -- activos del mismo usuario y descolocar el conteo global.
  select count(*) into v_pausados from public.raffles
   where created_by = v_owner and status = 'paused'
     and title like 'v107 downgrade %';
  select count(*) into v_activos from public.raffles
   where created_by = v_owner and status = 'active';

  perform pg_temp.anota('8 ' || case
    when v_plan = 'organizador' and v_pausados >= 1 and v_activos <= v_limite
      then 'OK       downgrade a Starter; excedentes pausados y activos <= ' || v_limite
    else 'CRÍTICO  plan=' || coalesce(v_plan, 'null')
         || ' pausados_nuevos=' || v_pausados
         || ' activos=' || v_activos || ' limite=' || v_limite end);
end $$;

-- 9) Ledger
do $$
begin
  perform pg_temp.anota('9 ' || case when exists (
    select 1 from public._applied_migrations where version = '0107')
    then 'OK       ledger registra 0107'
    else 'CRÍTICO  falta la fila 0107' end);
end $$;

select current_setting('test.v107', true) as resultado;

rollback;

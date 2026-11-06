-- =====================================================================
-- Verificador 0104 — origen del número (venta / premio)
-- =====================================================================
-- 1 columna origin, default 'venta' y check
-- 2 reward_referral marca origin='premio'
-- 3 el número de venta normal sigue en 'venta'
-- 4 raffle_prize_numbers devuelve el premio al organizador
-- 5 raffle_prize_numbers rechaza a un tercero
-- 6 ledger 0104
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v104', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v104',
    coalesce(current_setting('test.v104', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
  v_ref uuid;
  v_inv uuid;
  v_otro uuid;
  v_raffle uuid;
  v_rel uuid;
  v_num int;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin') order by created_at limit 1;
  select id into v_ref from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;
  select id into v_inv from public.profiles
   where id not in (
     coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;
  select id into v_otro from public.profiles
   where id not in (
     coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_inv, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  if v_owner is null or v_ref is null or v_inv is null then
    perform pg_temp.anota('1 AVISO    hacen falta tres cuentas');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers)
  values ('v104 premio', now() + interval '3 days', 100, 'active', v_owner, true, 1)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 3) n;

  update public.raffle_numbers
     set status = 'sold', sold_to = v_inv, sold_at = now()
   where raffle_id = v_raffle and number = 1;

  insert into public.referrals (referrer_id, referred_id)
  values (v_ref, v_inv)
  returning id into v_rel;

  v_num := public.reward_referral(v_rel, v_raffle);

  perform set_config('test.v104.owner', v_owner::text, true);
  perform set_config('test.v104.otro', coalesce(v_otro::text, ''), true);
  perform set_config('test.v104.raffle', v_raffle::text, true);
  perform set_config('test.v104.num', coalesce(v_num::text, ''), true);
end $$;

-- 1) Columna y check
do $$
declare
  v_col record;
  v_rechazo boolean := false;
  v_raffle uuid := nullif(current_setting('test.v104.raffle', true), '')::uuid;
begin
  select column_default, is_nullable into v_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'raffle_numbers'
     and column_name = 'origin';

  if v_raffle is not null then
    begin
      update public.raffle_numbers set origin = 'inventado'
       where raffle_id = v_raffle and number = 2;
    exception when others then
      v_rechazo := true;
    end;
  end if;

  perform pg_temp.anota('1 ' || case
    when v_col.column_default is not null and v_col.column_default like '%venta%' and v_rechazo
      then 'OK       origin existe, default venta y el check rechaza valores raros'
    when v_col.column_default is null or v_col.is_nullable is null
      then 'CRÍTICO  falta la columna origin'
    else 'CRÍTICO  el check acepto un origen invalido' end);
end $$;

-- 2) El premio queda como premio
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v104.raffle', true), '')::uuid;
  v_num int := nullif(current_setting('test.v104.num', true), '')::int;
  v_origen text;
begin
  if v_raffle is null or v_num is null then
    perform pg_temp.anota('2 CRÍTICO  no se otorgo el premio');
    return;
  end if;

  select origin into v_origen from public.raffle_numbers
   where raffle_id = v_raffle and number = v_num;

  perform pg_temp.anota('2 ' || case when v_origen = 'premio'
    then 'OK       el número ' || v_num || ' quedo con origin = premio'
    else 'CRÍTICO  origin = ' || coalesce(v_origen, 'null') end);
end $$;

-- 3) La venta normal sigue como venta
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v104.raffle', true), '')::uuid;
  v_origen text;
begin
  if v_raffle is null then return; end if;

  select origin into v_origen from public.raffle_numbers
   where raffle_id = v_raffle and number = 1;

  perform pg_temp.anota('3 ' || case when v_origen = 'venta'
    then 'OK       la venta normal sigue en origin = venta'
    else 'CRÍTICO  origin = ' || coalesce(v_origen, 'null') end);
end $$;

-- 4) El organizador ve sus premios
do $$
declare
  v_owner uuid := nullif(current_setting('test.v104.owner', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v104.raffle', true), '')::uuid;
  v_num int := nullif(current_setting('test.v104.num', true), '')::int;
  v_total int;
begin
  if v_raffle is null or v_num is null then return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_total
    from public.raffle_prize_numbers(v_raffle) p
   where v_num = any (p.numbers);

  reset role;

  perform pg_temp.anota('4 ' || case when v_total = 1
    then 'OK       raffle_prize_numbers devuelve el premio al organizador'
    else 'CRÍTICO  no devolvio el premio' end);
end $$;

-- 5) Un tercero no puede consultarlo
do $$
declare
  v_otro uuid := nullif(current_setting('test.v104.otro', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v104.raffle', true), '')::uuid;
  v_error text;
begin
  if v_raffle is null or v_otro is null then
    perform pg_temp.anota('5 AVISO    no hay tercera cuenta');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform count(*) from public.raffle_prize_numbers(v_raffle);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  reset role;

  perform pg_temp.anota('5 ' || case when v_error is not null
    then 'OK       el tercero recibe: ' || v_error
    else 'CRÍTICO  un tercero pudo leer los premios' end);
end $$;

-- 6) Ledger
do $$
declare
  v_ok boolean;
begin
  select exists (select 1 from public._applied_migrations where version = '0104')
    into v_ok;

  perform pg_temp.anota('6 ' || case when v_ok
    then 'OK       ledger registra 0104'
    else 'CRÍTICO  falta la fila 0104' end);
end $$;

select current_setting('test.v104', true) as resultado;

rollback;

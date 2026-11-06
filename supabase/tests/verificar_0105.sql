-- =====================================================================
-- Verificador 0105 — sorteo exclusivo para premios de referidos
-- =====================================================================
-- 1 columna bonus_raffle_id y check (no puede apuntarse a sí mismo)
-- 2 el premio se entrega en el sorteo exclusivo, con origin = premio
-- 3 el sorteo principal no se toca
-- 4 trazabilidad: rewarded_via_raffle_id = principal
-- 5 aviso al referente enlazado al sorteo exclusivo
-- 6 sin números en el exclusivo: no entrega
-- 7 el exclusivo debe ser del mismo organizador
-- 8 ledger 0105
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v105', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v105',
    coalesce(current_setting('test.v105', true), '') || p_linea || E'\n', true);
end $$;

-- Obtiene o crea el vínculo; la unique de la 0103 impide insertarlo dos veces.
create or replace function pg_temp.vinculo(p_ref uuid, p_inv uuid)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.referrals (referrer_id, referred_id)
  values (p_ref, p_inv)
  on conflict (referrer_id, referred_id) do nothing;

  select id into v_id
    from public.referrals
   where referrer_id = p_ref and referred_id = p_inv;

  return v_id;
end $$;

do $$
declare
  v_owner uuid;
  v_ref uuid;
  v_inv uuid;
  v_inv2 uuid;
  v_inv3 uuid;
  v_otro uuid;
  v_main uuid;
  v_bonus uuid;
  v_main2 uuid;
  v_bonus2 uuid;
  v_main3 uuid;
  v_ajeno uuid;
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

  -- Pares distintos para los escenarios 6 y 7: si reutilizara el mismo
  -- vínculo, ya estaría premiado y devolvería null por el motivo equivocado.
  select id into v_inv2 from public.profiles
   where id not in (
     coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_inv, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  select id into v_inv3 from public.profiles
   where id not in (
     coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_inv, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_inv2, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;
  select id into v_otro from public.profiles
   where role in ('admin', 'superadmin')
     and id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  if v_owner is null or v_ref is null or v_inv is null then
    perform pg_temp.anota('1 AVISO    hacen falta tres cuentas');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v105 bonus', now() + interval '5 days', 100, 'active', v_owner)
  returning id into v_bonus;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_bonus, n, 'available' from generate_series(1, 3) n;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers, bonus_raffle_id)
  values ('v105 principal', now() + interval '5 days', 100, 'active', v_owner, true, 1, v_bonus)
  returning id into v_main;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_main, n, 'available' from generate_series(1, 3) n;

  update public.raffle_numbers
     set status='sold', sold_to=v_inv, sold_at=now()
   where raffle_id = v_main and number = 1;

  v_rel := pg_temp.vinculo(v_ref, v_inv);

  -- Si el par ya existía de una prueba real y estaba premiado, se reinicia
  -- dentro de la transacción para probar el camino feliz. El ROLLBACK lo deja
  -- como estaba.
  update public.referrals
     set rewarded = false,
         rewarded_raffle_id = null,
         rewarded_number = null,
         rewarded_via_raffle_id = null
   where id = v_rel;

  v_num := public.reward_referral(v_rel, v_main);

  -- Escenario sin números en el exclusivo
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v105 bonus vacio', now() + interval '5 days', 100, 'active', v_owner)
  returning id into v_bonus2;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers, bonus_raffle_id)
  values ('v105 principal 2', now() + interval '5 days', 100, 'active', v_owner, true, 1, v_bonus2)
  returning id into v_main2;

  insert into public.raffle_numbers (raffle_id, number, status)
  values (v_main2, 1, 'available');

  update public.raffle_numbers
     set status='sold', sold_to=v_inv2, sold_at=now()
   where raffle_id = v_main2 and number = 1;

  -- Escenario con exclusivo ajeno
  if v_otro is not null then
    insert into public.raffles (title, draw_date, price_per_number, status, created_by)
    values ('v105 ajeno', now() + interval '5 days', 100, 'active', v_otro)
    returning id into v_ajeno;

    insert into public.raffle_numbers (raffle_id, number, status)
    values (v_ajeno, 1, 'available');

    insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                                referral_enabled, referral_min_numbers, bonus_raffle_id)
    values ('v105 principal 3', now() + interval '5 days', 100, 'active', v_owner, true, 1, v_ajeno)
    returning id into v_main3;

    insert into public.raffle_numbers (raffle_id, number, status)
    values (v_main3, 1, 'available');

    update public.raffle_numbers
       set status='sold', sold_to=v_inv3, sold_at=now()
     where raffle_id = v_main3 and number = 1;
  end if;

  perform set_config('test.v105.owner', v_owner::text, true);
  perform set_config('test.v105.ref', v_ref::text, true);
  perform set_config('test.v105.inv', v_inv::text, true);
  perform set_config('test.v105.inv2', coalesce(v_inv2::text, ''), true);
  perform set_config('test.v105.inv3', coalesce(v_inv3::text, ''), true);
  perform set_config('test.v105.main', v_main::text, true);
  perform set_config('test.v105.bonus', v_bonus::text, true);
  perform set_config('test.v105.main2', v_main2::text, true);
  perform set_config('test.v105.main3', coalesce(v_main3::text, ''), true);
  perform set_config('test.v105.num', coalesce(v_num::text, ''), true);
end $$;

-- 1) Columna y check
do $$
declare
  v_col boolean;
  v_rechazo boolean := false;
begin
  select exists (
    select 1 from pg_attribute
     where attrelid = 'public.raffles'::regclass
       and attname = 'bonus_raffle_id' and not attisdropped
  ) into v_col;

  declare
    v_main uuid := nullif(current_setting('test.v105.main', true), '')::uuid;
  begin
    if v_main is not null then
      begin
        update public.raffles set bonus_raffle_id = v_main where id = v_main;
      exception when others then
        v_rechazo := true;
      end;
    end if;
  end;

  perform pg_temp.anota('1 ' || case when v_col and v_rechazo
    then 'OK       columna presente y el check rechaza apuntarse a si mismo'
    when not v_col then 'CRÍTICO  falta bonus_raffle_id'
    else 'CRÍTICO  el check acepto bonus_raffle_id = id' end);
end $$;

-- 2) El premio va al exclusivo
do $$
declare
  v_bonus uuid := nullif(current_setting('test.v105.bonus', true), '')::uuid;
  v_num int := nullif(current_setting('test.v105.num', true), '')::int;
  v_origen text;
  v_dueno uuid;
begin
  if v_bonus is null then return; end if;

  if v_num is null then
    perform pg_temp.anota('2 CRÍTICO  no se otorgo el premio');
    return;
  end if;

  select origin, sold_to into v_origen, v_dueno
    from public.raffle_numbers
   where raffle_id = v_bonus and number = v_num;

  perform pg_temp.anota('2 ' || case
    when v_origen = 'premio'
         and v_dueno = nullif(current_setting('test.v105.ref', true), '')::uuid
      then 'OK       el número ' || v_num || ' se entrego en el exclusivo como premio'
    else 'CRÍTICO  origen=' || coalesce(v_origen,'null') end);
end $$;

-- 3) El principal no se toca
do $$
declare
  v_main uuid := nullif(current_setting('test.v105.main', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v105.inv', true), '')::uuid;
  v_premios int;
begin
  if v_main is null then return; end if;

  select count(*) into v_premios
    from public.raffle_numbers
   where raffle_id = v_main and origin = 'premio';

  perform pg_temp.anota('3 ' || case when v_premios = 0
    then 'OK       el sorteo principal no recibio numeros premio'
    else 'CRÍTICO  el principal tiene ' || v_premios || ' premios' end);
end $$;

-- 4) Trazabilidad del origen
do $$
declare
  v_main uuid := nullif(current_setting('test.v105.main', true), '')::uuid;
  v_bonus uuid := nullif(current_setting('test.v105.bonus', true), '')::uuid;
  v_ref uuid := nullif(current_setting('test.v105.ref', true), '')::uuid;
  v_via uuid;
  v_destino uuid;
begin
  if v_main is null or v_bonus is null then return; end if;

  select rewarded_via_raffle_id, rewarded_raffle_id into v_via, v_destino
    from public.referrals
   where referrer_id = v_ref
     and referred_id = nullif(current_setting('test.v105.inv', true), '')::uuid;

  perform pg_temp.anota('4 ' || case
    when v_via = v_main and v_destino = v_bonus
      then 'OK       via = principal y destino = exclusivo'
    else 'CRÍTICO  via=' || coalesce(v_via::text,'null')
         || ' destino=' || coalesce(v_destino::text,'null') end);
end $$;

-- 5) Aviso enlazado al exclusivo
do $$
declare
  v_ref uuid := nullif(current_setting('test.v105.ref', true), '')::uuid;
  v_bonus uuid := nullif(current_setting('test.v105.bonus', true), '')::uuid;
  v_total int;
begin
  if v_bonus is null then return; end if;

  select count(*) into v_total from public.notifications
   where user_id = v_ref
     and type = 'buyer_referral_reward'
     and raffle_id = v_bonus;

  perform pg_temp.anota('5 ' || case when v_total = 1
    then 'OK       el aviso apunta al sorteo exclusivo'
    else 'CRÍTICO  avisos en el exclusivo: ' || v_total end);
end $$;

-- 6) Sin números en el exclusivo
do $$
declare
  v_ref uuid := nullif(current_setting('test.v105.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v105.inv2', true), '')::uuid;
  v_main2 uuid := nullif(current_setting('test.v105.main2', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_main2 is null or v_inv is null then
    perform pg_temp.anota('6 AVISO    hacen falta cuatro cuentas');
    return;
  end if;

  v_rel := pg_temp.vinculo(v_ref, v_inv);

  update public.referrals
     set rewarded = false, rewarded_raffle_id = null,
         rewarded_number = null, rewarded_via_raffle_id = null
   where id = v_rel;

  v_num := public.reward_referral(v_rel, v_main2);

  perform pg_temp.anota('6 ' || case when v_num is null
    then 'OK       sin numeros en el exclusivo no entrega nada'
    else 'CRÍTICO  entrego ' || v_num end);
end $$;

-- 7) Exclusivo de otro organizador
do $$
declare
  v_ref uuid := nullif(current_setting('test.v105.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v105.inv3', true), '')::uuid;
  v_main3 uuid := nullif(current_setting('test.v105.main3', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_main3 is null or v_inv is null then
    perform pg_temp.anota('7 AVISO    no hay un segundo organizador para probar');
    return;
  end if;

  v_rel := pg_temp.vinculo(v_ref, v_inv);

  update public.referrals
     set rewarded = false, rewarded_raffle_id = null,
         rewarded_number = null, rewarded_via_raffle_id = null
   where id = v_rel;

  v_num := public.reward_referral(v_rel, v_main3);

  perform pg_temp.anota('7 ' || case when v_num is null
    then 'OK       un exclusivo ajeno no entrega nada'
    else 'CRÍTICO  entrego en un sorteo de otro' end);
end $$;

-- 8) Ledger
do $$
declare
  v_ok boolean;
begin
  select exists (select 1 from public._applied_migrations where version = '0105')
    into v_ok;

  perform pg_temp.anota('8 ' || case when v_ok
    then 'OK       ledger registra 0105'
    else 'CRÍTICO  falta la fila 0105' end);
end $$;

select current_setting('test.v105', true) as resultado;

rollback;

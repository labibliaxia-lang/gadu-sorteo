-- =====================================================================
-- Verificador 0102 — "Invitá y ganá" por sorteo
-- =====================================================================
-- 1 columnas y check de reglas
-- 2 sorteo deshabilitado: no premia
-- 3 mínimo del invitado no alcanzado: no premia
-- 4 mínimo alcanzado: premia, marca y avisa
-- 5 idempotencia: no premia dos veces el mismo vínculo
-- 6 tope por referente
-- 7 sin números disponibles: no premia
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v102', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v102',
    coalesce(current_setting('test.v102', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
  v_ref uuid;
  v_inv1 uuid;
  v_inv2 uuid;
  v_inv3 uuid;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin') order by created_at limit 1;

  select id into v_ref from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  select id into v_inv1 from public.profiles
   where id not in (coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  select id into v_inv2 from public.profiles
   where id not in (coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_inv1, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  select id into v_inv3 from public.profiles
   where id not in (coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_inv1, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(v_inv2, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  if v_owner is null or v_ref is null or v_inv1 is null then
    perform pg_temp.anota('1 AVISO    hacen falta al menos tres cuentas');
    return;
  end if;

  perform set_config('test.v102.owner', v_owner::text, true);
  perform set_config('test.v102.ref', v_ref::text, true);
  perform set_config('test.v102.inv1', v_inv1::text, true);
  perform set_config('test.v102.inv2', coalesce(v_inv2::text, ''), true);
  perform set_config('test.v102.inv3', coalesce(v_inv3::text, ''), true);
end $$;

-- 1) Columnas y check
do $$
declare
  v_faltan text;
  v_rechazo boolean := false;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['referral_enabled','referral_min_numbers','referral_require_buyer_min','referral_max_per_user']) as c
   where not exists (
     select 1 from pg_attribute
      where attrelid = 'public.raffles'::regclass and attname = c and not attisdropped
   );

  begin
    insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                                referral_min_numbers)
    values ('v102 invalido', now() + interval '3 days', 100, 'active',
            nullif(current_setting('test.v102.owner', true), '')::uuid, 0);
  exception when others then
    v_rechazo := true;
  end;

  perform pg_temp.anota('1 ' || case
    when v_faltan is null and v_rechazo
      then 'OK       columnas presentes y el check rechaza minimo 0'
    when v_faltan is not null
      then 'CRÍTICO  faltan columnas: ' || v_faltan
    else 'CRÍTICO  el check acepto referral_min_numbers = 0' end);
end $$;

-- Escenario base: un sorteo habilitado por cada caso.
do $$
declare
  v_owner uuid := nullif(current_setting('test.v102.owner', true), '')::uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid; v_r4 uuid; v_r5 uuid;
begin
  if v_owner is null then return; end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers, referral_max_per_user)
  values ('v102 habilitado', now() + interval '3 days', 100, 'active', v_owner, true, 2, 0)
  returning id into v_r1;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled)
  values ('v102 deshabilitado', now() + interval '3 days', 100, 'active', v_owner, false)
  returning id into v_r2;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers)
  values ('v102 minimo 3', now() + interval '3 days', 100, 'active', v_owner, true, 3)
  returning id into v_r3;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers, referral_max_per_user)
  values ('v102 tope 1', now() + interval '3 days', 100, 'active', v_owner, true, 1, 1)
  returning id into v_r4;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by,
                              referral_enabled, referral_min_numbers)
  values ('v102 sin numeros', now() + interval '3 days', 100, 'active', v_owner, true, 1)
  returning id into v_r5;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_r1, n, 'available' from generate_series(1, 3) n;
  insert into public.raffle_numbers (raffle_id, number, status)
  select v_r2, n, 'available' from generate_series(1, 3) n;
  insert into public.raffle_numbers (raffle_id, number, status)
  select v_r3, n, 'available' from generate_series(1, 3) n;
  insert into public.raffle_numbers (raffle_id, number, status)
  select v_r4, n, 'available' from generate_series(1, 2) n;
  insert into public.raffle_numbers (raffle_id, number, status)
  select v_r5, n, 'sold' from generate_series(1, 2) n;

  perform set_config('test.v102.r1', v_r1::text, true);
  perform set_config('test.v102.r2', v_r2::text, true);
  perform set_config('test.v102.r3', v_r3::text, true);
  perform set_config('test.v102.r4', v_r4::text, true);
  perform set_config('test.v102.r5', v_r5::text, true);
end $$;

-- 2) Deshabilitado: no premia
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v102.inv1', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r2', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_r is null or v_inv is null then return; end if;

  update public.raffle_numbers set status='sold', sold_to=v_inv, sold_at=now()
   where raffle_id = v_r and number in (1, 2);

  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_inv)
  returning id into v_rel;

  v_num := public.reward_referral(v_rel, v_r);

  perform pg_temp.anota('2 ' || case when v_num is null
    then 'OK       sorteo deshabilitado: no entrega numero'
    else 'CRÍTICO  entrego el numero ' || v_num end);
end $$;

-- 3) Mínimo del invitado no alcanzado
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v102.inv1', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r3', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_r is null or v_inv is null then return; end if;

  update public.raffle_numbers set status='sold', sold_to=v_inv, sold_at=now()
   where raffle_id = v_r and number in (1, 2);

  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_inv)
  returning id into v_rel;

  v_num := public.reward_referral(v_rel, v_r);

  perform pg_temp.anota('3 ' || case when v_num is null
    then 'OK       con 2 comprados y minimo 3: no entrega'
    else 'CRÍTICO  entrego pese al minimo' end);
end $$;

-- 4) Caso feliz: mínimo alcanzado
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v102.inv1', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r1', true), '')::uuid;
  v_rel uuid;
  v_num int;
  v_dueno uuid;
  v_aviso int;
begin
  if v_r is null or v_inv is null then return; end if;

  update public.raffle_numbers set status='sold', sold_to=v_inv, sold_at=now()
   where raffle_id = v_r and number in (1, 2);

  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_inv)
  returning id into v_rel;

  v_num := public.reward_referral(v_rel, v_r);

  select sold_to into v_dueno from public.raffle_numbers
   where raffle_id = v_r and number = v_num;

  select count(*) into v_aviso from public.notifications
   where user_id = v_ref and type = 'buyer_referral_reward' and raffle_id = v_r;

  perform pg_temp.anota('4 ' || case
    when v_num is not null and v_dueno = v_ref and v_aviso = 1
      then 'OK       premia, el numero queda del referente y avisa por campana'
    else 'CRÍTICO  num=' || coalesce(v_num::text,'null')
         || ' dueno=' || coalesce(v_dueno::text,'null')
         || ' avisos=' || v_aviso end);
end $$;

-- 5) Idempotencia
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v102.inv1', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r1', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_r is null then return; end if;

  select id into v_rel from public.referrals
   where referrer_id = v_ref and referred_id = v_inv;

  v_num := public.reward_referral(v_rel, v_r);

  perform pg_temp.anota('5 ' || case when v_num is null
    then 'OK       el mismo vinculo no premia dos veces'
    else 'CRÍTICO  premio duplicado: ' || v_num end);
end $$;

-- 6) Tope por referente
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_a uuid := nullif(current_setting('test.v102.inv2', true), '')::uuid;
  v_b uuid := nullif(current_setting('test.v102.inv3', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r4', true), '')::uuid;
  v_rel_a uuid; v_rel_b uuid;
  v_uno int; v_dos int;
begin
  if v_r is null or v_a is null or v_b is null then
    perform pg_temp.anota('6 AVISO    hacen falta cuatro cuentas para el tope');
    return;
  end if;

  update public.raffle_numbers set status='sold', sold_to=v_a, sold_at=now()
   where raffle_id = v_r and number = 1;
  update public.raffle_numbers set status='sold', sold_to=v_b, sold_at=now()
   where raffle_id = v_r and number = 2;

  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_a) returning id into v_rel_a;
  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_b) returning id into v_rel_b;

  v_uno := public.reward_referral(v_rel_a, v_r);
  v_dos := public.reward_referral(v_rel_b, v_r);

  perform pg_temp.anota('6 ' || case when v_uno is not null and v_dos is null
    then 'OK       el tope de 1 frena el segundo premio'
    else 'CRÍTICO  primero=' || coalesce(v_uno::text,'null')
         || ' segundo=' || coalesce(v_dos::text,'null') end);
end $$;

-- 7) Sin números disponibles
do $$
declare
  v_ref uuid := nullif(current_setting('test.v102.ref', true), '')::uuid;
  v_inv uuid := nullif(current_setting('test.v102.inv3', true), '')::uuid;
  v_r uuid := nullif(current_setting('test.v102.r5', true), '')::uuid;
  v_rel uuid;
  v_num int;
begin
  if v_r is null or v_inv is null then return; end if;

  insert into public.referrals (referrer_id, referred_id) values (v_ref, v_inv)
  returning id into v_rel;

  v_num := public.reward_referral(v_rel, v_r);

  perform pg_temp.anota('7 ' || case when v_num is null
    then 'OK       sin disponibles no entrega nada'
    else 'CRÍTICO  entrego un numero inexistente' end);
end $$;

select current_setting('test.v102', true) as resultado;

rollback;

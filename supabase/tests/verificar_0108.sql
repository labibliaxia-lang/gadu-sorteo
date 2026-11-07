-- =====================================================================
-- Verificador 0108 — estructura comercial final
-- =====================================================================
-- 1 límites finales de los 4 planes
-- 2 Social sin Mercado Pago
-- 3 USD aceptado y BTC rechazado
-- 4 tope de referidos por sorteo (Pro)
-- 5 el Plan Social no se autoasigna
-- 6 ledger
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v108', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v108',
    coalesce(current_setting('test.v108', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
begin
  select id into v_owner from public.profiles
   where role = 'admin' order by created_at limit 1;
  if v_owner is null then
    select id into v_owner from public.profiles
     where role = 'superadmin' order by created_at limit 1;
  end if;
  perform set_config('test.v108.owner', coalesce(v_owner::text, ''), true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 1) Límites finales
do $$
declare
  v_ok boolean;
begin
  select bool_and(ok) into v_ok from (
    select (max_numbers = 300 and max_raffles = 2 and not allow_referrals
            and not allow_landing) as ok
      from public.plan_configs where plan_name = 'organizador'
    union all
    select (max_numbers = 1000 and max_raffles = 6 and allow_referrals
            and allow_landing and max_referrals_per_raffle = 10)
      from public.plan_configs where plan_name = 'pro'
    union all
    select (max_numbers = 10000 and max_raffles = 20 and allow_referrals
            and allow_auto_draw and max_referrals_per_raffle = 0)
      from public.plan_configs where plan_name = 'premium'
    union all
    select (max_numbers = 10000 and max_raffles = 20 and not allow_mp)
      from public.plan_configs where plan_name = 'social'
  ) filas;

  perform pg_temp.anota('1 ' || case when v_ok
    then 'OK       Starter/Pro/Premium/Social con los límites finales'
    else 'CRÍTICO  algún plan no coincide con la spec' end);
end $$;

-- 2) Social sin MP
do $$
begin
  perform pg_temp.anota('2 ' || case when exists (
    select 1 from public.plan_configs
     where plan_name = 'social' and allow_mp = false and allow_referrals = true)
    then 'OK       Social: beneficios premium sin Mercado Pago'
    else 'CRÍTICO  Social tiene MP o no tiene referidos' end);
end $$;

-- 3) Monedas
do $$
declare
  v_owner uuid := nullif(current_setting('test.v108.owner', true), '')::uuid;
  v_ok boolean := false;
  v_mal boolean := false;
begin
  if v_owner is null then return; end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type, currency)
    values ('v108 usd', now() + interval '5 days', 100, 'closed',
            v_owner, 'transferencia', 'USD');
    v_ok := true;
  exception when others then v_ok := false; end;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type, currency)
    values ('v108 btc', now() + interval '5 days', 100, 'closed',
            v_owner, 'transferencia', 'BTC');
  exception when others then v_mal := true; end;

  perform pg_temp.anota('3 ' || case when v_ok and v_mal
    then 'OK       USD aceptado y BTC rechazado'
    else 'CRÍTICO  usd=' || v_ok || ' btc_rechazado=' || v_mal end);
end $$;

-- 4) Tope de referidos (Pro = 10; se baja a 1 para probar)
do $$
declare
  v_owner uuid := nullif(current_setting('test.v108.owner', true), '')::uuid;
  v_ref uuid;
  v_inv1 uuid;
  v_inv2 uuid;
  v_raffle uuid;
  v_rel1 uuid;
  v_rel2 uuid;
  v_error text := null;
begin
  if v_owner is null then return; end if;

  update public.plan_configs set max_referrals_per_raffle = 1 where plan_name = 'pro';
  update public.profiles set plan = 'pro' where id = v_owner;

  insert into public.raffles (title, draw_date, price_per_number, status,
                              created_by, payment_type, referral_enabled, referral_min_numbers)
  values ('v108 referidos', now() + interval '5 days', 100, 'closed',
          v_owner, 'transferencia', true, 1)
  returning id into v_raffle;

  select id into v_ref from public.profiles where id <> v_owner order by created_at limit 1;
  select id into v_inv1 from public.profiles
   where id not in (v_owner, coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;
  select id into v_inv2 from public.profiles
   where id not in (v_owner, coalesce(v_ref, '00000000-0000-0000-0000-000000000000'::uuid),
                    coalesce(v_inv1, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  if v_ref is null or v_inv1 is null or v_inv2 is null then
    perform pg_temp.anota('4 AVISO    hacen falta cuatro cuentas para el tope');
    return;
  end if;

  insert into public.referrals (referrer_id, referred_id)
  values (v_ref, v_inv1) returning id into v_rel1;
  update public.referrals
     set rewarded = true, rewarded_raffle_id = v_raffle,
         rewarded_via_raffle_id = v_raffle, rewarded_number = 1
   where id = v_rel1;

  insert into public.referrals (referrer_id, referred_id)
  values (v_ref, v_inv2) returning id into v_rel2;

  begin
    update public.referrals
       set rewarded = true, rewarded_raffle_id = v_raffle,
           rewarded_via_raffle_id = v_raffle, rewarded_number = 2
     where id = v_rel2;
  exception when others then v_error := sqlerrm; end;

  perform pg_temp.anota('4 ' || case when v_error is not null
    then 'OK       el tope de 1 referido cortó el segundo premio'
    else 'CRÍTICO  el tope no cortó' end);
end $$;

-- 5) Social no se autoasigna
do $$
declare
  v_owner uuid := nullif(current_setting('test.v108.owner', true), '')::uuid;
  v_error text := null;
begin
  if v_owner is null then return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    update public.profiles set plan = 'social' where id = v_owner;
  exception when others then v_error := sqlerrm; end;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.anota('5 ' || case when v_error is not null
    then 'OK       un usuario no puede autoasignarse el Plan Social: ' || v_error
    else 'CRÍTICO  se autoasignó el Plan Social' end);
end $$;

-- 6) Ledger
do $$
begin
  perform pg_temp.anota('6 ' || case when exists (
    select 1 from public._applied_migrations where version = '0108')
    then 'OK       ledger registra 0108'
    else 'CRÍTICO  falta la fila 0108' end);
end $$;

select current_setting('test.v108', true) as resultado;
rollback;

-- =====================================================================
-- Verificador 0103 — reparación de `referrals`
-- =====================================================================
-- 1 unique (referrer_id, referred_id) presente
-- 2 el mismo par no se puede insertar dos veces (23505)
-- 3 no quedan pares duplicados en los datos
-- 4 rewarded existe con default false
-- 5 raffle_id acepta null (la app no lo envía)
-- 6 reward_referral sigue apuntando a rewarded
-- 7 ledger 0103
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v103', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v103',
    coalesce(current_setting('test.v103', true), '') || p_linea || E'\n', true);
end $$;

-- 1) Unique presente
do $$
begin
  perform pg_temp.anota('1 ' || case when exists (
    select 1 from pg_constraint
     where conrelid = 'public.referrals'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(referrer_id, referred_id)%')
    then 'OK       existe unique (referrer_id, referred_id)'
    else 'CRÍTICO  falta el unique: se pueden duplicar premios' end);
end $$;

-- 2) El duplicado es rechazado
do $$
declare
  v_a uuid;
  v_b uuid;
  v_rechazo boolean := false;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles
   where id <> coalesce(v_a, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  if v_a is null or v_b is null then
    perform pg_temp.anota('2 AVISO    hacen falta dos cuentas');
    return;
  end if;

  insert into public.referrals (referrer_id, referred_id) values (v_a, v_b);

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_a, v_b);
  exception when unique_violation then
    v_rechazo := true;
  end;

  perform pg_temp.anota('2 ' || case when v_rechazo
    then 'OK       el segundo insert del mismo par da 23505'
    else 'CRÍTICO  acepto un par duplicado' end);
end $$;

-- 3) Sin duplicados en los datos
do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select 1 from public.referrals
     group by referrer_id, referred_id
    having count(*) > 1
  ) d;

  perform pg_temp.anota('3 ' || case when v_dupes = 0
    then 'OK       no quedan pares duplicados'
    else 'CRÍTICO  quedan ' || v_dupes || ' pares duplicados' end);
end $$;

-- 4) rewarded con default false
do $$
declare
  v_col record;
begin
  select column_default, is_nullable into v_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'referrals'
     and column_name = 'rewarded';

  perform pg_temp.anota('4 ' || case
    when v_col.column_default is not null and v_col.column_default like '%false%'
      then 'OK       rewarded existe y arranca en false'
    when v_col.column_default is null
      then 'CRÍTICO  rewarded no tiene default'
    else 'CRÍTICO  rewarded no existe' end);
end $$;

-- 5) raffle_id nullable
do $$
declare
  v_nullable text;
begin
  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'referrals'
     and column_name = 'raffle_id';

  perform pg_temp.anota('5 ' || case
    when v_nullable is null then 'OK       referrals no tiene raffle_id (nada que ajustar)'
    when v_nullable = 'YES' then 'OK       raffle_id acepta null'
    else 'CRÍTICO  raffle_id es NOT NULL: el insert de la app fallaría' end);
end $$;

-- 6) La función sigue usando rewarded
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.reward_referral(uuid,uuid)'::regprocedure)
    into v_def;

  perform pg_temp.anota('6 ' || case
    when v_def ilike '%rewarded%' and v_def ilike '%referral_enabled%'
      then 'OK       reward_referral aplica reglas y usa rewarded'
    else 'CRÍTICO  la función no es la de 0102' end);
end $$;

-- 7) Ledger
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from public._applied_migrations where version = '0103'
  ) into v_ok;

  perform pg_temp.anota('7 ' || case when v_ok
    then 'OK       ledger registra 0103'
    else 'CRÍTICO  falta la fila 0103 en el ledger' end);
end $$;

select current_setting('test.v103', true) as resultado;

rollback;

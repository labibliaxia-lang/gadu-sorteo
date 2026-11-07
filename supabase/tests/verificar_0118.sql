-- =====================================================================
-- Verificador 0118 — referidos: permisos de captura y sorteo bonus
-- =====================================================================
-- 1  permisos INSERT/SELECT para authenticated
-- 2  políticas de INSERT y SELECT propias
-- 3  unique (referrer_id, referred_id)
-- 4  INSERT válido permitido (rol authenticated)
-- 5  auto-referido bloqueado
-- 6  vínculo a nombre de otro bloqueado
-- 7  referente inexistente bloqueado
-- 8  SELECT: la fila propia se ve, la ajena no
-- 9  trigger del bonus y sus funciones (código + prueba funcional si se puede)
-- 10 cupo del plan exime a los sorteos usados como bonus
-- 11 ledger 0118
--
-- Transacción con ROLLBACK: no deja datos.
-- Correr en el SQL Editor de Supabase, como postgres.
-- =====================================================================

begin;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v118',
    coalesce(current_setting('test.v118', true), '') || p_linea || E'\n', true);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: tres perfiles distintos y un par ajeno ya existente.
-- ---------------------------------------------------------------------
do $$
declare
  v_u1 uuid;
  v_u2 uuid;
  v_u3 uuid;
  v_id uuid;
begin
  select id into v_u1 from public.profiles order by created_at limit 1;

  select id into v_u2 from public.profiles
   where id <> coalesce(v_u1, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  select id into v_u3 from public.profiles
   where id not in (
     coalesce(v_u1, '00000000-0000-0000-0000-000000000000'::uuid),
     coalesce(v_u2, '00000000-0000-0000-0000-000000000000'::uuid))
   order by created_at limit 1;

  perform set_config('test.v118.u1', coalesce(v_u1::text, ''), true);
  perform set_config('test.v118.u2', coalesce(v_u2::text, ''), true);
  perform set_config('test.v118.u3', coalesce(v_u3::text, ''), true);

  if v_u1 is not null and v_u3 is not null then
    -- El par u1→u2 se borra para que el chequeo 4 pruebe un INSERT nuevo; el
    -- borrado vive dentro de la transacción y se revierte con el ROLLBACK.
    if v_u2 is not null then
      delete from public.referrals
       where referrer_id = v_u1 and referred_id = v_u2;
    end if;

    insert into public.referrals (referrer_id, referred_id)
    values (v_u1, v_u3)
    on conflict (referrer_id, referred_id) do nothing;

    select id into v_id
      from public.referrals
     where referrer_id = v_u1 and referred_id = v_u3;

    perform set_config('test.v118.ajeno', coalesce(v_id::text, ''), true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Permisos de tabla
-- ---------------------------------------------------------------------
do $$
declare
  v_ins boolean;
  v_sel boolean;
begin
  select has_table_privilege('authenticated', 'public.referrals', 'insert'),
         has_table_privilege('authenticated', 'public.referrals', 'select')
    into v_ins, v_sel;

  if v_ins and v_sel then
    perform pg_temp.anota('1 OK       authenticated puede INSERT y SELECT en referrals');
  else
    perform pg_temp.anota('1 CRÍTICO  faltan permisos: insert=' || v_ins || ' select=' || v_sel);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Políticas
-- ---------------------------------------------------------------------
do $$
declare
  v_ins boolean;
  v_sel boolean;
begin
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'referrals'
       and cmd = 'INSERT'
       and coalesce(with_check, '') ilike '%auth.uid()%'
  ) into v_ins;

  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'referrals'
       and cmd = 'SELECT'
       and coalesce(qual, '') ilike '%auth.uid()%'
  ) into v_sel;

  if v_ins and v_sel then
    perform pg_temp.anota('2 OK       políticas de INSERT y SELECT atadas a auth.uid()');
  else
    perform pg_temp.anota('2 CRÍTICO  falta política: insert=' || v_ins || ' select=' || v_sel);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2b) La política no depende de la RLS de `profiles`
--     (el error que apareció en producción con la 0118: el EXISTS corría con
--     la RLS del invitado, que sólo ve su propio perfil)
-- ---------------------------------------------------------------------
do $$
declare
  v_chk text;
  v_func boolean;
  v_definer boolean;
begin
  select coalesce(with_check, '') into v_chk
    from pg_policies
   where schemaname = 'public' and tablename = 'referrals'
     and policyname = 'referrals_insert_propio';

  select exists (
    select 1 from pg_proc
     where proname = 'perfil_existe'
       and pronamespace = 'public'::regnamespace
  ) into v_func;

  select coalesce((
    select prosecdef from pg_proc
     where proname = 'perfil_existe'
       and pronamespace = 'public'::regnamespace
  ), false) into v_definer;

  if v_chk ilike '%perfil_existe%' and v_func and v_definer then
    perform pg_temp.anota('2b OK       el chequeo de referente usa perfil_existe (SECURITY DEFINER)');
  elsif v_chk ilike '%from profiles%' then
    perform pg_temp.anota('2b CRÍTICO  la política consulta profiles y la RLS la bloquea: aplicá 0119');
  else
    perform pg_temp.anota('2b CRÍTICO  la política no valida la existencia del referente');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) Unique del par
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.referrals'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(referrer_id, referred_id)%'
  ) into v_ok;

  perform pg_temp.anota('3 ' || case when v_ok
    then 'OK       unique (referrer_id, referred_id) presente'
    else 'CRÍTICO  falta el unique: la captura va a duplicar' end);
end $$;

-- ---------------------------------------------------------------------
-- 4 a 7) Como invitado autenticado (u2)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', coalesce(current_setting('test.v118.u2', true), ''), 'role', 'authenticated')::text,
  true);
set local role authenticated;

-- 4) INSERT válido: u1 invita a u2 (el dueño de la sesión)
do $$
declare
  v_u1 uuid := nullif(current_setting('test.v118.u1', true), '')::uuid;
  v_u2 uuid := nullif(current_setting('test.v118.u2', true), '')::uuid;
  v_rows int;
begin
  if v_u1 is null or v_u2 is null then
    perform pg_temp.anota('4 AVISO    hacen falta dos perfiles');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u1, v_u2);
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      perform pg_temp.anota('4 OK       el invitado registró su propio vínculo');
    else
      perform pg_temp.anota('4 CRÍTICO  no insertó la fila');
    end if;
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  el INSERT legítimo fue rechazado: ' || sqlerrm);
  end;
end $$;

-- 5) Auto-referido: u2 se invita a sí mismo
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v118.u2', true), '')::uuid;
begin
  if v_u2 is null then
    perform pg_temp.anota('5 AVISO    falta el segundo perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u2, v_u2);
    perform pg_temp.anota('5 CRÍTICO  aceptó un auto-referido');
  exception when others then
    perform pg_temp.anota('5 OK       auto-referido bloqueado');
  end;
end $$;

-- 6) A nombre de otro: u2 intenta registrar a u3
do $$
declare
  v_u1 uuid := nullif(current_setting('test.v118.u1', true), '')::uuid;
  v_u3 uuid := nullif(current_setting('test.v118.u3', true), '')::uuid;
begin
  if v_u1 is null or v_u3 is null then
    perform pg_temp.anota('6 AVISO    falta un tercer perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u1, v_u3);
    perform pg_temp.anota('6 CRÍTICO  pudo registrar un vínculo a nombre de otro');
  exception when others then
    perform pg_temp.anota('6 OK       no se puede registrar a nombre de otro');
  end;
end $$;

-- 7) Referente inexistente
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v118.u2', true), '')::uuid;
begin
  if v_u2 is null then
    perform pg_temp.anota('7 AVISO    falta el segundo perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id)
    values ('00000000-0000-4000-8000-000000000118', v_u2);
    perform pg_temp.anota('7 CRÍTICO  aceptó un referente que no existe');
  exception when others then
    perform pg_temp.anota('7 OK       referente inexistente bloqueado');
  end;
end $$;

-- 8) SELECT: propia visible, ajena no
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v118.u2', true), '')::uuid;
  v_ajeno uuid := nullif(current_setting('test.v118.ajeno', true), '')::uuid;
  v_propias int;
  v_ajenas int;
begin
  if v_u2 is null then
    perform pg_temp.anota('8 AVISO    falta el segundo perfil');
    return;
  end if;

  select count(*) into v_propias
    from public.referrals
   where referred_id = v_u2;

  perform pg_temp.anota('8 ' || case when v_propias > 0
    then 'OK       ve las filas donde es el invitado'
    else 'CRÍTICO  no ve su propia fila' end);

  if v_ajeno is not null then
    select count(*) into v_ajenas
      from public.referrals
     where id = v_ajeno;

    perform pg_temp.anota('8 ' || case when v_ajenas = 0
      then 'OK       no ve el vínculo ajeno'
      else 'CRÍTICO  filtró una fila ajena' end);
  else
    perform pg_temp.anota('8 AVISO    no hay fila ajena para probar el aislamiento');
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 9) Trigger del bonus: existe y activa el sorteo referenciado
-- ---------------------------------------------------------------------
do $$
declare
  v_trigger boolean;
  v_funcion boolean;
  v_codigo text;
begin
  select exists (
    select 1 from pg_trigger
     where tgname = 'trg_activar_sorteo_bonus'
       and tgrelid = 'public.raffles'::regclass
  ) into v_trigger;

  select exists (
    select 1 from pg_proc
     where proname = 'activar_sorteo_bonus'
       and pronamespace = 'public'::regnamespace
  ) into v_funcion;

  v_codigo := coalesce(
    (select pg_get_functiondef('public.activar_sorteo_bonus()'::regprocedure)), '');

  if v_trigger and v_funcion and v_codigo ilike '%bonus_raffle_id%'
     and v_codigo ilike '%active%' then
    perform pg_temp.anota('9 OK       trigger y función del bonus presentes');
  else
    perform pg_temp.anota('9 CRÍTICO  falta el trigger o la función del bonus');
  end if;
end $$;

-- 9b) Prueba funcional, sólo si hay un organizador con KYC aprobado
do $$
declare
  v_owner uuid;
  v_principal uuid;
  v_bonus uuid;
  v_status text;
begin
  select id into v_owner
    from public.profiles
   where verification_status = 'approved'
     and coalesce(btrim(full_name), '') <> ''
     and coalesce(btrim(phone), '') <> ''
     and coalesce(btrim(location), '') <> ''
     and coalesce(btrim(dni_number), '') <> ''
   order by created_at limit 1;

  if v_owner is null then
    perform pg_temp.anota('9b AVISO    no hay organizador con KYC aprobado; se saltea la prueba funcional');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, created_by, status,
                              terms_accepted_by_organizer)
  values ('v118 principal', now() + interval '10 days', 100, v_owner, 'paused', true)
  returning id into v_principal;

  insert into public.raffles (title, draw_date, price_per_number, created_by, status,
                              terms_accepted_by_organizer)
  values ('v118 bonus', now() + interval '10 days', 100, v_owner, 'paused', true)
  returning id into v_bonus;

  update public.raffles
     set bonus_raffle_id = v_bonus
   where id = v_principal;

  select status into v_status from public.raffles where id = v_bonus;

  perform pg_temp.anota('9b ' || case when v_status = 'active'
    then 'OK       elegir un bonus lo activa'
    else 'CRÍTICO  el bonus quedó en ' || coalesce(v_status, '?') end);
end $$;

-- ---------------------------------------------------------------------
-- 10) Cupo: el bonus no consume sorteos activos del plan
-- ---------------------------------------------------------------------
do $$
declare
  v_codigo text;
begin
  v_codigo := coalesce(
    (select pg_get_functiondef('public.enforce_plan_raffle_limit()'::regprocedure)), '');

  perform pg_temp.anota('10 ' || case when v_codigo ilike '%bonus_raffle_id%'
    then 'OK       el cupo excluye los sorteos usados como bonus'
    else 'CRÍTICO  el cupo no menciona bonus_raffle_id' end);
end $$;

-- ---------------------------------------------------------------------
-- 11) Ledger
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (select 1 from public._applied_migrations where version = '0118')
    into v_ok;

  perform pg_temp.anota('11 ' || case when v_ok
    then 'OK       ledger registra 0118'
    else 'CRÍTICO  falta la fila 0118' end);
end $$;

select current_setting('test.v118', true) as resultado;

rollback;

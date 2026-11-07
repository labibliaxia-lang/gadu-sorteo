-- =====================================================================
-- Verificador 0119 — política de captura de referidos sin depender de RLS
-- =====================================================================
-- 1  función perfil_existe(uuid) presente
-- 2  es SECURITY DEFINER y con search_path fijado
-- 3  authenticated puede ejecutarla; anon no
-- 4  la política referrals_insert_propio la usa y NO consulta profiles
-- 5  funcionamiento en condiciones de producción:
--    sin las políticas viejas, el invitado no ve el perfil del referente y
--    el INSERT de su propio vínculo igual pasa
-- 6  auto-referido bloqueado
-- 7  vínculo a nombre de otro bloqueado
-- 8  referente inexistente bloqueado
-- 9  SELECT: ve su fila y no la ajena
-- 10 ledger registra 0119
--
-- Transacción con ROLLBACK: no deja datos ni cambios de políticas.
-- Correr en el SQL Editor de Supabase, como postgres.
-- =====================================================================

begin;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v119',
    coalesce(current_setting('test.v119', true), '') || p_linea || E'\n', true);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: tres perfiles, un par ajeno y el escenario de producción
-- (sin las políticas viejas permisivas de referrals).
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

  perform set_config('test.v119.u1', coalesce(v_u1::text, ''), true);
  perform set_config('test.v119.u2', coalesce(v_u2::text, ''), true);
  perform set_config('test.v119.u3', coalesce(v_u3::text, ''), true);

  -- Escenario de producción: sólo debe quedar la política de la 0118/0119.
  -- (El drop es local a la transacción y se revierte con el ROLLBACK.)
  drop policy if exists "referrals_insert_referred" on public.referrals;
  drop policy if exists "referrals_select_own" on public.referrals;

  if v_u1 is not null and v_u2 is not null then
    delete from public.referrals
     where referrer_id = v_u1 and referred_id = v_u2;
  end if;

  if v_u1 is not null and v_u3 is not null then
    insert into public.referrals (referrer_id, referred_id)
    values (v_u1, v_u3)
    on conflict (referrer_id, referred_id) do nothing;

    select id into v_id
      from public.referrals
     where referrer_id = v_u1 and referred_id = v_u3;

    perform set_config('test.v119.ajeno', coalesce(v_id::text, ''), true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) y 2) Función perfil_existe
-- ---------------------------------------------------------------------
do $$
declare
  v_hay boolean;
  v_definer boolean;
  v_search_path boolean;
begin
  select exists (
    select 1 from pg_proc
     where proname = 'perfil_existe'
       and pronamespace = 'public'::regnamespace
       and pg_get_function_identity_arguments(oid) = 'p_id uuid'
  ) into v_hay;

  select coalesce((
    select prosecdef from pg_proc
     where proname = 'perfil_existe' and pronamespace = 'public'::regnamespace
  ), false) into v_definer;

  select coalesce((
    select exists (
      select 1 from unnest(coalesce(proconfig, '{}')) c
       where c ilike 'search_path=%'
    )
    from pg_proc
    where proname = 'perfil_existe' and pronamespace = 'public'::regnamespace
  ), false) into v_search_path;

  perform pg_temp.anota('1 ' || case when v_hay
    then 'OK       existe public.perfil_existe(uuid)'
    else 'CRÍTICO  falta la función perfil_existe' end);

  perform pg_temp.anota('2 ' || case when v_definer and v_search_path
    then 'OK       es SECURITY DEFINER con search_path fijado'
    else 'CRÍTICO  falta SECURITY DEFINER o search_path' end);
end $$;

-- ---------------------------------------------------------------------
-- 3) Permisos de ejecución
-- ---------------------------------------------------------------------
do $$
declare
  v_auth boolean;
  v_anon boolean;
begin
  select has_function_privilege('authenticated', 'public.perfil_existe(uuid)', 'execute'),
         has_function_privilege('anon', 'public.perfil_existe(uuid)', 'execute')
    into v_auth, v_anon;

  perform pg_temp.anota('3 ' || case when v_auth and not v_anon
    then 'OK       authenticated puede ejecutarla y anon no'
    else 'CRÍTICO  permisos de ejecución: authenticated=' || v_auth || ' anon=' || v_anon end);
end $$;

-- ---------------------------------------------------------------------
-- 4) La política usa la función y no consulta profiles
-- ---------------------------------------------------------------------
do $$
declare
  v_chk text;
begin
  select coalesce(with_check, '') into v_chk
    from pg_policies
   where schemaname = 'public' and tablename = 'referrals'
     and policyname = 'referrals_insert_propio';

  if v_chk ilike '%perfil_existe%' and v_chk not ilike '%from profiles%' then
    perform pg_temp.anota('4 OK       la política usa perfil_existe y no lee profiles');
  elsif v_chk ilike '%from profiles%' then
    perform pg_temp.anota('4 CRÍTICO  la política sigue consultando profiles (RLS la bloquea)');
  else
    perform pg_temp.anota('4 CRÍTICO  no se encontró la política o no usa perfil_existe');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) a 8) Como invitado autenticado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', coalesce(current_setting('test.v119.u2', true), ''), 'role', 'authenticated')::text,
  true);
set local role authenticated;

-- 5) El perfil del referente no es visible, pero el INSERT pasa
do $$
declare
  v_u1 uuid := nullif(current_setting('test.v119.u1', true), '')::uuid;
  v_u2 uuid := nullif(current_setting('test.v119.u2', true), '')::uuid;
  v_visibles int := -1;
  v_rows int := 0;
begin
  if v_u1 is null or v_u2 is null then
    perform pg_temp.anota('5 AVISO    hacen falta dos perfiles');
    return;
  end if;

  select count(*) into v_visibles from public.profiles where id = v_u1;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u1, v_u2);
    get diagnostics v_rows = row_count;
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  el INSERT falló: ' || sqlerrm);
    return;
  end;

  if v_rows = 1 and v_visibles = 0 then
    perform pg_temp.anota('5 OK       insert permitido aunque el perfil del referente no se ve');
  elsif v_rows = 1 then
    perform pg_temp.anota('5 AVISO    insert permitido, pero el perfil ajeno es visible: no prueba el bypass de RLS');
  else
    perform pg_temp.anota('5 CRÍTICO  no insertó la fila');
  end if;
end $$;

-- 6) Auto-referido
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v119.u2', true), '')::uuid;
begin
  if v_u2 is null then
    perform pg_temp.anota('6 AVISO    falta el segundo perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u2, v_u2);
    perform pg_temp.anota('6 CRÍTICO  aceptó un auto-referido');
  exception when others then
    perform pg_temp.anota('6 OK       auto-referido bloqueado');
  end;
end $$;

-- 7) A nombre de otro
do $$
declare
  v_u1 uuid := nullif(current_setting('test.v119.u1', true), '')::uuid;
  v_u3 uuid := nullif(current_setting('test.v119.u3', true), '')::uuid;
begin
  if v_u1 is null or v_u3 is null then
    perform pg_temp.anota('7 AVISO    falta un tercer perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id) values (v_u1, v_u3);
    perform pg_temp.anota('7 CRÍTICO  pudo registrar un vínculo a nombre de otro');
  exception when others then
    perform pg_temp.anota('7 OK       no se puede registrar a nombre de otro');
  end;
end $$;

-- 8) Referente inexistente
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v119.u2', true), '')::uuid;
begin
  if v_u2 is null then
    perform pg_temp.anota('8 AVISO    falta el segundo perfil');
    return;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id)
    values ('00000000-0000-4000-8000-000000000119', v_u2);
    perform pg_temp.anota('8 CRÍTICO  aceptó un referente que no existe');
  exception when others then
    perform pg_temp.anota('8 OK       referente inexistente bloqueado');
  end;
end $$;

-- 9) SELECT: propia sí, ajena no
do $$
declare
  v_u2 uuid := nullif(current_setting('test.v119.u2', true), '')::uuid;
  v_ajeno uuid := nullif(current_setting('test.v119.ajeno', true), '')::uuid;
  v_propias int := 0;
  v_ajenas int := 0;
begin
  if v_u2 is null then
    perform pg_temp.anota('9 AVISO    falta el segundo perfil');
    return;
  end if;

  select count(*) into v_propias from public.referrals where referred_id = v_u2;

  perform pg_temp.anota('9 ' || case when v_propias > 0
    then 'OK       ve las filas donde es el invitado'
    else 'CRÍTICO  no ve su propia fila' end);

  if v_ajeno is not null then
    select count(*) into v_ajenas from public.referrals where id = v_ajeno;

    perform pg_temp.anota('9 ' || case when v_ajenas = 0
      then 'OK       no ve el vínculo ajeno'
      else 'CRÍTICO  filtró una fila ajena' end);
  else
    perform pg_temp.anota('9 AVISO    no hay fila ajena para probar el aislamiento');
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 10) Ledger
-- ---------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  select exists (select 1 from public._applied_migrations where version = '0119')
    into v_ok;

  perform pg_temp.anota('10 ' || case when v_ok
    then 'OK       ledger registra 0119'
    else 'CRÍTICO  falta la fila 0119: la 0118 sola deja la captura rota' end);
end $$;

select current_setting('test.v119', true) as resultado;

rollback;

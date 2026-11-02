-- =====================================================================
-- Prueba de 0025 — acumula el veredicto y lo devuelve en UNA celda
-- =====================================================================
-- Pegar todo en el SQL Editor y ejecutar. Termina en ROLLBACK: no deja nada.
--
-- Por qué no usa tabla temporal: los casos corren con `set local role
-- authenticated`, y una tabla temporal de `postgres` no es visible/escribible
-- desde ese rol (42501 primero, 42P01 después). Los veredictos se acumulan en
-- un parámetro de sesión, que no tiene dueño ni permisos.
--
-- Lo que devuelve: una sola fila con una línea por caso. Copiá esa celda.
-- =====================================================================

begin;

-- 0) Perfil de prueba: uno que no sea superadmin.
do $$
declare v_uid uuid;
begin
  select id into v_uid
  from public.profiles
  where role <> 'superadmin'
  order by created_at
  limit 1;

  if v_uid is null then
    raise exception 'Se necesita al menos un perfil con role <> superadmin';
  end if;

  perform set_config('test.uid', v_uid::text, true);
  perform set_config('test.report', '', true);
end $$;

-- Helper: agrega una línea al reporte. No toca tablas.
create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.report',
    coalesce(current_setting('test.report', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- Claims de un usuario autenticado (lo que pone PostgREST).
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text,
  true
);

-- Casos 1-5: como el usuario autenticado.
set local role authenticated;

do $$
declare v_rows int;
begin
  begin
    update public.profiles set plan = 'premium'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('1 ' || case when v_rows = 0
      then 'RLS -> protegido por RLS, el trigger no se evaluó'
      else 'FALLO -> el usuario se puso plan=premium' end);
  exception when others then
    perform pg_temp.anota('1 ' || case when sqlerrm ilike '%plan%'
      then 'OK -> ' else 'OTRO -> ' end || sqlerrm);
  end;
end $$;

do $$
declare v_rows int;
begin
  begin
    update public.profiles set verification_status = 'approved'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('2 ' || case when v_rows = 0
      then 'RLS -> protegido por RLS, el trigger no se evaluó'
      else 'FALLO -> el usuario se aprobó su verificación' end);
  exception when others then
    perform pg_temp.anota('2 ' || case when sqlerrm ilike '%identidad%'
      then 'OK -> ' else 'OTRO -> ' end || sqlerrm);
  end;
end $$;

do $$
declare v_rows int;
begin
  begin
    update public.profiles set verification_status = 'pending'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('3 ' || case when v_rows = 1
      then 'OK -> pudo volver el KYC a pending'
      else 'FALLO -> ' || v_rows || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('3 OTRO -> se rechazó un cambio legítimo: ' || sqlerrm);
  end;
end $$;

do $$
declare v_rows int;
begin
  begin
    update public.profiles set admin_request_status = 'approved'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('4 ' || case when v_rows = 0
      then 'RLS -> protegido por RLS, el trigger no se evaluó'
      else 'FALLO -> el usuario aprobó su solicitud' end);
  exception when others then
    perform pg_temp.anota('4 ' || case when sqlerrm ilike '%solicitud%'
      then 'OK -> ' else 'OTRO -> ' end || sqlerrm);
  end;
end $$;

do $$
declare v_rows int;
begin
  begin
    update public.profiles set admin_request_status = 'pending'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('5 ' || case when v_rows = 1
      then 'OK -> pudo abrir su solicitud'
      else 'FALLO -> ' || v_rows || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('5 OTRO -> se rechazó un cambio legítimo: ' || sqlerrm);
  end;
end $$;

reset role;

-- Caso 6: sin usuario final (servidor / service_role / migraciones).
select set_config('request.jwt.claims', '{}', true);

do $$
declare v_rows int;
begin
  begin
    update public.profiles set plan = 'premium'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('6 ' || case when v_rows = 1
      then 'OK -> el servidor pudo escribir'
      else 'FALLO -> ' || v_rows || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('6 OTRO -> el trigger bloqueó al servidor: ' || sqlerrm);
  end;
end $$;

-- Caso 7: la prueba del hallazgo #2. Claims de usuario, rol privilegiado que
-- saltea RLS: si el trigger mirase `current_user`, este UPDATE pasaría.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text,
  true
);

do $$
declare v_rows int;
begin
  begin
    update public.profiles set plan = 'premium'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('7 ' || case when v_rows = 0
      then 'RLS -> 0 filas, revisar'
      else 'FALLO -> la protección depende del rol de conexión' end);
  exception when others then
    perform pg_temp.anota('7 ' || case when sqlerrm ilike '%plan%'
      then 'OK -> bloqueado también con rol privilegiado: ' else 'OTRO -> ' end || sqlerrm);
  end;
end $$;

-- El reporte completo, en una sola celda.
select current_setting('test.report', true) as resultado;

rollback;

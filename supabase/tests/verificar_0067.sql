-- =====================================================================
-- Verificación de 0067 — ¿está cargado y funcionando?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK:
-- no deja filas, ni cambios de rol, ni la migración aplicada.
--
-- Devuelve UNA celda con una línea por comprobación:
--   OK · FALTA · CRÍTICO · AVISO · OTRO
--
-- Qué responde, en orden:
--   1-2  ¿Existen las funciones y los triggers de 0067?
--   3    ¿Están aplicadas 0033/0034? El trigger necesita sus columnas.
--   4    ¿La migración quedó anotada en el ledger?
--   5    ¿Deja pasar lo legítimo del panel? (si esto falla, 6-8 no prueban nada)
--   6-8  ¿Bloquea el ataque del organizador?
--   9-10 ¿Deja pasar al motor y a service_role?
--   11   ¿Un cliente autenticado puede nacer como admin?
--   12   ¿El alta del servidor (handle_new_user) conserva el rol?
--
-- Notas de diseño:
--   * `profiles.id` referencia `auth.users`, así que las pruebas de alta usan
--     un usuario REAL al que se le borra el perfil dentro de la transacción.
--   * Los valores de ataque se calculan para ser siempre distintos del actual:
--     si no, el trigger no se dispararía y la prueba pasaría en falso.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0067', '', true);
  perform set_config('test.verif0067.raffle', '', true);
  perform set_config('test.verif0067.uid', '', true);
end $$;

-- Helper: agrega una línea al reporte. No toca tablas ni permisos.
create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0067',
    coalesce(current_setting('test.verif0067', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1-2) Objetos de 0067
-- ---------------------------------------------------------------------
do $$
declare v_fn int; v_tg int;
begin
  select count(*) into v_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('guard_raffle_result', 'force_profile_role_on_insert');

  select count(*) into v_tg
  from pg_trigger
  where not tgisinternal
    and tgname in ('guard_raffle_result', 'force_profile_role_on_insert');

  perform pg_temp.anota('1 ' || case when v_fn = 2 then 'OK       funciones de 0067: 2/2'
    else 'FALTA    funciones de 0067: ' || v_fn || '/2 -> aplicar la migración' end);

  perform pg_temp.anota('2 ' || case when v_tg = 2 then 'OK       triggers de 0067: 2/2'
    else 'FALTA    triggers de 0067: ' || v_tg || '/2 -> aplicar la migración' end);
end $$;

-- ---------------------------------------------------------------------
-- 3) Columnas que el trigger necesita (0033 y 0034)
-- ---------------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(c, ', ' order by c) into v_missing
  from unnest(array[
    'winner_number', 'winner_user_id', 'winner_name', 'result_hash',
    'numbers_hash', 'hashes_at', 'draw_seed', 'draw_seed_revealed_at',
    'draw_commitment', 'draw_commitment_at', 'drawn_at'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raffles'
      and column_name = c
  );

  perform pg_temp.anota('3 ' || case when v_missing is null
    then 'OK       columnas del resultado presentes (0033/0034 aplicadas)'
    else 'CRÍTICO  faltan columnas en raffles: ' || v_missing
      || ' -> aplicar 0033 y 0034 antes que 0067' end);
end $$;

-- ---------------------------------------------------------------------
-- 4) Ledger
-- ---------------------------------------------------------------------
do $$
declare v_total int; v_has int;
begin
  if to_regclass('public._applied_migrations') is null then
    perform pg_temp.anota('4 AVISO    sin ledger (0028 no aplicada): no se puede saber qué migraciones corrieron');
    return;
  end if;

  select count(*) into v_total from public._applied_migrations;
  select count(*) into v_has from public._applied_migrations where version = '0067';

  perform pg_temp.anota('4 ' || case when v_has > 0
    then 'OK       ledger: 0067 registrada (' || v_total || ' migraciones anotadas)'
    else 'AVISO    ledger sin la fila 0067 -> corrió pero no se anotó (paso 3 del archivo 0067)' end);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: un sorteo de un organizador activo + un usuario real
-- ---------------------------------------------------------------------
do $$
declare v_raffle uuid; v_owner uuid; v_uid uuid;
begin
  select r.id, r.created_by into v_raffle, v_owner
  from public.raffles r
  join public.profiles p on p.id = r.created_by
  where p.role in ('admin', 'superadmin')
    and p.is_banned is not true
  order by r.created_at desc
  limit 1;

  -- Usuario real con perfil, preferentemente común, para las pruebas de alta.
  -- Después se le borra el perfil para poder insertarlo: `profiles.id` tiene FK
  -- a `auth.users`, así que un uuid inventado no sirve. El borrado —y el
  -- cascade a reseñas, preguntas y devoluciones de ese usuario— queda dentro de
  -- la transacción y se revierte con el ROLLBACK del final.
  select p.id into v_uid
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'user'
  order by p.created_at desc
  limit 1;

  if v_uid is null then
    select p.id into v_uid
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 1;
  end if;

  perform set_config('test.verif0067.raffle', coalesce(v_raffle::text, ''), true);
  perform set_config('test.verif0067.uid', coalesce(v_uid::text, ''), true);

  if v_raffle is null then
    perform pg_temp.anota('5 AVISO    no hay sorteo de un organizador activo para probar: creá uno y volvé a correr');
  end if;

  if v_uid is null then
    perform pg_temp.anota('11 AVISO    no hay usuarios con perfil para probar el alta');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5-8) Como organizador autenticado
-- ---------------------------------------------------------------------
do $$
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',
      (select created_by from public.raffles where id = current_setting('test.verif0067.raffle')::uuid),
      'role', 'authenticated'
    )::text,
    true
  );
end $$;

set local role authenticated;

-- 5) Control: el panel SÍ puede editar su sorteo. Si esto da 0 filas, RLS cortó
--    antes del trigger y las pruebas 6-8 no significan nada.
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles set title = title where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('5 ' || case when v_rows = 1
      then 'OK       el organizador puede editar su sorteo (title = title)'
      else 'CRÍTICO  el organizador no pudo tocar su propio sorteo (' || v_rows || ' fila/s): revisar RLS de raffles' end);
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  falló una edición legítima: ' || sqlerrm);
  end;
end $$;

-- 6) El ataque: cerrar el sorteo a mano.
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles set status = 'drawn' where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('6 ' || case when v_rows = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  el organizador cerró su sorteo a mano' end);
  exception when others then
    -- Cualquier guarda que lo frene sirve (0067, 0047 por fecha, 0057 por
    -- mínimos, o una política RLS). Los triggers BEFORE UPDATE se ejecutan en
    -- orden alfabético, así que no siempre gana el nuestro.
    perform pg_temp.anota('6 ' || case when sqlerrm ilike any (array[
      '%motor%', '%resultado%', '%programado%', '%compromiso%',
      '%sorteado%', '%row-level%', '%mínimo%', '%minimo%', '%permiso%'])
      then 'OK       bloqueado: ' || sqlerrm
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

-- 7) El ataque: escribir el ganador (valor siempre distinto al actual).
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles
       set winner_number = coalesce(winner_number, 0) + 1
     where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('7 ' || case when v_rows = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  el organizador escribió el ganador a mano' end);
  exception when others then
    perform pg_temp.anota('7 ' || case when sqlerrm ilike any (array[
      '%motor%', '%resultado%', '%sorteado%', '%row-level%', '%permiso%'])
      then 'OK       bloqueado: ' || sqlerrm
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

-- 8) El ataque: publicar un compromiso propio (hash aleatorio, nunca igual).
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles
       set draw_commitment = md5(random()::text) || md5(random()::text)
     where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('8 ' || case when v_rows = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  el organizador publicó un compromiso por su cuenta' end);
  exception when others then
    perform pg_temp.anota('8 ' || case when sqlerrm ilike any (array[
      '%motor%', '%resultado%', '%compromiso%', '%sorteado%',
      '%row-level%', '%permiso%'])
      then 'OK       bloqueado: ' || sqlerrm
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 9-10) El motor y el servidor tienen que poder
-- ---------------------------------------------------------------------
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles
       set winner_number = coalesce(winner_number, 0) + 1
     where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('9 ' || case when v_rows = 1
      then 'OK       el motor (security definer / service_role) escribe el resultado'
      else 'CRÍTICO  el motor no pudo escribir: el sorteo quedaría sin ganador' end);
  exception when others then
    perform pg_temp.anota('9 ' || case when sqlerrm ilike '%ya fue sorteado%'
      then 'OK       el sorteo ya estaba sorteado: se probó sin alterar el resultado'
      else 'CRÍTICO  el trigger bloqueó al motor: ' || sqlerrm end);
  end;
end $$;

-- 10) La transición a 'drawn' desde el camino privilegiado.
do $$
declare v_rows int; v_raffle uuid := current_setting('test.verif0067.raffle')::uuid;
begin
  if current_setting('test.verif0067.raffle') = '' then return; end if;

  begin
    update public.raffles set status = 'drawn' where id = v_raffle;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('10 ' || case when v_rows = 1
      then 'OK       el motor puede cerrar el sorteo'
      else 'AVISO    la transición no afectó filas' end);
  exception when others then
    perform pg_temp.anota('10 ' || case when sqlerrm ilike any (array[
      '%programado%', '%sorteado%', '%mínimo%', '%minimo%'])
      then 'OK       rebotó por una guarda correcta: ' || sqlerrm
      else 'OTRO     la transición falló: ' || sqlerrm end);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 11) Cliente autenticado intentando nacer como admin
-- ---------------------------------------------------------------------
do $$
declare v_uid uuid := nullif(current_setting('test.verif0067.uid', true), '')::uuid;
begin
  if v_uid is null then return; end if;

  -- Se borra el perfil de un usuario REAL (se revierte con el rollback): si no,
  -- el INSERT choca con la PK y la prueba no llegaría nunca al trigger.
  delete from public.profiles where id = v_uid;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );
end $$;

set local role authenticated;

do $$
declare
  v_uid uuid := nullif(current_setting('test.verif0067.uid', true), '')::uuid;
  v_role text;
begin
  if v_uid is null then return; end if;

  begin
    -- 'admin' (no 'superadmin') para no depender del CHECK de roles: lo que se
    -- prueba es que el trigger reescribe el rol, sea cual sea el pedido.
    insert into public.profiles (id, full_name, role)
    values (v_uid, 'prueba 0067', 'admin');

    select role into v_role from public.profiles where id = v_uid;

    perform pg_temp.anota('11 ' || case when v_role = 'user'
      then 'OK       el alta quedó con role=user (se ignoró lo que pidió el cliente)'
      else 'CRÍTICO  el perfil nació con role=' || coalesce(v_role, 'null') end);
  exception when others then
    perform pg_temp.anota('11 OTRO     el alta falló: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 12) Alta del servidor (handle_new_user): sin sesión, el rol se respeta
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.verif0067.uid', true), '')::uuid;
  v_role text;
begin
  if v_uid is null then return; end if;

  perform set_config('request.jwt.claims', '{}', true);

  begin
    delete from public.profiles where id = v_uid;

    insert into public.profiles (id, full_name, role)
    values (v_uid, 'prueba 0067 servidor', 'admin');

    select role into v_role from public.profiles where id = v_uid;

    perform pg_temp.anota('12 ' || case when v_role = 'admin'
      then 'OK       sin sesión el rol se respeta (alta del servidor intacta)'
      else 'CRÍTICO  el trigger pisa el rol del servidor: quedaría ' || coalesce(v_role, 'null') end);
  exception when others then
    perform pg_temp.anota('12 CRÍTICO  el alta del servidor falló: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0067', true) as resultado;

rollback;

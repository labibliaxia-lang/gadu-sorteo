-- =====================================================================
-- Prueba de aislamiento RLS entre cuentas (automática, sin editar UUIDs)
-- =====================================================================
-- Cómo usarla:
--   1. Pegá TODO este bloque en el SQL Editor de Supabase y ejecutalo.
--   2. Si termina sin error, el aislamiento está bien. El ROLLBACK no deja
--      ningún cambio (los updates son "title = title", no-op).
--   3. Si aparece un error que empieza con "FALLA:", copiámelo tal cual.
--   4. Si el script se corta por un error, ejecutá `rollback;` una vez.
--
-- Qué elige solo:
--   A = dueño del primer sorteo existente (la víctima).
--   B = otra cuenta NO superadmin (el atacante). Prefiere un organizador.
--
-- Qué NO se prueba y por qué:
--   Los sorteos y los números son públicos por diseño (cualquiera puede ver
--   la grilla de un sorteo). El aislamiento real está en la ESCRITURA y en los
--   datos privados (pagos, perfiles con PII). Por eso no se afirma que A no
--   "vea" el sorteo de B.
--
-- Requisito: al menos dos cuentas; si no hay una segunda cuenta no-superadmin,
-- el script lo dice y no inventa datos.
-- =====================================================================

begin;

-- Diagnóstico: si RLS está deshabilitado en raffles, la prueba no tiene sentido.
do $$
declare
  v_rls boolean;
begin
  select relrowsecurity into v_rls
  from pg_class
  where oid = 'public.raffles'::regclass;

  if v_rls is not true then
    raise exception 'PRUEBA INVÁLIDA: RLS está deshabilitado en public.raffles. Aplicá la migración 0041 y reintentá.';
  end if;
end $$;

-- A: dueño del primer sorteo.
select set_config(
  'test.a',
  coalesce((
    select r.created_by::text
    from public.raffles r
    order by r.created_at
    limit 1
  ), ''),
  true
);

do $$
begin
  if coalesce(current_setting('test.a', true), '') = '' then
    raise exception 'No hay ningún sorteo en la base: no se puede probar el aislamiento.';
  end if;
end $$;

-- Sorteo de A (activo, para que el control positivo no choque con el trigger
-- de sorteos ya sorteados) y una cuenta atacante B (no superadmin).
select set_config(
  'test.raffle_a',
  coalesce((
    select r.id::text
    from public.raffles r
    where r.created_by = current_setting('test.a')::uuid
      and r.status = 'active'
    order by r.created_at
    limit 1
  ), ''),
  true
);

select set_config(
  'test.b',
  coalesce((
    select p.id::text
    from public.profiles p
    where p.id <> current_setting('test.a')::uuid
      and p.role in ('admin', 'user')
    order by (p.role = 'admin') desc, p.created_at
    limit 1
  ), ''),
  true
);

do $$
begin
  if coalesce(current_setting('test.raffle_a', true), '') = '' then
    raise exception 'El organizador A no tiene sorteos activos. Activá uno y reintentá.';
  end if;

  if coalesce(current_setting('test.b', true), '') = '' then
    raise exception 'No hay una segunda cuenta no-superadmin para probar. Creá otra cuenta (o un organizador) y reintentá.';
  end if;
end $$;

-- Simulamos ser B (la app usa el rol authenticated y el JWT del usuario).
set local role authenticated;

select set_config('request.jwt.claim.sub', current_setting('test.b'), true);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.b'),
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_a uuid := current_setting('test.a')::uuid;
  v_b uuid := current_setting('test.b')::uuid;
  v_raffle_a uuid := current_setting('test.raffle_a')::uuid;
  v int;
begin
  -- Control de simulación: si no somos `authenticated` o auth.uid() no es B,
  -- un "pase" o un "FALLA" no significan nada.
  if current_user <> 'authenticated' then
    raise exception 'PRUEBA INVÁLIDA: current_user=%, se esperaba authenticated. Ejecutá el script completo en el SQL Editor.', current_user;
  end if;

  if auth.uid() is null or auth.uid() <> v_b then
    raise exception 'PRUEBA INVÁLIDA: auth.uid()=% y se esperaba B=%. El JWT simulado no se aplicó.', auth.uid(), v_b;
  end if;

  -- Control: B se ve a sí mismo.
  select count(*) into v from public.profiles where id = v_b;
  if v <> 1 then
    raise exception 'FALLA: B no puede leer su propio perfil (la prueba no es válida)';
  end if;

  -- 1) B no puede editar el sorteo de A.
  update public.raffles
  set title = title
  where id = v_raffle_a;

  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FALLA: B editó el sorteo de A (% filas)', v;
  end if;

  -- 2) B no puede editar los números del sorteo de A.
  --    Después de 0041 ni siquiera tiene privilegio de UPDATE: el error
  --    `insufficient_privilege` también cuenta como bloqueo correcto.
  begin
    update public.raffle_numbers
    set status = status
    where raffle_id = v_raffle_a;

    get diagnostics v = row_count;
    if v <> 0 then
      raise exception 'FALLA: B modificó números del sorteo de A (% filas)', v;
    end if;
  exception
    when insufficient_privilege then
      null; -- sin privilegio: bloqueado, que es lo esperado
  end;

  -- 3) B no ve pagos ajenos del sorteo de A.
  select count(*) into v
  from public.payments
  where raffle_id = v_raffle_a
    and user_id <> v_b;
  if v <> 0 then
    raise exception 'FALLA: B ve % pagos ajenos del sorteo de A', v;
  end if;

  raise notice 'OK: B no edita sorteos ni números de A y no ve pagos ajenos.';
end $$;

-- Control positivo: A sí puede editar su propio sorteo.
select set_config('request.jwt.claim.sub', current_setting('test.a'), true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('test.a'),
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_raffle_a uuid := current_setting('test.raffle_a')::uuid;
  v int;
begin
  update public.raffles
  set title = title
  where id = v_raffle_a;

  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FALLA: A no puede editar su propio sorteo (% filas). Revisá las políticas de raffles.', v;
  end if;

  raise notice 'OK: A sí puede editar su propio sorteo (control positivo).';
end $$;

reset role;
rollback;

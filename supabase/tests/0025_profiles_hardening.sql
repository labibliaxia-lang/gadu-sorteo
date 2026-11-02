-- =====================================================================
-- Prueba de la migración 0025 — columnas sensibles de `profiles`
-- =====================================================================
-- Cómo se usa: pegar todo en el SQL Editor de Supabase y ejecutar.
-- No deja cambios: la transacción termina en ROLLBACK.
--
-- Qué demuestra, en orden:
--   1. Un usuario autenticado no puede ascenderse el plan.
--   2. No puede aprobarse su propia verificación de identidad (KYC).
--   3. Sí puede volver su KYC a 'pending' al subir documentos.
--   4. No puede aprobarse una solicitud de organizador.
--   5. Sí puede abrir o cancelar esa solicitud.
--   6. El servidor (sin usuario final) sí puede cambiar el plan.
--   7. **La protección no depende del rol de conexión**: con claims de un
--      usuario sobre un rol privilegiado (que saltea RLS), el trigger sigue
--      bloqueando. Es el caso que motivó quitar el filtro por `current_user`.
--
-- Lo que NO prueba: que la protección se aplique a filas ajenas (el RLS ya
-- impide escribir sobre otra fila sin service_role) ni el camino del canje de
-- licencias de 0022, que exige un código real.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Perfil de prueba: uno que no sea superadmin
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid;
begin
  select id into v_uid
  from public.profiles
  where role <> 'superadmin'
  order by created_at
  limit 1;

  if v_uid is null then
    raise exception 'Se necesita al menos un perfil con role <> superadmin para probar';
  end if;

  perform set_config('test.uid', v_uid::text, true);
  raise notice 'Perfil de prueba: %', v_uid;
end $$;

-- Claims como los que pone PostgREST para un usuario autenticado.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text,
  true
);

-- ---------------------------------------------------------------------
-- 1) El usuario no puede cambiarse el plan (paywall)
-- ---------------------------------------------------------------------
set local role authenticated;
do $$
declare v_rows int;
begin
  begin
    update public.profiles set plan = 'premium'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise notice 'CASO 1: 0 filas afectadas (RLS) — protegido, pero el trigger no llegó a evaluarse';
    else
      raise warning 'FALLO CASO 1: el usuario se puso plan=premium';
    end if;
  exception when others then
    if sqlerrm ilike '%plan%' then
      raise notice 'OK CASO 1: el trigger bloqueó el cambio de plan (%)', sqlerrm;
    else
      raise warning 'CASO 1 con error inesperado: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 2) El usuario no puede aprobarse el KYC
-- ---------------------------------------------------------------------
set local role authenticated;
do $$
declare v_rows int;
begin
  begin
    update public.profiles set verification_status = 'approved'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise notice 'CASO 2: 0 filas afectadas (RLS) — protegido, pero el trigger no llegó a evaluarse';
    else
      raise warning 'FALLO CASO 2: el usuario se aprobó su propia verificación';
    end if;
  exception when others then
    if sqlerrm ilike '%identidad%' then
      raise notice 'OK CASO 2: el trigger bloqueó la auto-aprobación (%)', sqlerrm;
    else
      raise warning 'CASO 2 con error inesperado: %', sqlerrm;
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3) Sí puede volver el KYC a 'pending' al subir documentos
-- ---------------------------------------------------------------------
do $$
declare v_rows int;
begin
  begin
    update public.profiles set verification_status = 'pending'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      raise notice 'OK CASO 3: el usuario pudo volver su KYC a pending';
    else
      raise warning 'FALLO CASO 3: no se pudo volver el KYC a pending (% fila/s)', v_rows;
    end if;
  exception when others then
    raise warning 'FALLO CASO 3: se rechazó un cambio legítimo: %', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 4) El usuario no puede aprobarse una solicitud de organizador
-- ---------------------------------------------------------------------
set local role authenticated;
do $$
declare v_rows int;
begin
  begin
    update public.profiles set admin_request_status = 'approved'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise notice 'CASO 4: 0 filas afectadas (RLS) — protegido, pero el trigger no llegó a evaluarse';
    else
      raise warning 'FALLO CASO 4: el usuario se aprobó su propia solicitud';
    end if;
  exception when others then
    if sqlerrm ilike '%solicitud%' then
      raise notice 'OK CASO 4: el trigger bloqueó la auto-aprobación (%)', sqlerrm;
    else
      raise warning 'CASO 4 con error inesperado: %', sqlerrm;
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5) Sí puede abrir su propia solicitud
-- ---------------------------------------------------------------------
do $$
declare v_rows int;
begin
  begin
    update public.profiles set admin_request_status = 'pending'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      raise notice 'OK CASO 5: el usuario pudo abrir su solicitud';
    else
      raise warning 'FALLO CASO 5: no se pudo abrir la solicitud (% fila/s)', v_rows;
    end if;
  exception when others then
    raise warning 'FALLO CASO 5: se rechazó un cambio legítimo: %', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 6) El servidor (sin usuario final) sí puede cambiar el plan
-- ---------------------------------------------------------------------
do $$
declare v_rows int;
begin
  begin
    perform set_config('request.jwt.claims', '{}', true);
    update public.profiles set plan = 'premium'
    where id = current_setting('test.uid')::uuid;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      raise notice 'OK CASO 6: sin usuario final la escritura del servidor pasa';
    else
      raise warning 'FALLO CASO 6: el servidor no pudo escribir (% fila/s)', v_rows;
    end if;
  exception when others then
    raise warning 'FALLO CASO 6: el trigger bloqueó al servidor: %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 7) La protección no depende del rol de conexión
--    Se repiten los claims del usuario, pero ejecutando con un rol
--    privilegiado (saltea RLS). Si el trigger mirase `current_user`,
--    este UPDATE pasaría.
-- ---------------------------------------------------------------------
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

    if v_rows > 0 then
      raise warning 'FALLO CASO 7: con rol privilegiado y claims de usuario, el plan se cambió — la protección depende del rol de conexión';
    else
      raise notice 'CASO 7: 0 filas afectadas, revisar';
    end if;
  exception when others then
    if sqlerrm ilike '%plan%' then
      raise notice 'OK CASO 7: el trigger bloqueó igual, sin mirar el rol de conexión (%)', sqlerrm;
    else
      raise warning 'CASO 7 con error inesperado: %', sqlerrm;
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Nada de esto queda aplicado.
-- ---------------------------------------------------------------------
rollback;

select 'Prueba terminada (rollback aplicado). Leé los NOTICE/WARNING de arriba.' as resultado;

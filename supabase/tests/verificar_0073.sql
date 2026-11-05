-- =====================================================================
-- Verificación de 0073 — ¿el organizador sigue viendo el DNI del comprador?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK.
-- Devuelve SIEMPRE una celda, aunque falte la migración.
--
--   1  ¿existe la vista raffle_buyers y tiene solo las 5 columnas?
--   2  ¿desapareció la política amplia sobre profiles?
--   3  montaje: un organizador admin, otro admin y un comprador
--   4  el dueño ve a su comprador (por la vista)
--   5  el dueño NO puede leer la fila del perfil del comprador (email/DNI)
--   6  otro organizador (admin, no superadmin) no ve nada
--   7  anon no tiene permiso sobre la vista
--
-- Dos decisiones que evitan falsos positivos, aprendidas a golpes:
--   * Los usuarios de prueba son `admin`, NUNCA `superadmin`: el superadmin ve
--     todos los perfiles y todos los compradores por diseño, y usarlo acá haría
--     fallar las pruebas 5 y 6 sin que haya nada roto.
--   * El helper del reporte vive en `public`, no en `pg_temp`: el esquema
--     temporal no está disponible dentro del manejador de excepciones de un
--     bloque. Se crea dentro de esta transacción y el ROLLBACK lo borra.
-- =====================================================================

begin;

create or replace function public.verif0073_anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0073',
    coalesce(current_setting('test.verif0073', true), '') || p_linea || E'\n',
    true
  );
end $$;

do $$
begin
  perform set_config('test.verif0073', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 1-2) Estado del esquema
-- ---------------------------------------------------------------------
do $$
declare v_cols int; v_pol int;
begin
  if to_regclass('public.raffle_buyers') is null then
    perform public.verif0073_anota('1 FALTA    no existe la vista raffle_buyers -> aplicar 0073');
  else
    select count(*) into v_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = 'raffle_buyers';

    perform public.verif0073_anota('1 ' || case when v_cols = 5
      then 'OK       la vista existe con 5 columnas (sin PII de más)'
      else 'CRÍTICO  la vista expone ' || v_cols || ' columnas: revisar antes de usarla' end);
  end if;

  select count(*) into v_pol
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'profiles_select_own_raffle_buyers';

  perform public.verif0073_anota('2 ' || case when v_pol = 0
    then 'OK       la política amplia sobre profiles ya no existe'
    else 'CRÍTICO  profiles_select_own_raffle_buyers sigue activa -> aplicar 0073' end);
end $$;

-- ---------------------------------------------------------------------
-- 3) Montaje
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_other uuid;
  v_buyer uuid;
  v_raffle uuid := gen_random_uuid();
  v_previo uuid;
begin
  -- Sin claims: el montaje se hace como servidor, único modo de poder ajustar
  -- el rol de un perfil ajeno sin que salte el trigger de autoprotección.
  perform set_config('request.jwt.claims', '{}', true);

  select p.id into v_owner
  from public.profiles p
  where p.role = 'admin' and p.is_banned is not true
  order by p.created_at
  limit 1;

  if v_owner is null then
    perform public.verif0073_anota('3 AVISO    no hay ningún perfil con role=admin: el aislamiento no se puede probar');
    return;
  end if;

  -- Segundo organizador: cualquier perfil distinto. Si no es admin, se lo
  -- promueve dentro de esta transacción (nunca a superadmin: anularía la
  -- prueba). Si la promoción fallara, la prueba 6 se omite y se avisa.
  select p.id, p.role into v_other, v_previo
  from public.profiles p
  where p.id <> v_owner
  order by p.created_at
  limit 1;

  if v_other is not null and v_previo is distinct from 'admin' then
    begin
      update public.profiles set role = 'admin' where id = v_other;
    exception when others then
      perform public.verif0073_anota('3 AVISO    no se pudo promover al segundo organizador: ' || sqlerrm);
      v_other := null;
    end;
  end if;

  select p.id into v_buyer
  from public.profiles p
  where p.id <> v_owner and p.id <> coalesce(v_other, p.id)
  order by p.created_at desc
  limit 1;

  if v_buyer is null then
    perform public.verif0073_anota('3 AVISO    hacen falta tres perfiles para montar la prueba');
    return;
  end if;

  perform set_config('test.verif0073.owner', v_owner::text, true);
  perform set_config('test.verif0073.other', coalesce(v_other::text, ''), true);
  perform set_config('test.verif0073.buyer', v_buyer::text, true);
  perform set_config('test.verif0073.raffle', v_raffle::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values (v_raffle, 'prueba 0073', now() + interval '5 days', 100, 'active', v_owner);

  insert into public.raffle_numbers (raffle_id, number, status, reserved_by, reserved_until)
  values (v_raffle, 1, 'reserved', v_buyer, now() + interval '10 minutes');

  perform public.verif0073_anota('3 OK       montaje listo (dueño admin, segundo admin y comprador)');
end $$;

-- ---------------------------------------------------------------------
-- 4-5) Como el organizador dueño del sorteo
-- ---------------------------------------------------------------------
do $$
declare v_owner uuid := nullif(current_setting('test.verif0073.owner', true), '')::uuid;
begin
  if v_owner is null then return; end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
end $$;

set local role authenticated;

do $$
declare
  v_buyer uuid := nullif(current_setting('test.verif0073.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.verif0073.raffle', true), '')::uuid;
  v_filas int;
  v_perfiles int;
begin
  if v_buyer is null then return; end if;

  -- 4) La vista le muestra a su comprador.
  begin
    select count(*) into v_filas
    from public.raffle_buyers
    where raffle_id = v_raffle and buyer_id = v_buyer and kind = 'reserved';

    perform public.verif0073_anota('4 ' || case when v_filas = 1
      then 'OK       el dueño ve a su comprador por la vista'
      else 'CRÍTICO  la vista no le devuelve su propio comprador (' || v_filas || ' filas)' end);
  exception when others then
    perform public.verif0073_anota('4 CRÍTICO  la vista falló: ' || sqlerrm);
  end;

  -- 5) Lo que ya NO puede: la fila del perfil del comprador.
  begin
    select count(*) into v_perfiles
    from public.profiles
    where id = v_buyer;

    perform public.verif0073_anota('5 ' || case when v_perfiles = 0
      then 'OK       el perfil del comprador ya no es legible (ni email, ni DNI, ni domicilio)'
      else 'CRÍTICO  el organizador todavía lee la fila entera del comprador' end);
  exception when others then
    perform public.verif0073_anota('5 OK       la lectura del perfil ajeno fue rechazada: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 6) Otro organizador no ve nada
-- ---------------------------------------------------------------------
do $$
declare v_other uuid := nullif(current_setting('test.verif0073.other', true), '')::uuid;
begin
  if v_other is null then
    perform public.verif0073_anota('6 AVISO    se omite: no hay un segundo organizador admin');
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );
end $$;

set local role authenticated;

do $$
declare
  v_other uuid := nullif(current_setting('test.verif0073.other', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.verif0073.raffle', true), '')::uuid;
  v_filas int;
begin
  if v_other is null then return; end if;

  begin
    select count(*) into v_filas
    from public.raffle_buyers
    where raffle_id = v_raffle;

    perform public.verif0073_anota('6 ' || case when v_filas = 0
      then 'OK       otro organizador no ve compradores ajenos'
      else 'CRÍTICO  la vista filtró ' || v_filas || ' comprador/es de un sorteo ajeno' end);
  exception when others then
    perform public.verif0073_anota('6 OK       la lectura fue rechazada: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 7) anon sin permiso
-- ---------------------------------------------------------------------
do $$
declare v_anon boolean;
begin
  if to_regclass('public.raffle_buyers') is null then
    perform public.verif0073_anota('7 AVISO    se omite: falta la vista');
    return;
  end if;

  select has_table_privilege('anon', 'public.raffle_buyers', 'select') into v_anon;

  perform public.verif0073_anota('7 ' || case when v_anon
    then 'CRÍTICO  un visitante sin sesión puede leer la vista'
    else 'OK       anon no tiene permiso sobre la vista' end);
end $$;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0073', true) as resultado;

rollback;

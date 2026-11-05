-- =====================================================================
-- Verificación de 0070 — ¿un contracargo da de baja los números?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK.
-- Devuelve SIEMPRE una celda con una línea por comprobación, incluso si la
-- migración no está aplicada: las pruebas que dependen de la función se marcan
-- como omitidas en vez de cortar el script con un error.
--
-- Monta dos sorteos y tres números vendidos:
--   sorteo ACTIVO: números 1 y 2 pagados con el pago A, número 3 con el pago B
--   sorteo SORTEADO: número 1 pagado con el pago A
--
--   1  ¿existe void_sold_numbers? (0070 aplicada)
--   2  montaje de datos
--   3  el CHECK de payments acepta 'refunded' y 'charged_back'
--   4  la baja libera SOLO los números de ese pago
--   5  el número de otro pago queda intacto
--   6  con el sorteo sorteado, la baja se rechaza
--   7  la función no es ejecutable por un usuario autenticado
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0070', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0070',
    coalesce(current_setting('test.verif0070', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- Helper local: ¿está la función de 0070?
create or replace function pg_temp.hay_void() returns boolean
language sql as $$
  select to_regprocedure('public.void_sold_numbers(uuid,uuid,int[],uuid)') is not null;
$$;

-- ---------------------------------------------------------------------
-- 1) ¿Está la migración?
-- ---------------------------------------------------------------------
do $$
begin
  perform pg_temp.anota('1 ' || case when pg_temp.hay_void()
    then 'OK       existe void_sold_numbers (0070 aplicada)'
    else 'FALTA    no existe void_sold_numbers -> aplicar 0070 antes de esta prueba' end);
end $$;

-- ---------------------------------------------------------------------
-- 2) Montaje
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  v_active uuid := gen_random_uuid();
  v_drawn uuid := gen_random_uuid();
  v_pago_a uuid := gen_random_uuid();
  v_pago_b uuid := gen_random_uuid();
begin
  select p.id into v_uid
  from public.profiles p
  order by p.created_at desc
  limit 1;

  if v_uid is null then
    perform pg_temp.anota('2 AVISO    no hay usuarios con perfil para montar la prueba');
    return;
  end if;

  perform set_config('test.verif0070.uid', v_uid::text, true);
  perform set_config('test.verif0070.active', v_active::text, true);
  perform set_config('test.verif0070.drawn', v_drawn::text, true);
  perform set_config('test.verif0070.pago_a', v_pago_a::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values
    (v_active, 'prueba 0070 activo', now() + interval '2 days', 100, 'active', v_uid),
    (v_drawn,  'prueba 0070 sorteado', now() - interval '1 day', 100, 'drawn', v_uid);

  insert into public.payments (id, user_id, raffle_id, numbers, amount, status)
  values
    (v_pago_a, v_uid, v_active, array[1, 2], 200, 'approved'),
    (v_pago_b, v_uid, v_active, array[3], 100, 'approved');

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at, payment_id)
  values
    (v_active, 1, 'sold', v_uid, now(), v_pago_a),
    (v_active, 2, 'sold', v_uid, now(), v_pago_a),
    (v_active, 3, 'sold', v_uid, now(), v_pago_b),
    (v_drawn,  1, 'sold', v_uid, now(), v_pago_a);

  perform pg_temp.anota('2 OK       datos montados (2 sorteos, 3 números vendidos, 2 pagos)');
exception when others then
  perform pg_temp.anota('2 CRÍTICO  no se pudo montar la prueba: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- 3) El CHECK acepta los estados nuevos
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.verif0070.uid', true), '')::uuid;
  v_active uuid := nullif(current_setting('test.verif0070.active', true), '')::uuid;
  v_ok int := 0;
begin
  if v_uid is null then
    perform pg_temp.anota('3 AVISO    se omite: no hay datos montados');
    return;
  end if;

  begin
    insert into public.payments (user_id, raffle_id, numbers, amount, status)
    values (v_uid, v_active, array[]::int[], 0, 'refunded');
    v_ok := v_ok + 1;
  exception when others then null;
  end;

  begin
    insert into public.payments (user_id, raffle_id, numbers, amount, status)
    values (v_uid, v_active, array[]::int[], 0, 'charged_back');
    v_ok := v_ok + 1;
  exception when others then null;
  end;

  perform pg_temp.anota('3 ' || case when v_ok = 2
    then 'OK       payments acepta refunded y charged_back'
    else 'FALTA    el CHECK rechaza los estados nuevos (aceptados: ' || v_ok || '/2) -> aplicar 0070' end);
end $$;

-- ---------------------------------------------------------------------
-- 4-5) La baja de números
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.verif0070.uid', true), '')::uuid;
  v_active uuid := nullif(current_setting('test.verif0070.active', true), '')::uuid;
  v_pago_a uuid := nullif(current_setting('test.verif0070.pago_a', true), '')::uuid;
  v_count int;
  v_1 text; v_2 text; v_3 text;
begin
  if v_uid is null or not pg_temp.hay_void() then
    perform pg_temp.anota('4 AVISO    se omite: falta la función o los datos');
    perform pg_temp.anota('5 AVISO    se omite: falta la función o los datos');
    return;
  end if;

  begin
    v_count := public.void_sold_numbers(v_active, v_uid, array[1, 2, 3], v_pago_a);

    select status into v_1 from public.raffle_numbers where raffle_id = v_active and number = 1;
    select status into v_2 from public.raffle_numbers where raffle_id = v_active and number = 2;
    select status into v_3 from public.raffle_numbers where raffle_id = v_active and number = 3;

    perform pg_temp.anota('4 ' || case
      when v_count = 2 and v_1 = 'available' and v_2 = 'available'
        then 'OK       liberó los 2 números del pago revertido'
      else 'CRÍTICO  liberó ' || coalesce(v_count, -1) || ' número/s (1=' || coalesce(v_1, 'null')
        || ', 2=' || coalesce(v_2, 'null') || ')' end);

    perform pg_temp.anota('5 ' || case when v_3 = 'sold'
      then 'OK       el número del otro pago sigue vendido (no se tocó)'
      else 'CRÍTICO  liberó un número que era de otro pago (quedó ' || coalesce(v_3, 'null') || ')' end);
  exception when others then
    perform pg_temp.anota('4-5 CRÍTICO  la función falló: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 6) Con el sorteo sorteado la baja se rechaza
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.verif0070.uid', true), '')::uuid;
  v_drawn uuid := nullif(current_setting('test.verif0070.drawn', true), '')::uuid;
  v_pago_a uuid := nullif(current_setting('test.verif0070.pago_a', true), '')::uuid;
begin
  if v_uid is null or not pg_temp.hay_void() then
    perform pg_temp.anota('6 AVISO    se omite: falta la función o los datos');
    return;
  end if;

  begin
    perform public.void_sold_numbers(v_drawn, v_uid, array[1], v_pago_a);
    perform pg_temp.anota('6 CRÍTICO  con el sorteo sorteado la baja se ejecutó igual');
  exception when others then
    perform pg_temp.anota('6 ' || case when sqlerrm ilike '%revisión manual%'
      then 'OK       con el sorteo sorteado la baja se rechaza (correcto)'
      else 'OTRO     rechazó por otro motivo: ' || sqlerrm end);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 7) Permisos: solo el servidor
-- ---------------------------------------------------------------------
do $$
declare v_auth boolean;
begin
  if not pg_temp.hay_void() then
    perform pg_temp.anota('7 AVISO    se omite: falta la función');
    return;
  end if;

  select has_function_privilege(
    'authenticated',
    to_regprocedure('public.void_sold_numbers(uuid,uuid,int[],uuid)'),
    'execute'
  ) into v_auth;

  perform pg_temp.anota('7 ' || case when v_auth
    then 'CRÍTICO  un usuario autenticado puede llamar la baja de ventas'
    else 'OK       solo service_role puede dar de baja números' end);
end $$;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0070', true) as resultado;

rollback;

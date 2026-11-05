-- =====================================================================
-- Verificación de 0068 — ¿el cron respeta un pago en curso?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK:
-- no deja sorteos, números, pagos ni la migración aplicada.
--
-- Devuelve UNA celda con una línea por comprobación: OK · FALTA · CRÍTICO · AVISO
--
-- Monta cuatro números reservados con la reserva ya vencida:
--   1  sin pago                          -> debe liberarse
--   2  pago pendiente creado hace 1 h    -> debe SEGUIR reservado
--   3  pago pendiente creado hace 25 h   -> debe liberarse
--   4  ya vendido                        -> debe quedar intacto
--
-- Ojo: se llama a la función real, que libera TODA reserva vencida de la base
-- dentro de la transacción. El ROLLBACK lo devuelve todo, y el bloqueo dura
-- milisegundos.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0068', '', true);
  perform set_config('test.verif0068.ok', '0', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0068',
    coalesce(current_setting('test.verif0068', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) ¿Está cargada la versión nueva de la función?
-- ---------------------------------------------------------------------
do $$
declare v_has boolean;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'release_expired_reservations'
  ) then
    perform pg_temp.anota('1 FALTA    no existe release_expired_reservations');
    return;
  end if;

  select pg_get_functiondef('public.release_expired_reservations'::regproc)
         like '%24 hours%'
    into v_has;

  perform pg_temp.anota('1 ' || case when v_has
    then 'OK       la función tiene la guarda de 24 h (0068 aplicada)'
    else 'FALTA    la función es la de 0001: aplicar 0068' end);
end $$;

-- ---------------------------------------------------------------------
-- 2) Montaje de datos de prueba
-- ---------------------------------------------------------------------
do $$
declare v_uid uuid; v_raffle uuid := gen_random_uuid();
begin
  select p.id into v_uid
  from public.profiles p
  where p.role = 'user'
  order by p.created_at desc
  limit 1;

  if v_uid is null then
    select p.id into v_uid from public.profiles p order by p.created_at limit 1;
  end if;

  if v_uid is null then
    perform pg_temp.anota('2 AVISO    no hay usuarios: no se puede montar la prueba');
    return;
  end if;

  perform set_config('test.verif0068.raffle', v_raffle::text, true);
  perform set_config('test.verif0068.uid', v_uid::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values (v_raffle, 'prueba 0068', now() + interval '2 days', 100, 'active', v_uid);

  insert into public.raffle_numbers (raffle_id, number, status, reserved_by, reserved_until)
  values
    (v_raffle, 1, 'reserved', v_uid, now() - interval '1 hour'),
    (v_raffle, 2, 'reserved', v_uid, now() - interval '1 hour'),
    (v_raffle, 3, 'reserved', v_uid, now() - interval '1 hour'),
    (v_raffle, 4, 'sold',     null,  null);

  -- Pago en curso y reciente (protege el número 2).
  insert into public.payments (user_id, raffle_id, numbers, amount, status, created_at)
  values (v_uid, v_raffle, array[2], 100, 'pending', now() - interval '1 hour');

  -- Pago en curso pero viejo (el número 3 se libera igual: carrito abandonado).
  insert into public.payments (user_id, raffle_id, numbers, amount, status, created_at)
  values (v_uid, v_raffle, array[3], 100, 'pending', now() - interval '25 hours');

  perform pg_temp.anota('2 OK       datos de prueba montados (4 números, 2 pagos)');
exception when others then
  perform pg_temp.anota('2 CRÍTICO  no se pudo montar la prueba: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- 3) Ejecutar la función real
-- ---------------------------------------------------------------------
do $$
declare v_released int;
begin
  if current_setting('test.verif0068.raffle', true) is null then return; end if;

  begin
    v_released := public.release_expired_reservations();
    perform pg_temp.anota('3 OK       la función corrió y liberó ' || coalesce(v_released, 0) || ' reserva/s en toda la base');
  exception when others then
    perform pg_temp.anota('3 CRÍTICO  la función falló: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 4) El veredicto, número por número
-- ---------------------------------------------------------------------
do $$
declare
  v_raffle uuid := nullif(current_setting('test.verif0068.raffle', true), '')::uuid;
  v_n1 text; v_n2 text; v_n3 text; v_n4 text;
begin
  if v_raffle is null then return; end if;

  select status into v_n1 from public.raffle_numbers where raffle_id = v_raffle and number = 1;
  select status into v_n2 from public.raffle_numbers where raffle_id = v_raffle and number = 2;
  select status into v_n3 from public.raffle_numbers where raffle_id = v_raffle and number = 3;
  select status into v_n4 from public.raffle_numbers where raffle_id = v_raffle and number = 4;

  perform pg_temp.anota('4 ' || case when v_n1 = 'available'
    then 'OK       reserva sin pago: liberada'
    else 'CRÍTICO  reserva sin pago quedó en ' || coalesce(v_n1, 'null') || ' (inventario trabado)' end);

  perform pg_temp.anota('5 ' || case when v_n2 = 'reserved'
    then 'OK       pago pendiente hace 1 h: la reserva SE MANTIENE'
    else 'CRÍTICO  pago en curso perdió sus números (quedó ' || coalesce(v_n2, 'null') || '): esto es lo que arregla 0068' end);

  perform pg_temp.anota('6 ' || case when v_n3 = 'available'
    then 'OK       pago pendiente hace 25 h: liberado (carrito abandonado)'
    else 'CRÍTICO  un pago viejo bloquea el inventario para siempre (quedó ' || coalesce(v_n3, 'null') || ')' end);

  perform pg_temp.anota('7 ' || case when v_n4 = 'sold'
    then 'OK       número vendido: intacto'
    else 'CRÍTICO  la función tocó un número vendido (quedó ' || coalesce(v_n4, 'null') || ')' end);
end $$;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0068', true) as resultado;

rollback;

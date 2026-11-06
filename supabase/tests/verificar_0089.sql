-- =====================================================================
-- Verificador 0089 — bandeja de notificaciones (fase 1)
-- =====================================================================
-- Qué prueba:
--   1  la tabla existe con RLS
--   2  RLS: otro usuario no ve las notificaciones ajenas
--   3  reservar crea UNA notificación con los números
--   4  el organizador puede ampliar la reserva; un comprador no
--   5  el vencimiento libera y avisa
--
-- Todo en una transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v89', '', true);
  perform set_config('test.v89.owner', '', true);
  perform set_config('test.v89.buyer', '', true);
  perform set_config('test.v89.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v89',
    coalesce(current_setting('test.v89', true), '') || p_linea || E'\n', true);
end $$;

-- 1) Tabla y RLS
do $$
begin
  perform pg_temp.anota('1 ' || case
    when to_regclass('public.notifications') is null
      then 'FALTA    no existe notifications -> aplicar 0089'
    when not (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass)
      then 'FALTA    la tabla no tiene RLS'
    else 'OK       tabla de notificaciones con RLS' end);
end $$;

-- Preparación: dueño admin, comprador, sorteo del dueño
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_id uuid;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin')
   order by (role = 'superadmin') desc, created_at limit 1;

  select id into v_buyer from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  if v_owner is null or v_buyer is null then
    perform pg_temp.anota('2 AVISO    hacen falta dos cuentas');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v89 notificaciones', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_id;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_id, n, 'available' from generate_series(1, 3) as n;

  perform set_config('test.v89.owner', v_owner::text, true);
  perform set_config('test.v89.buyer', v_buyer::text, true);
  perform set_config('test.v89.raffle', v_id::text, true);
end $$;

-- 2) RLS: el comprador no ve lo del organizador
-- La fila se crea como postgres: el cliente no puede insertar notificaciones.
do $$
declare
  v_owner uuid := nullif(current_setting('test.v89.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v89.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v89.raffle', true), '')::uuid;
begin
  if v_raffle is null then return; end if;

  insert into public.notifications (user_id, type, raffle_id, subject_user_id, payload)
  values (v_owner, 'report_pending', v_raffle, v_buyer, '{}'::jsonb);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;

do $$
declare v_vistas int;
begin
  select count(*) into v_vistas from public.notifications;
  perform pg_temp.anota('2 ' || case when v_vistas = 0
    then 'OK       el comprador no ve las notificaciones del organizador'
    else 'CRÍTICO  el comprador ve ' || v_vistas || ' notificación(es) ajena(s)' end);
end $$;

-- 3) Reservar desde la RPC avisa al organizador
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v89.raffle', true), '')::uuid;
  v_owner uuid := nullif(current_setting('test.v89.owner', true), '')::uuid;
  v_res int[];
  v_notis int;
begin
  if v_raffle is null then return; end if;

  begin
    v_res := public.reserve_numbers(v_raffle, array[2, 3]);
    perform pg_temp.anota('3a ' || case when v_res = array[2, 3]
      then 'OK       el comprador reservó 2 números'
      else 'CRÍTICO  reservó ' || coalesce(v_res::text, 'null') end);
  exception when others then
    perform pg_temp.anota('3a CRÍTICO  la reserva falló: ' || sqlerrm);
    return;
  end;

  select count(*) into v_notis
    from public.notifications
   where user_id = v_owner
     and type = 'reservation_pending'
     and (payload->>'count')::int = 2;

  perform pg_temp.anota('3 ' || case when v_notis = 1
    then 'OK       una notificación para el organizador con los 2 números'
    else 'CRÍTICO  notificaciones encontradas: ' || v_notis end);
end $$;

-- 4) Ampliar: el comprador no puede, el organizador sí
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v89.raffle', true), '')::uuid;
  v_owner uuid := nullif(current_setting('test.v89.owner', true), '')::uuid;
  v_antes timestamptz;
  v_despues timestamptz;
  v_error text;
  v_count int;
begin
  if v_raffle is null then return; end if;

  select min(reserved_until) into v_antes
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'reserved';

  -- Como comprador: debe fallar.
  begin
    perform public.extend_reservation(v_raffle, array[2, 3], 15);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null then
    perform pg_temp.anota('4a CRÍTICO  un comprador pudo ampliar la reserva');
  else
    perform pg_temp.anota('4a OK       el comprador no puede ampliar: ' || v_error);
  end if;

  -- Como organizador: debe funcionar.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  begin
    v_count := public.extend_reservation(v_raffle, array[2, 3], 15);

    select min(reserved_until) into v_despues
      from public.raffle_numbers
     where raffle_id = v_raffle and status = 'reserved';

    perform pg_temp.anota('4 ' || case
      when v_count = 2 and v_despues > v_antes
        then 'OK       el organizador amplió 15 minutos los 2 números'
      else 'CRÍTICO  amplió ' || v_count || ', antes ' || v_antes || ', después ' || v_despues end);
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  el organizador no pudo ampliar: ' || sqlerrm);
  end;
end $$;

reset role;

-- 5) El vencimiento libera y avisa
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v89.raffle', true), '')::uuid;
  v_owner uuid := nullif(current_setting('test.v89.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v89.buyer', true), '')::uuid;
  v_libres int;
  v_notis int;
begin
  if v_raffle is null then return; end if;

  -- Se fuerza el vencimiento de las reservas de este sorteo.
  perform set_config('request.jwt.claims', '', true);

  update public.raffle_numbers
     set reserved_until = now() - interval '1 hour'
   where raffle_id = v_raffle and status = 'reserved';

  begin
    perform public.release_expired_reservations();
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  la liberación falló: ' || sqlerrm);
    return;
  end;

  select count(*) into v_libres
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'available';

  select count(*) into v_notis
    from public.notifications
   where user_id = v_owner and type = 'reservation_expired';

  perform pg_temp.anota('5 ' || case
    when v_libres = 3 and v_notis >= 1
      then 'OK       liberó los números y avisó al organizador'
    else 'OTRO     libres: ' || v_libres || ', avisos de vencimiento: ' || v_notis end);
end $$;

select current_setting('test.v89', true) as resultado;

rollback;

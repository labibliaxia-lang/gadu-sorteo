-- =====================================================================
-- Verificador 0090 — teléfono en el aviso y pago acreditado
-- =====================================================================
-- Qué prueba:
--   1  la reserva avisa con el teléfono del comprador
--   2  el pago aprobado genera su aviso, con importe y teléfono
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v90', '', true);
  perform set_config('test.v90.owner', '', true);
  perform set_config('test.v90.buyer', '', true);
  perform set_config('test.v90.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v90',
    coalesce(current_setting('test.v90', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin')
   order by (role = 'superadmin') desc, created_at limit 1;

  select id into v_buyer from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  if v_owner is null or v_buyer is null then
    perform pg_temp.anota('1 AVISO    hacen falta dos cuentas');
    return;
  end if;

  -- Teléfono de prueba para comprobar que viaja en el aviso.
  update public.profiles set phone = '3547469000' where id = v_buyer;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v90 notificaciones', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 3) as n;

  perform set_config('test.v90.owner', v_owner::text, true);
  perform set_config('test.v90.buyer', v_buyer::text, true);
  perform set_config('test.v90.raffle', v_raffle::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
end $$;

-- 1) La reserva avisa con teléfono
do $$
declare
  v_owner uuid := nullif(current_setting('test.v90.owner', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v90.raffle', true), '')::uuid;
  v_res int[];
  v_tel text;
begin
  if v_raffle is null then return; end if;

  begin
    v_res := public.reserve_numbers(v_raffle, array[1]);
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  la reserva falló: ' || sqlerrm);
    return;
  end;

  select n.payload->>'buyer_phone' into v_tel
    from public.notifications n
   where n.user_id = v_owner
     and n.type = 'reservation_pending'
   order by n.created_at desc
   limit 1;

  perform pg_temp.anota('1 ' || case when v_tel = '3547469000'
    then 'OK       el aviso de reserva trae el teléfono del comprador'
    else 'CRÍTICO  teléfono en el aviso: ' || coalesce(v_tel, 'null') end);
end $$;

-- 2) El pago aprobado avisa
do $$
declare
  v_owner uuid := nullif(current_setting('test.v90.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v90.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v90.raffle', true), '')::uuid;
  v_pago uuid;
  v_total numeric;
  v_cantidad int;
  v_tel text;
begin
  if v_raffle is null then return; end if;

  perform set_config('request.jwt.claims', '', true);

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_buyer, v_raffle, array[2, 3], 199.99, 'approved')
  returning id into v_pago;

  begin
    perform public.notificar_pago_aprobado(v_pago);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  el aviso de pago falló: ' || sqlerrm);
    return;
  end;

  select
    (n.payload->>'total')::numeric,
    (n.payload->>'count')::int,
    n.payload->>'buyer_phone'
    into v_total, v_cantidad, v_tel
    from public.notifications n
   where n.user_id = v_owner and n.type = 'payment_approved'
   limit 1;

  perform pg_temp.anota('2 ' || case
    when v_total = 199.99 and v_cantidad = 2 and v_tel = '3547469000'
      then 'OK       el pago acreditado avisa con importe, números y teléfono'
    else 'CRÍTICO  total ' || coalesce(v_total::text, 'null')
         || ', números ' || coalesce(v_cantidad::text, 'null')
         || ', teléfono ' || coalesce(v_tel, 'null') end);
end $$;

select current_setting('test.v90', true) as resultado;

rollback;

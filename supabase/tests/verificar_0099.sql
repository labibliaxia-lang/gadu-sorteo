-- =====================================================================
-- Verificador 0099 — registrar pagos después de sortear
-- =====================================================================
-- Qué prueba:
--   1  control: con el sorteo activo se registra igual que antes
--   2  con el sorteo sorteado, el pago se registra
--   3  el número sigue vendido y del mismo comprador (el resultado no cambia)
--   4  la auditoría explica que fue después del sorteo
--   5  la auditoría acepta la acción 'winner_notified'
--   6  un sorteo cancelado sigue rechazando
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v99', '', true);
  perform set_config('test.v99.owner', '', true);
  perform set_config('test.v99.buyer', '', true);
  perform set_config('test.v99.drawn', '', true);
  perform set_config('test.v99.activo', '', true);
  perform set_config('test.v99.cancelado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v99',
    coalesce(current_setting('test.v99', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_drawn uuid;
  v_activo uuid;
  v_cancelado uuid;
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

  -- Sorteado, con dos números vendidos sin pago.
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v99 sorteado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_drawn;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  select v_drawn, n, 'sold', v_buyer, now() from generate_series(1, 2) as n;

  update public.raffles set status = 'drawn' where id = v_drawn;

  -- Activo, mismo escenario.
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v99 activo', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_activo;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  select v_activo, n, 'sold', v_buyer, now() from generate_series(1, 2) as n;

  -- Cancelado.
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v99 cancelado', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_cancelado;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  select v_cancelado, n, 'sold', v_buyer, now() from generate_series(1, 2) as n;

  update public.raffles set status = 'cancelled' where id = v_cancelado;

  perform set_config('test.v99.owner', v_owner::text, true);
  perform set_config('test.v99.buyer', v_buyer::text, true);
  perform set_config('test.v99.drawn', v_drawn::text, true);
  perform set_config('test.v99.activo', v_activo::text, true);
  perform set_config('test.v99.cancelado', v_cancelado::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1) Control: sorteo activo
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v99.activo', true), '')::uuid;
  v_pago uuid;
begin
  if v_raffle is null then return; end if;

  begin
    v_pago := public.organizer_register_payment(v_raffle, array[1], 100);
    perform pg_temp.anota('1 ' || case when v_pago is not null
      then 'OK       control: con el sorteo activo registra el pago'
      else 'CRÍTICO  no devolvió el pago' end);
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  falló con el sorteo activo: ' || sqlerrm);
  end;
end $$;

-- 2-4) Sorteado: registra y no cambia nada del resultado
do $$
declare
  v_owner uuid := nullif(current_setting('test.v99.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v99.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v99.drawn', true), '')::uuid;
  v_pago uuid;
  v_pago_db record;
  v_estado text;
  v_dueno uuid;
  v_motivo text;
begin
  if v_raffle is null then return; end if;

  begin
    v_pago := public.organizer_register_payment(v_raffle, array[1, 2], 200);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  con el sorteo sorteado falló: ' || sqlerrm);
    return;
  end;

  select status, amount into v_pago_db
    from public.payments where id = v_pago;

  perform pg_temp.anota('2 ' || case
    when v_pago_db.status = 'approved' and v_pago_db.amount = 200
      then 'OK       con el sorteo sorteado registró un pago aprobado de 200'
    else 'CRÍTICO  pago estado ' || coalesce(v_pago_db.status, 'null') end);

  select n.status, n.sold_to into v_estado, v_dueno
    from public.raffle_numbers n
   where n.raffle_id = v_raffle and n.number = 1;

  perform pg_temp.anota('3 ' || case
    when v_estado = 'sold' and v_dueno = v_buyer
      then 'OK       el número sigue vendido y del mismo comprador'
    else 'CRÍTICO  estado ' || coalesce(v_estado, 'null')
         || ', dueño ' || coalesce(v_dueno::text, 'null') end);

  select reason into v_motivo
    from public.raffle_audit
   where raffle_id = v_raffle and action = 'register_payment'
   order by created_at desc limit 1;

  perform pg_temp.anota('4 ' || case
    when v_motivo ilike '%despues del sorteo%'
      then 'OK       la auditoría aclara que fue después del sorteo'
    else 'CRÍTICO  motivo: ' || coalesce(v_motivo, 'null') end);
end $$;

-- 5) La auditoría acepta winner_notified
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v99.drawn', true), '')::uuid;
  v_ok boolean := false;
begin
  if v_raffle is null then return; end if;

  begin
    insert into public.raffle_audit (raffle_id, actor_id, action, numbers, reason)
    values (v_raffle, null, 'winner_notified', array[1], 'prueba de verificacion');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;

  perform pg_temp.anota('5 ' || case when v_ok
    then 'OK       la auditoría acepta winner_notified'
    else 'CRÍTICO  winner_notified rechazado' end);
end $$;

-- 6) Cancelado sigue rechazando
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v99.cancelado', true), '')::uuid;
  v_error text;
begin
  if v_raffle is null then return; end if;

  begin
    perform public.organizer_register_payment(v_raffle, array[1], 100);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('6 ' || case when v_error is not null
    then 'OK       cancelado sigue rechazando: ' || v_error
    else 'CRÍTICO  registró un pago en un sorteo cancelado' end);
end $$;

select current_setting('test.v99', true) as resultado;

rollback;

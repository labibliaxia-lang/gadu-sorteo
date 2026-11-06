-- =====================================================================
-- Verificador 0092 — registrar pago y devolver números elegidos
-- =====================================================================
-- Qué prueba:
--   1  registrar un pago cobrado crea la fila aprobada y enlaza los números
--   2  queda auditado como 'register_payment'
--   3  el resumen pasa a estado 'pagado' y marca sólo el número sin pago
--   4  se puede devolver UN número de los dos pagados (no hace falta todos)
--   5  un sorteo sorteado no acepta pagos registrados
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v92', '', true);
  perform set_config('test.v92.owner', '', true);
  perform set_config('test.v92.buyer', '', true);
  perform set_config('test.v92.raffle', '', true);
  perform set_config('test.v92.sorteado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v92',
    coalesce(current_setting('test.v92', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
  v_sorteado uuid;
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

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v92 ventas', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  select v_raffle, n, 'sold', v_buyer, now() from generate_series(1, 3) as n;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v92 sorteado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_sorteado;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  values (v_sorteado, 1, 'sold', v_buyer, now());

  update public.raffles set status = 'drawn' where id = v_sorteado;

  perform set_config('test.v92.owner', v_owner::text, true);
  perform set_config('test.v92.buyer', v_buyer::text, true);
  perform set_config('test.v92.raffle', v_raffle::text, true);
  perform set_config('test.v92.sorteado', v_sorteado::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1) Registrar pago por los números 1 y 2
do $$
declare
  v_owner uuid := nullif(current_setting('test.v92.owner', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v92.raffle', true), '')::uuid;
  v_pago uuid;
  v_estado text;
  v_monto numeric;
  v_enlazados int;
begin
  if v_raffle is null then return; end if;

  begin
    v_pago := public.organizer_register_payment(v_raffle, array[1, 2], 150);
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  registrar pago falló: ' || sqlerrm);
    return;
  end;

  select p.status, p.amount into v_estado, v_monto
    from public.payments p where p.id = v_pago;

  select count(*) into v_enlazados
    from public.raffle_numbers n
   where n.raffle_id = v_raffle and n.payment_id = v_pago;

  perform pg_temp.anota('1 ' || case
    when v_estado = 'approved' and v_monto = 150 and v_enlazados = 2
      then 'OK       pago de 150 aprobado y enlazado a 2 números'
    else 'CRÍTICO  estado ' || coalesce(v_estado, 'null')
         || ', monto ' || coalesce(v_monto::text, 'null')
         || ', enlazados ' || v_enlazados end);
end $$;

-- 2) Auditoría
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v92.raffle', true), '')::uuid;
  v_count int;
begin
  if v_raffle is null then return; end if;

  select count(*) into v_count
    from public.raffle_audit
   where raffle_id = v_raffle and action = 'register_payment';

  perform pg_temp.anota('2 ' || case when v_count = 1
    then 'OK       el pago registrado quedó auditado'
    else 'CRÍTICO  filas register_payment: ' || v_count end);
end $$;

-- 3) El resumen marca sólo el número sin pago
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v92.raffle', true), '')::uuid;
  v_estado text;
  v_manual int[];
  v_paid numeric;
begin
  if v_raffle is null then return; end if;

  select payment_state, numbers_manual, paid
    into v_estado, v_manual, v_paid
    from public.raffle_sales_summary(v_raffle)
   limit 1;

  perform pg_temp.anota('3 ' || case
    when v_estado = 'pagado' and v_manual = array[3] and v_paid = 150
      then 'OK       estado pagado y sólo el número 3 queda sin pago'
    else 'CRÍTICO  estado ' || coalesce(v_estado, 'null')
         || ', sin pago ' || coalesce(v_manual::text, 'null')
         || ', cobrado ' || coalesce(v_paid::text, 'null') end);
end $$;

-- 4) Devolver SOLO el número 1 de los dos pagados
do $$
declare
  v_owner uuid := nullif(current_setting('test.v92.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v92.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v92.raffle', true), '')::uuid;
  v_count int;
  v_uno text;
  v_dos text;
  v_refund numeric;
begin
  if v_raffle is null then return; end if;

  begin
    v_count := public.refund_and_release_numbers(
      v_raffle, array[1], 'devolución parcial pedida por el comprador'
    );
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  devolución parcial falló: ' || sqlerrm);
    return;
  end;

  select status into v_uno from public.raffle_numbers
   where raffle_id = v_raffle and number = 1;
  select status into v_dos from public.raffle_numbers
   where raffle_id = v_raffle and number = 2;
  select amount into v_refund from public.refunds
   where raffle_id = v_raffle and user_id = v_buyer;

  perform pg_temp.anota('4 ' || case
    when v_count = 1 and v_uno = 'available' and v_dos = 'sold' and v_refund = 75.00
      then 'OK       devolvió sólo el 1 (75.00) y el 2 sigue vendido'
    else 'CRÍTICO  liberados ' || coalesce(v_count::text, 'null')
         || ', 1=' || coalesce(v_uno, 'null')
         || ', 2=' || coalesce(v_dos, 'null')
         || ', devolución ' || coalesce(v_refund::text, 'null') end);
end $$;

-- 5) Sorteo sorteado
do $$
declare
  v_sorteado uuid := nullif(current_setting('test.v92.sorteado', true), '')::uuid;
  v_error text;
begin
  if v_sorteado is null then return; end if;

  begin
    perform public.organizer_register_payment(v_sorteado, array[1], 100);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('5 ' || case when v_error is not null
    then 'OK       un sorteo sorteado no acepta pagos: ' || v_error
    else 'CRÍTICO  registró un pago en un sorteo sorteado' end);
end $$;

select current_setting('test.v92', true) as resultado;

rollback;

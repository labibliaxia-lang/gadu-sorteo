-- =====================================================================
-- Verificador 0091 — panel de ventas con plata real y devolución
-- =====================================================================
-- Qué prueba:
--   1  el resumen trae lo cobrado de payments (no números × precio)
--   2  devolver y liberar crea la devolución por lo cobrado
--   3  la liberación queda auditada
--   4  un motivo corto se rechaza
--   5  un sorteo sorteado no se toca
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v91', '', true);
  perform set_config('test.v91.owner', '', true);
  perform set_config('test.v91.buyer', '', true);
  perform set_config('test.v91.raffle', '', true);
  perform set_config('test.v91.sorteado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v91',
    coalesce(current_setting('test.v91', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
  v_sorteado uuid;
  v_pago uuid;
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
  values ('v91 ventas', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 3) as n;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_buyer, v_raffle, array[1, 2], 199.99, 'approved')
  returning id into v_pago;

  update public.raffle_numbers
     set status = 'sold', sold_to = v_buyer, sold_at = now(), payment_id = v_pago
   where raffle_id = v_raffle and number in (1, 2);

  -- Tercer número: vendido a mano, sin pago asociado.
  update public.raffle_numbers
     set status = 'sold', sold_to = v_buyer, sold_at = now(), payment_id = null
   where raffle_id = v_raffle and number = 3;

  -- Sorteo ya sorteado (fecha pasada, para que enforce_draw_date lo permita).
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v91 sorteado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_sorteado;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  values (v_sorteado, 1, 'sold', v_buyer, now());

  update public.raffles set status = 'drawn' where id = v_sorteado;

  perform set_config('test.v91.owner', v_owner::text, true);
  perform set_config('test.v91.buyer', v_buyer::text, true);
  perform set_config('test.v91.raffle', v_raffle::text, true);
  perform set_config('test.v91.sorteado', v_sorteado::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1) Control: el resumen trae la plata real
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v91.raffle', true), '')::uuid;
  v_paid numeric;
  v_refunded numeric;
  v_qty int;
  v_estado text;
begin
  if v_raffle is null then return; end if;

  begin
    select paid, refunded, quantity, payment_state
      into v_paid, v_refunded, v_qty, v_estado
      from public.raffle_sales_summary(v_raffle)
     limit 1;
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  el resumen falló: ' || sqlerrm);
    return;
  end;

  perform pg_temp.anota('1 ' || case
    when v_paid = 199.99 and v_refunded = 0 and v_qty = 3 and v_estado = 'pagado'
      then 'OK       el resumen cobra 199.99 de payments (no 300 de precio)'
    else 'CRÍTICO  cobrado ' || coalesce(v_paid::text, 'null')
         || ', devuelto ' || coalesce(v_refunded::text, 'null')
         || ', cantidad ' || coalesce(v_qty::text, 'null')
         || ', estado ' || coalesce(v_estado, 'null') end);
end $$;

-- 2) Devolver y liberar un número del pago
do $$
declare
  v_owner uuid := nullif(current_setting('test.v91.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v91.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v91.raffle', true), '')::uuid;
  v_count int;
  v_estado text;
  v_refund numeric;
  v_paid numeric;
  v_net numeric;
begin
  if v_raffle is null then return; end if;

  begin
    v_count := public.refund_and_release_numbers(
      v_raffle, array[1], 'el comprador no pudo completar la transferencia'
    );
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  la liberación falló: ' || sqlerrm);
    return;
  end;

  select n.status into v_estado
    from public.raffle_numbers n
   where n.raffle_id = v_raffle and n.number = 1;

  select r.amount into v_refund
    from public.refunds r
   where r.raffle_id = v_raffle and r.user_id = v_buyer;

  select paid, net into v_paid, v_net
    from public.raffle_sales_summary(v_raffle)
   limit 1;

  perform pg_temp.anota('2 ' || case
    when v_count = 1 and v_estado = 'available' and v_refund = 100.00
      then 'OK       liberó el número y devolvió 100.00 (mitad del pago de 199.99)'
    else 'CRÍTICO  liberados ' || coalesce(v_count::text, 'null')
         || ', estado ' || coalesce(v_estado, 'null')
         || ', devolución ' || coalesce(v_refund::text, 'null') end);

  perform pg_temp.anota('2b ' || case
    when v_paid = 199.99 and v_net = 99.99
      then 'OK       el resumen pasa a cobrado 199.99 y neto 99.99'
    else 'CRÍTICO  cobrado ' || coalesce(v_paid::text, 'null')
         || ', neto ' || coalesce(v_net::text, 'null') end);
end $$;

-- 3) Auditoría
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v91.raffle', true), '')::uuid;
  v_count int;
  v_motivo text;
begin
  if v_raffle is null then return; end if;

  select count(*), max(reason) into v_count, v_motivo
    from public.raffle_audit
   where raffle_id = v_raffle and action = 'refund_numbers';

  perform pg_temp.anota('3 ' || case
    when v_count = 1 and v_motivo ilike '%transferencia%'
      then 'OK       la liberación quedó auditada con su motivo'
    else 'CRÍTICO  filas de auditoría: ' || v_count end);
end $$;

-- 4) Motivo corto
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v91.raffle', true), '')::uuid;
  v_error text;
begin
  if v_raffle is null then return; end if;

  begin
    perform public.refund_and_release_numbers(v_raffle, array[2], 'corto');
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('4 ' || case when v_error is not null
    then 'OK       un motivo corto se rechaza: ' || v_error
    else 'CRÍTICO  liberó con un motivo de 5 caracteres' end);
end $$;

-- 5) Sorteo sorteado
do $$
declare
  v_sorteado uuid := nullif(current_setting('test.v91.sorteado', true), '')::uuid;
  v_error text;
begin
  if v_sorteado is null then return; end if;

  begin
    perform public.refund_and_release_numbers(
      v_sorteado, array[1], 'motivo suficientemente largo para pasar'
    );
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('5 ' || case
    when v_error is not null and v_error ilike '%drawn%'
      then 'OK       un sorteo sorteado no se toca: ' || v_error
    when v_error is not null
      then 'OK       rechazado: ' || v_error
    else 'CRÍTICO  liberó números de un sorteo sorteado' end);
end $$;

select current_setting('test.v91', true) as resultado;

rollback;

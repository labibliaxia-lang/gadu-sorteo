-- =====================================================================
-- Verificador del fix de devolución — libera EXACTAMENTE lo elegido
-- =====================================================================
-- Reproduce el caso reportado: un comprador con 6 números y una devolución
-- de solo 2 (los números 2 y 4). Comprueba que la base libera esos y deja
-- intactos los otros 4, y que la devolución es la parte proporcional del pago.
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.fix', '', true);
  perform set_config('test.fix.raffle', '', true);
  perform set_config('test.fix.buyer', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.fix',
    coalesce(current_setting('test.fix', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación: comprador con 6 números vendidos y un pago de 600
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
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
  values ('fix devolucion', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 6) as n;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_buyer, v_raffle, array[1, 2, 3, 4, 5, 6], 600, 'approved')
  returning id into v_pago;

  update public.raffle_numbers
     set status = 'sold', sold_to = v_buyer, sold_at = now(), payment_id = v_pago
   where raffle_id = v_raffle;

  perform set_config('test.fix.raffle', v_raffle::text, true);
  perform set_config('test.fix.buyer', v_buyer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1) Devolver SOLO los números 2 y 4
do $$
declare
  v_raffle uuid := nullif(current_setting('test.fix.raffle', true), '')::uuid;
  v_count int;
  v_liberados int[];
  v_intactos int[];
begin
  if v_raffle is null then return; end if;

  begin
    v_count := public.refund_and_release_numbers(
      v_raffle, array[2, 4], 'el comprador devuelve dos números'
    );
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  la devolución falló: ' || sqlerrm);
    return;
  end;

  select array_agg(number order by number) into v_liberados
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'available';

  select array_agg(number order by number) into v_intactos
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'sold';

  perform pg_temp.anota('1 ' || case
    when v_count = 2 and v_liberados = array[2, 4]
      then 'OK       liberó exactamente 2 y 4'
    else 'CRÍTICO  liberados ' || coalesce(v_liberados::text, 'null') end);

  perform pg_temp.anota('2 ' || case
    when v_intactos = array[1, 3, 5, 6]
      then 'OK       los otros 4 números siguen vendidos'
    else 'CRÍTICO  siguen vendidos ' || coalesce(v_intactos::text, 'null') end);
end $$;

-- 3) La devolución es proporcional: 600 / 6 números = 100 por número
do $$
declare
  v_raffle uuid := nullif(current_setting('test.fix.raffle', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.fix.buyer', true), '')::uuid;
  v_amount numeric;
begin
  if v_raffle is null then return; end if;

  select amount into v_amount from public.refunds
   where raffle_id = v_raffle and user_id = v_buyer;

  perform pg_temp.anota('3 ' || case when v_amount = 200.00
    then 'OK       devolución de 200.00 (2 números × 100)'
    else 'CRÍTICO  devolución: ' || coalesce(v_amount::text, 'null') end);
end $$;

-- 4) La auditoría guarda los números elegidos
do $$
declare
  v_raffle uuid := nullif(current_setting('test.fix.raffle', true), '')::uuid;
  v_numeros int[];
begin
  if v_raffle is null then return; end if;

  select numbers into v_numeros from public.raffle_audit
   where raffle_id = v_raffle and action = 'refund_numbers'
   order by created_at desc limit 1;

  perform pg_temp.anota('4 ' || case when v_numeros = array[2, 4]
    then 'OK       la auditoría registró solo 2 y 4'
    else 'CRÍTICO  auditoría: ' || coalesce(v_numeros::text, 'null') end);
end $$;

-- 5) El resumen queda coherente
do $$
declare
  v_raffle uuid := nullif(current_setting('test.fix.raffle', true), '')::uuid;
  v_qty int;
  v_paid numeric;
  v_refunded numeric;
  v_net numeric;
begin
  if v_raffle is null then return; end if;

  select quantity, paid, refunded, net
    into v_qty, v_paid, v_refunded, v_net
    from public.raffle_sales_summary(v_raffle)
   limit 1;

  perform pg_temp.anota('5 ' || case
    when v_qty = 4 and v_paid = 600 and v_refunded = 200 and v_net = 400
      then 'OK       resumen: 4 números, cobrado 600, devuelto 200, neto 400'
    else 'CRÍTICO  cantidad ' || coalesce(v_qty::text, 'null')
         || ', cobrado ' || coalesce(v_paid::text, 'null')
         || ', devuelto ' || coalesce(v_refunded::text, 'null')
         || ', neto ' || coalesce(v_net::text, 'null') end);
end $$;

select current_setting('test.fix', true) as resultado;

rollback;

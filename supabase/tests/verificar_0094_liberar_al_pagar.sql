-- =====================================================================
-- Verificador 0094 — la devolución libera los números al PAGARSE
-- =====================================================================
-- Reemplaza la lógica de los verificadores 0091/0092/fix: desde la 0094 del
-- otro chat, registrar una devolución NO libera el número; se libera cuando
-- el organizador la marca como pagada.
--
-- Qué prueba:
--   1  registrar la devolución deja los números VENDIDOS
--   2  la devolución guarda qué números cubre
--   3  al marcarla pagada, se liberan esos números y solo esos
--   4  queda auditado como 'refund_number_released'
--   5  con el sorteo sorteado, se marca pagada pero NO se libera
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v94b', '', true);
  perform set_config('test.v94b.owner', '', true);
  perform set_config('test.v94b.buyer', '', true);
  perform set_config('test.v94b.raffle', '', true);
  perform set_config('test.v94b.sorteado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v94b',
    coalesce(current_setting('test.v94b', true), '') || p_linea || E'\n', true);
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
  values ('v94b pagar', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 3) as n;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_buyer, v_raffle, array[1, 2, 3], 300, 'approved')
  returning id into v_pago;

  update public.raffle_numbers
     set status = 'sold', sold_to = v_buyer, sold_at = now(), payment_id = v_pago
   where raffle_id = v_raffle;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v94b sorteado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_sorteado;

  insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
  values (v_sorteado, 1, 'sold', v_buyer, now());

  update public.raffles set status = 'drawn' where id = v_sorteado;

  perform set_config('test.v94b.owner', v_owner::text, true);
  perform set_config('test.v94b.buyer', v_buyer::text, true);
  perform set_config('test.v94b.raffle', v_raffle::text, true);
  perform set_config('test.v94b.sorteado', v_sorteado::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
end $$;

-- 1-2) Registrar la devolución de 1 y 2
do $$
declare
  v_owner uuid := nullif(current_setting('test.v94b.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v94b.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v94b.raffle', true), '')::uuid;
  v_count int;
  v_vendidos int;
  v_numeros int[];
begin
  if v_raffle is null then return; end if;

  begin
    v_count := public.refund_and_release_numbers(
      v_raffle, array[1, 2], 'el comprador pidió la devolución de dos números'
    );
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  registrar la devolución falló: ' || sqlerrm);
    return;
  end;

  select count(*) into v_vendidos
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'sold';

  select numbers into v_numeros
    from public.refunds
   where raffle_id = v_raffle and user_id = v_buyer;

  perform pg_temp.anota('1 ' || case
    when v_count = 2 and v_vendidos = 3
      then 'OK       registró la devolución y los 3 números siguen vendidos'
    else 'CRÍTICO  cubiertos ' || coalesce(v_count::text, 'null')
         || ', vendidos ' || v_vendidos end);

  perform pg_temp.anota('2 ' || case when v_numeros = array[1, 2]
    then 'OK       la devolución guardó los números 1 y 2'
    else 'CRÍTICO  números guardados: ' || coalesce(v_numeros::text, 'null') end);
end $$;

-- 3-4) Marcar pagada: liberar solo esos y auditar
do $$
declare
  v_buyer uuid := nullif(current_setting('test.v94b.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v94b.raffle', true), '')::uuid;
  v_libres int[];
  v_vendidos int[];
  v_audit int;
begin
  if v_raffle is null then return; end if;

  update public.refunds
     set status = 'paid', paid_at = now()
   where raffle_id = v_raffle and user_id = v_buyer;

  select array_agg(number order by number) into v_libres
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'available';

  select array_agg(number order by number) into v_vendidos
    from public.raffle_numbers
   where raffle_id = v_raffle and status = 'sold';

  select count(*) into v_audit
    from public.raffle_audit
   where raffle_id = v_raffle and action = 'refund_number_released';

  perform pg_temp.anota('3 ' || case
    when v_libres = array[1, 2] and v_vendidos = array[3]
      then 'OK       al pagarse liberó 1 y 2; el 3 sigue vendido'
    else 'CRÍTICO  liberados ' || coalesce(v_libres::text, 'null')
         || ', vendidos ' || coalesce(v_vendidos::text, 'null') end);

  perform pg_temp.anota('4 ' || case when v_audit >= 1
    then 'OK       la liberación quedó auditada'
    else 'CRÍTICO  no hay fila refund_number_released' end);
end $$;

-- 5) Sorteo sorteado: paga pero no libera
do $$
declare
  v_owner uuid := nullif(current_setting('test.v94b.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v94b.buyer', true), '')::uuid;
  v_sorteado uuid := nullif(current_setting('test.v94b.sorteado', true), '')::uuid;
  v_estado text;
  v_motivo text;
begin
  if v_sorteado is null then return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  begin
    perform public.refund_and_release_numbers(
      v_sorteado, array[1], 'devolución en un sorteo ya sorteado'
    );
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  registrar la devolución falló: ' || sqlerrm);
    return;
  end;

  update public.refunds
     set status = 'paid', paid_at = now()
   where raffle_id = v_sorteado and user_id = v_buyer;

  select status into v_estado
    from public.raffle_numbers
   where raffle_id = v_sorteado and number = 1;

  select reason into v_motivo
    from public.raffle_audit
   where raffle_id = v_sorteado and action = 'refund_number_released'
   order by created_at desc
   limit 1;

  perform pg_temp.anota('5 ' || case
    when v_estado = 'sold' and v_motivo ilike '%drawn%'
      then 'OK       sorteado: se pagó pero el número NO se liberó (' || v_motivo || ')'
    else 'CRÍTICO  estado ' || coalesce(v_estado, 'null')
         || ', motivo ' || coalesce(v_motivo, 'null') end);
end $$;

select current_setting('test.v94b', true) as resultado;

rollback;

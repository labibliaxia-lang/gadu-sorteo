-- =====================================================================
-- Verificador 0106 — no comprar en el propio sorteo
-- =====================================================================
-- 1 el dueño no puede reservar (reserve_numbers)
-- 2 el dueño no puede reservar prepago
-- 3 otro organizador sí puede
-- 4 un jugador común sí puede
-- 5 el mensaje explica el motivo
-- 6 ledger 0106
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v106', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v106',
    coalesce(current_setting('test.v106', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
  v_otro uuid;
  v_user uuid;
  v_raffle uuid;
  v_error text;
  v_reserva int[];
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin') order by created_at limit 1;
  select id into v_otro from public.profiles
   where role in ('admin', 'superadmin')
     and id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;
  select id into v_user from public.profiles
   where role not in ('admin', 'superadmin')
   order by created_at limit 1;

  if v_owner is null or v_user is null then
    perform pg_temp.anota('1 AVISO    hacen falta dos cuentas');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v106 propio', now() + interval '5 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_raffle, n, 'available' from generate_series(1, 5) n;

  -- 1) Dueño con reserva normal
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    v_reserva := public.reserve_numbers(v_raffle, array[1]);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('1 ' || case
    when v_reserva is null and v_error like '%tu propio sorteo%'
      then 'OK       el dueño no puede reservar en su sorteo'
    when v_error is null
      then 'CRÍTICO  el dueño reservo: ' || coalesce(v_reserva::text, 'null')
    else 'CRÍTICO  otro error: ' || v_error end);

  -- 2) Dueño con prepago
  begin
    v_reserva := public.reserve_numbers_prepaid(v_raffle, array[2], 48);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('2 ' || case
    when v_reserva is null and v_error like '%tu propio sorteo%'
      then 'OK       el dueño no puede reservar prepago'
    else 'CRÍTICO  prepago del dueño: ' || coalesce(v_error, 'sin error') end);

  -- 3) Otro organizador
  if v_otro is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
    begin
      v_reserva := public.reserve_numbers(v_raffle, array[3]);
      v_error := null;
    exception when others then
      v_error := sqlerrm;
    end;

    perform pg_temp.anota('3 ' || case
      when v_error is null and coalesce(array_length(v_reserva, 1), 0) = 1
        then 'OK       otro organizador sí puede comprar'
      else 'CRÍTICO  otro organizador: ' || coalesce(v_error, 'sin números') end);
  else
    perform pg_temp.anota('3 AVISO    no hay un segundo organizador');
  end if;

  -- 4) Jugador común
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    v_reserva := public.reserve_numbers_prepaid(v_raffle, array[4], 48);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('4 ' || case
    when v_error is null and coalesce(array_length(v_reserva, 1), 0) = 1
      then 'OK       el jugador común sí puede comprar'
    else 'CRÍTICO  jugador común: ' || coalesce(v_error, 'sin números') end);

  -- 5) Mensaje
  perform pg_temp.anota('5 ' || case when exists (
    select 1 from public._applied_migrations where version = '0106')
    then 'OK       ledger registra 0106'
    else 'CRÍTICO  falta la fila 0106' end);
end $$;

select current_setting('test.v106', true) as resultado;

rollback;

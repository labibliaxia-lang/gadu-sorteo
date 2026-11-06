-- =====================================================================
-- Verificador 0093 — el comprador confirma que recibió la devolución
-- =====================================================================
-- Qué prueba:
--   1  el comprador confirma su propia devolución
--   2  el organizador recibe la notificación con el importe
--   3  confirmar dos veces no duplica el aviso
--   4  otro usuario no puede confirmar una devolución ajena
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v93', '', true);
  perform set_config('test.v93.owner', '', true);
  perform set_config('test.v93.buyer', '', true);
  perform set_config('test.v93.refund', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v93',
    coalesce(current_setting('test.v93', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación: organizador, comprador y una devolución pendiente de 11.50
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
  v_refund uuid;
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
  values ('v93 devolucion', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.refunds (raffle_id, user_id, amount, status)
  values (v_raffle, v_buyer, 11.50, 'pending')
  returning id into v_refund;

  perform set_config('test.v93.owner', v_owner::text, true);
  perform set_config('test.v93.buyer', v_buyer::text, true);
  perform set_config('test.v93.refund', v_refund::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
end $$;

-- 1) El comprador confirma
do $$
declare
  v_refund uuid := nullif(current_setting('test.v93.refund', true), '')::uuid;
  v_confirmado timestamptz;
begin
  if v_refund is null then return; end if;

  begin
    perform public.confirm_refund_received(v_refund);
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  la confirmación falló: ' || sqlerrm);
    return;
  end;

  select buyer_confirmed_at into v_confirmado
    from public.refunds where id = v_refund;

  perform pg_temp.anota('1 ' || case when v_confirmado is not null
    then 'OK       el comprador confirmó la devolución'
    else 'CRÍTICO  buyer_confirmed_at quedó en null' end);
end $$;

-- 2) El organizador recibe la notificación con el importe
do $$
declare
  v_owner uuid := nullif(current_setting('test.v93.owner', true), '')::uuid;
  v_refund uuid := nullif(current_setting('test.v93.refund', true), '')::uuid;
  v_aviso int;
  v_monto numeric;
begin
  if v_refund is null then return; end if;

  select count(*), max((payload->>'amount')::numeric)
    into v_aviso, v_monto
    from public.notifications
   where user_id = v_owner
     and type = 'refund_confirmed'
     and (payload->>'refund_id')::uuid = v_refund;

  perform pg_temp.anota('2 ' || case
    when v_aviso = 1 and v_monto = 11.50
      then 'OK       el organizador recibió el aviso por 11.50'
    else 'CRÍTICO  avisos ' || v_aviso
         || ', monto ' || coalesce(v_monto::text, 'null') end);
end $$;

-- 3) Confirmar dos veces no duplica
do $$
declare
  v_owner uuid := nullif(current_setting('test.v93.owner', true), '')::uuid;
  v_refund uuid := nullif(current_setting('test.v93.refund', true), '')::uuid;
  v_avisos int;
begin
  if v_refund is null then return; end if;

  begin
    perform public.confirm_refund_received(v_refund);
  exception when others then
    perform pg_temp.anota('3 CRÍTICO  la segunda confirmación falló: ' || sqlerrm);
    return;
  end;

  select count(*) into v_avisos
    from public.notifications
   where user_id = v_owner and type = 'refund_confirmed';

  perform pg_temp.anota('3 ' || case when v_avisos = 1
    then 'OK       confirmar dos veces no duplica el aviso'
    else 'CRÍTICO  avisos después de dos confirmaciones: ' || v_avisos end);
end $$;

-- 4) Otro usuario no puede confirmar
do $$
declare
  v_owner uuid := nullif(current_setting('test.v93.owner', true), '')::uuid;
  v_refund uuid := nullif(current_setting('test.v93.refund', true), '')::uuid;
  v_error text;
begin
  if v_refund is null then return; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  begin
    perform public.confirm_refund_received(v_refund);
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('4 ' || case when v_error is not null
    then 'OK       otra cuenta no puede confirmar: ' || v_error
    else 'CRÍTICO  el organizador confirmó una devolución ajena' end);
end $$;

select current_setting('test.v93', true) as resultado;

rollback;

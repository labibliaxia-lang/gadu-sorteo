-- =====================================================================
-- Verificador 0094 — enlace con token para confirmar la devolución
-- =====================================================================
-- Qué prueba:
--   1  el token devuelve los datos mínimos (sorteo, importe, estado)
--   2  confirmar por token deja buyer_confirmed_at
--   3  el organizador recibe el aviso marcado como 'link'
--   4  confirmar dos veces no duplica el aviso
--   5  un token inexistente falla
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v94', '', true);
  perform set_config('test.v94.owner', '', true);
  perform set_config('test.v94.token', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v94',
    coalesce(current_setting('test.v94', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_raffle uuid;
  v_refund uuid;
  v_token uuid;
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
  values ('v94 enlace', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_raffle;

  insert into public.refunds (raffle_id, user_id, amount, status)
  values (v_raffle, v_buyer, 11.50, 'pending')
  returning id, confirmation_token into v_refund, v_token;

  perform set_config('test.v94.owner', v_owner::text, true);
  perform set_config('test.v94.token', v_token::text, true);
end $$;

-- 1) Lectura por token
do $$
declare
  v_token uuid := nullif(current_setting('test.v94.token', true), '')::uuid;
  v_titulo text;
  v_monto numeric;
  v_confirmado boolean;
begin
  if v_token is null then return; end if;

  select raffle_title, amount, confirmed
    into v_titulo, v_monto, v_confirmado
    from public.refund_by_token(v_token);

  perform pg_temp.anota('1 ' || case
    when v_titulo = 'v94 enlace' and v_monto = 11.50 and v_confirmado = false
      then 'OK       el token devuelve sorteo, importe y estado'
    else 'CRÍTICO  título ' || coalesce(v_titulo, 'null')
         || ', monto ' || coalesce(v_monto::text, 'null')
         || ', confirmado ' || coalesce(v_confirmado::text, 'null') end);
end $$;

-- 2) Confirmación por token
do $$
declare
  v_token uuid := nullif(current_setting('test.v94.token', true), '')::uuid;
  v_ok boolean;
  v_confirmado timestamptz;
begin
  if v_token is null then return; end if;

  begin
    v_ok := public.confirm_refund_by_token(v_token);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  la confirmación falló: ' || sqlerrm);
    return;
  end;

  select buyer_confirmed_at into v_confirmado
    from public.refunds where confirmation_token = v_token;

  perform pg_temp.anota('2 ' || case
    when v_ok = true and v_confirmado is not null
      then 'OK       confirmar por enlace deja la constancia'
    else 'CRÍTICO  ok ' || coalesce(v_ok::text, 'null')
         || ', confirmado ' || coalesce(v_confirmado::text, 'null') end);
end $$;

-- 3) El organizador recibe el aviso por enlace
do $$
declare
  v_owner uuid := nullif(current_setting('test.v94.owner', true), '')::uuid;
  v_avisos int;
  v_via text;
begin
  if v_owner is null then return; end if;

  select count(*), max(payload->>'via')
    into v_avisos, v_via
    from public.notifications
   where user_id = v_owner and type = 'refund_confirmed';

  perform pg_temp.anota('3 ' || case
    when v_avisos = 1 and v_via = 'link'
      then 'OK       el organizador recibió el aviso marcado como enlace'
    else 'CRÍTICO  avisos ' || v_avisos
         || ', via ' || coalesce(v_via, 'null') end);
end $$;

-- 4) Confirmar dos veces no duplica
do $$
declare
  v_token uuid := nullif(current_setting('test.v94.token', true), '')::uuid;
  v_owner uuid := nullif(current_setting('test.v94.owner', true), '')::uuid;
  v_avisos int;
begin
  if v_token is null then return; end if;

  perform public.confirm_refund_by_token(v_token);

  select count(*) into v_avisos
    from public.notifications
   where user_id = v_owner and type = 'refund_confirmed';

  perform pg_temp.anota('4 ' || case when v_avisos = 1
    then 'OK       confirmar de nuevo no duplica el aviso'
    else 'CRÍTICO  avisos: ' || v_avisos end);
end $$;

-- 5) Token inexistente
do $$
declare
  v_error text;
begin
  begin
    perform public.confirm_refund_by_token(gen_random_uuid());
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  perform pg_temp.anota('5 ' || case when v_error is not null
    then 'OK       un token inexistente falla: ' || v_error
    else 'CRÍTICO  confirmó con un token inventado' end);
end $$;

select current_setting('test.v94', true) as resultado;

rollback;

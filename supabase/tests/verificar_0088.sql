-- =====================================================================
-- Verificador 0088 — estados terminales y ventana de venta
-- =====================================================================
-- Qué prueba:
--   1  control: el dueño puede cerrar un sorteo activo
--   2  ataque: un sorteo cancelado no vuelve a activo
--   3  ataque: un sorteo sorteado no vuelve a activo
--   4  control: antes de la fecha se puede reservar
--   5  ataque: después de la fecha no se puede reservar
--
-- Todo en una transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v88', '', true);
  perform set_config('test.v88.r1', '', true);
  perform set_config('test.v88.futuro', '', true);
  perform set_config('test.v88.pasado', '', true);
  perform set_config('test.v88.sorteado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v88',
    coalesce(current_setting('test.v88', true), '') || p_linea || E'\n', true);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: dos usuarios, tres sorteos
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_id uuid;
begin
  select id into v_owner from public.profiles order by created_at limit 1;
  select id into v_buyer from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  if v_owner is null or v_buyer is null then
    perform pg_temp.anota('1 AVISO    hacen falta dos cuentas para probar');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v88 cerrar', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_id;
  perform set_config('test.v88.r1', v_id::text, true);

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v88 futuro', now() + interval '10 days', 100, 'active', v_owner)
  returning id into v_id;
  perform set_config('test.v88.futuro', v_id::text, true);

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_id, n, 'available' from generate_series(1, 3) as n;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v88 pasado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_id;
  perform set_config('test.v88.pasado', v_id::text, true);

  insert into public.raffle_numbers (raffle_id, number, status)
  select v_id, n, 'available' from generate_series(1, 3) as n;

  -- Un sorteo ya sorteado exige fecha pasada: `enforce_draw_date` no deja
  -- marcar 'drawn' antes de la fecha anunciada.
  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v88 sorteado', now() - interval '1 day', 100, 'active', v_owner)
  returning id into v_id;
  perform set_config('test.v88.sorteado', v_id::text, true);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  perform set_config('test.v88.buyer', v_buyer::text, true);
end $$;

-- ---------------------------------------------------------------------
-- 1) Control: cerrar
-- ---------------------------------------------------------------------
set local role authenticated;

do $$
declare v_id uuid := nullif(current_setting('test.v88.r1', true), '')::uuid;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set status = 'closed' where id = v_id;

    if exists (select 1 from public.raffles where id = v_id and status = 'closed') then
      perform pg_temp.anota('1 OK       control: el dueño cierra un sorteo activo');
    else
      perform pg_temp.anota('1 CRÍTICO  el cambio de estado no se aplicó');
    end if;
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  cerrar falló: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 2) Ataque: cancelado -> activo
-- ---------------------------------------------------------------------
update public.raffles set status = 'cancelled'
 where id = nullif(current_setting('test.v88.r1', true), '')::uuid;

set local role authenticated;

do $$
declare v_id uuid := nullif(current_setting('test.v88.r1', true), '')::uuid;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set status = 'active' where id = v_id;
    perform pg_temp.anota('2 CRÍTICO  reabrió un sorteo cancelado');
  exception when check_violation then
    perform pg_temp.anota('2 OK       cancelado no se reabre: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 3) Ataque: sorteado -> activo
-- ---------------------------------------------------------------------
update public.raffles set status = 'drawn'
 where id = nullif(current_setting('test.v88.sorteado', true), '')::uuid;

set local role authenticated;

do $$
declare v_id uuid := nullif(current_setting('test.v88.sorteado', true), '')::uuid;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set status = 'active' where id = v_id;
    perform pg_temp.anota('3 CRÍTICO  reabrió un sorteo sorteado');
  exception when others then
    if sqlerrm ilike '%sorteado%' or sqlerrm ilike '%no se puede cambiar%' then
      perform pg_temp.anota('3 OK       sorteado no se reabre: ' || sqlerrm);
    else
      perform pg_temp.anota('3 OTRO     falló por otro motivo: ' || sqlerrm);
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 4) Control: reservar antes de la fecha
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v88.futuro', true), '')::uuid;
  v_res int[];
begin
  if v_id is null then return; end if;

  begin
    v_res := public.reserve_numbers(v_id, array[1]);
    perform pg_temp.anota('4 ' || case when v_res = array[1]
      then 'OK       control: se reserva antes de la fecha'
      else 'CRÍTICO  reservó ' || coalesce(v_res::text, 'null') end);
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  no pudo reservar antes de la fecha: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5) Ataque: reservar después de la fecha
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v88.pasado', true), '')::uuid;
  v_res int[];
begin
  if v_id is null then return; end if;

  begin
    v_res := public.reserve_numbers(v_id, array[2]);
    perform pg_temp.anota('5 CRÍTICO  reservó después de la fecha: ' || coalesce(v_res::text, 'null'));
  exception when others then
    if sqlerrm ilike '%fecha%' then
      perform pg_temp.anota('5 OK       después de la fecha no se reserva: ' || sqlerrm);
    else
      perform pg_temp.anota('5 OTRO     falló por otro motivo: ' || sqlerrm);
    end if;
  end;
end $$;

select current_setting('test.v88', true) as resultado;

rollback;

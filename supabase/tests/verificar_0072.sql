-- =====================================================================
-- Verificación de 0072 — ¿se pueden inventar números vendidos?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK.
-- Devuelve SIEMPRE una celda, aunque falte la migración.
--
--   1  ¿el rol authenticated perdió el INSERT en raffle_numbers?
--   2  ¿quedó alguna política de INSERT viva?
--   3  montaje
--   4  control: el grid se sigue creando por create_raffle_numbers
--   5  ataque: insertar una fila 'sold' a mano -> permiso denegado
--
-- El control (4) corre ANTES del ataque a propósito, y cuenta solo el rango
-- 1..10 del grid: si contara todas las filas, el número falso del ataque lo
-- haría fallar en falso.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0072', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0072',
    coalesce(current_setting('test.verif0072', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) Permiso de tabla
-- ---------------------------------------------------------------------
do $$
declare v_priv boolean;
begin
  select has_table_privilege('authenticated', 'public.raffle_numbers', 'insert')
    into v_priv;

  perform pg_temp.anota('1 ' || case when v_priv
    then 'CRÍTICO  authenticated todavía puede insertar en raffle_numbers -> aplicar 0072'
    else 'OK       insert directo revocado para authenticated' end);
end $$;

-- ---------------------------------------------------------------------
-- 2) Políticas de INSERT que hayan quedado
-- ---------------------------------------------------------------------
do $$
declare v_pol int;
begin
  select count(*) into v_pol
  from pg_policies
  where schemaname = 'public'
    and tablename = 'raffle_numbers'
    and cmd = 'INSERT';

  perform pg_temp.anota('2 ' || case when v_pol = 0
    then 'OK       sin políticas de INSERT vivas'
    else 'AVISO    quedan ' || v_pol || ' política/s de INSERT (sin grant no sirven, pero conviene borrarlas)' end);
end $$;

-- ---------------------------------------------------------------------
-- 3) Montaje: un organizador y un sorteo suyo
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_raffle uuid := gen_random_uuid();
begin
  select p.id into v_admin
  from public.profiles p
  where p.role in ('admin', 'superadmin') and p.is_banned is not true
  order by p.created_at
  limit 1;

  if v_admin is null then
    perform pg_temp.anota('3 AVISO    no hay organización admin para montar la prueba');
    return;
  end if;

  perform set_config('test.verif0072.admin', v_admin::text, true);
  perform set_config('test.verif0072.raffle', v_raffle::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values (v_raffle, 'prueba 0072', now() + interval '10 days', 100, 'active', v_admin);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  perform pg_temp.anota('3 OK       sorteo de prueba montado para el organizador');
exception when others then
  perform pg_temp.anota('3 CRÍTICO  no se pudo montar la prueba: ' || sqlerrm);
end $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- 4) Control: el grid se sigue creando por la RPC (sobre el sorteo limpio)
-- ---------------------------------------------------------------------
do $$
declare
  v_raffle uuid := nullif(current_setting('test.verif0072.raffle', true), '')::uuid;
  v_total int;
begin
  if v_raffle is null then
    perform pg_temp.anota('4 AVISO    se omite: no hay datos');
    return;
  end if;

  begin
    perform public.create_raffle_numbers(v_raffle, 10);

    -- Solo el rango del grid: el ataque inserta el 777 y contaminaría el conteo.
    select count(*) into v_total
    from public.raffle_numbers
    where raffle_id = v_raffle
      and number between 1 and 10;

    perform pg_temp.anota('4 ' || case when v_total = 10
      then 'OK       create_raffle_numbers sigue creando el grid (10 números)'
      else 'CRÍTICO  el grid quedó con ' || v_total || '/10 números: el revoke rompió la creación de sorteos' end);
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  create_raffle_numbers falló: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5) El ataque
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid := nullif(current_setting('test.verif0072.admin', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.verif0072.raffle', true), '')::uuid;
begin
  if v_admin is null then
    perform pg_temp.anota('5 AVISO    se omite: no hay datos');
    return;
  end if;

  begin
    insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
    values (v_raffle, 777, 'sold', v_admin, now());

    perform pg_temp.anota('5 CRÍTICO  el organizador insertó un número vendido falso (esperado si 0072 no está aplicada)');
  exception when others then
    perform pg_temp.anota('5 ' || case
      when sqlerrm ilike '%permission denied%' then 'OK       permiso denegado: ' || sqlerrm
      when sqlerrm ilike '%row-level security%' then 'OK       bloqueado por RLS: ' || sqlerrm
      else 'OTRO     rechazó por otro motivo: ' || sqlerrm end);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0072', true) as resultado;

rollback;

-- =====================================================================
-- Verificación de 0069 — ¿reserve_numbers sigue devolviendo reservas viejas?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK.
-- Devuelve UNA celda con una línea por comprobación.
--
-- Monta un sorteo de prueba con seis números:
--   1,2  libres            -> el primer checkout los toma; el segundo NO
--   3    reservado por mí, ya vencido -> debe poder retomarse
--   4    libre, pedido repetido [4,4,4] -> se reserva una sola vez
--   5    reservado por OTRO usuario (vigente) -> no se puede tomar
--   6    vendido -> no se puede tomar
--
-- La prueba clave es la 3: con la versión vieja devolvía [1,2] otra vez y el
-- checkout creaba un segundo pago (doble cobro).
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0069', '', true);
  perform set_config('test.verif0069.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0069',
    coalesce(current_setting('test.verif0069', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) ¿Está cargada la versión nueva?
-- ---------------------------------------------------------------------
do $$
declare v_new boolean;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reserve_numbers'
  ) then
    perform pg_temp.anota('1 FALTA    no existe reserve_numbers');
    return;
  end if;

  select pg_get_functiondef('public.reserve_numbers'::regproc) like '%with nuevos%'
    into v_new;

  perform pg_temp.anota('1 ' || case when v_new
    then 'OK       la función tiene el patrón de 0069 (CTE + returning)'
    else 'FALTA    la función sigue siendo la de 0001: aplicar 0069' end);
end $$;

-- ---------------------------------------------------------------------
-- 2) Montaje
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  v_other uuid;
  v_raffle uuid := gen_random_uuid();
begin
  select p.id into v_uid
  from public.profiles p
  where p.role = 'user'
  order by p.created_at desc
  limit 1;

  select p.id into v_other
  from public.profiles p
  where p.id <> v_uid
  order by p.created_at
  limit 1;

  if v_uid is null or v_other is null then
    perform pg_temp.anota('2 AVISO    hacen falta dos usuarios con perfil para montar la prueba');
    return;
  end if;

  perform set_config('test.verif0069.raffle', v_raffle::text, true);
  perform set_config('test.verif0069.uid', v_uid::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values (v_raffle, 'prueba 0069', now() + interval '2 days', 100, 'active', v_uid);

  insert into public.raffle_numbers (raffle_id, number, status, reserved_by, reserved_until)
  values
    (v_raffle, 1, 'available', null, null),
    (v_raffle, 2, 'available', null, null),
    (v_raffle, 3, 'reserved',  v_uid,   now() - interval '1 minute'),
    (v_raffle, 4, 'available', null, null),
    (v_raffle, 5, 'reserved',  v_other, now() + interval '10 minutes'),
    (v_raffle, 6, 'sold',      null,    null);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  perform pg_temp.anota('2 OK       datos montados (6 números, un tercero y uno vendido)');
exception when others then
  perform pg_temp.anota('2 CRÍTICO  no se pudo montar la prueba: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- 3-4) Primer y segundo checkout del mismo carrito
-- ---------------------------------------------------------------------
set local role authenticated;

do $$
declare
  v_raffle uuid := nullif(current_setting('test.verif0069.raffle', true), '')::uuid;
  v_primero int[];
  v_segundo int[];
begin
  if v_raffle is null then return; end if;

  begin
    v_primero := public.reserve_numbers(v_raffle, array[1, 2]);
    perform pg_temp.anota('3 ' || case when v_primero = array[1, 2]
      then 'OK       primer checkout reservó [1,2]'
      else 'CRÍTICO  el primer checkout devolvió ' || coalesce(v_primero::text, 'null') end);

    -- El mismo carrito, otra vez: acá es donde el cliente pagaba dos veces.
    v_segundo := public.reserve_numbers(v_raffle, array[1, 2]);
    perform pg_temp.anota('4 ' || case
      when v_segundo = array[]::int[] then 'OK       segundo checkout devuelve VACÍO: el checkout responde 409, no cobra dos veces'
      when v_segundo = array[1, 2] then 'CRÍTICO  sigue devolviendo [1,2]: doble cobro abierto, aplicar 0069'
      else 'OTRO     devolvió ' || coalesce(v_segundo::text, 'null') end);
  exception when others then
    perform pg_temp.anota('3-4 CRÍTICO  la función falló: ' || sqlerrm);
  end;
end $$;

-- 5) Reserva propia ya vencida: se retoma Y se renueva la ventana
do $$
declare
  v_raffle uuid := nullif(current_setting('test.verif0069.raffle', true), '')::uuid;
  v_res int[];
  v_until timestamptz;
begin
  if v_raffle is null then return; end if;

  begin
    v_res := public.reserve_numbers(v_raffle, array[3]);

    select reserved_until into v_until
    from public.raffle_numbers
    where raffle_id = v_raffle and number = 3;

    -- La versión vieja también devuelve [3], pero deja `reserved_until` en el
    -- pasado: el cron liberaría el número después de cobrarlo. Por eso se mira
    -- la fecha, no solo el array.
    perform pg_temp.anota('5 ' || case
      when v_res = array[3] and v_until > now()
        then 'OK       la reserva propia vencida se retoma y la ventana se renueva'
      when v_res = array[3]
        then 'CRÍTICO  devolvió [3] pero NO renovó la ventana (' || coalesce(v_until::text, 'null')
          || '): el cron lo liberaría después de cobrarlo'
      else 'CRÍTICO  devolvió ' || coalesce(v_res::text, 'null') end);
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  falló: ' || sqlerrm);
  end;
end $$;

-- 6-7) Ajeno, vendido y pedido con repetidos
do $$
declare
  v_raffle uuid := nullif(current_setting('test.verif0069.raffle', true), '')::uuid;
  v_ajeno int[];
  v_vendido int[];
  v_dup int[];
begin
  if v_raffle is null then return; end if;

  begin
    v_ajeno := public.reserve_numbers(v_raffle, array[5]);
    v_vendido := public.reserve_numbers(v_raffle, array[6]);
    v_dup := public.reserve_numbers(v_raffle, array[4, 4, 4]);

    perform pg_temp.anota('6 ' || case when v_ajeno = array[]::int[] and v_vendido = array[]::int[]
      then 'OK       número de otro usuario y número vendido: no se tocan'
      else 'CRÍTICO  tomó un número ajeno (' || coalesce(v_ajeno::text, 'null')
        || ') o uno vendido (' || coalesce(v_vendido::text, 'null') || ')' end);

    perform pg_temp.anota('7 ' || case when v_dup = array[4]
      then 'OK       pedido repetido [4,4,4]: reserva y devuelve un solo 4'
      else 'CRÍTICO  devolvió ' || coalesce(v_dup::text, 'null') end);
  exception when others then
    perform pg_temp.anota('6-7 CRÍTICO  falló: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0069', true) as resultado;

rollback;

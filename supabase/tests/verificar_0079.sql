-- =====================================================================
-- Verificador 0079 — las devoluciones usan lo cobrado
-- =====================================================================
-- Monta un escenario controlado sobre un sorteo real activo SIN números
-- vendidos, y comprueba tres cosas:
--   1  la función lee `payments.amount`
--   2  el comprador con pago cobra lo que pagó (aunque el precio haya cambiado)
--   3  el comprador manual cae al precio vigente (no hay otro registro)
--
-- Todo dentro de una transacción que termina en ROLLBACK: no crea pagos,
-- no vende números y no cancela el sorteo de verdad.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v79', '', true);
  perform set_config('test.v79.raffle', '', true);
  perform set_config('test.v79.a', '', true);
  perform set_config('test.v79.b', '', true);
  perform set_config('test.v79.precio', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.v79',
    coalesce(current_setting('test.v79', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) Declaración
-- ---------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_raffle';

  perform pg_temp.anota('1 ' || case
    when v_def is null then 'FALTA    cancel_raffle no existe'
    when v_def ilike '%payments%' and v_def ilike '%amount%'
      then 'OK       la devolución se calcula con payments.amount'
    else 'FALTA    la función sigue usando el precio -> aplicar 0079' end);
end $$;

-- ---------------------------------------------------------------------
-- Preparación del escenario
-- ---------------------------------------------------------------------
do $$
declare
  v_raffle record;
  v_a uuid;
  v_b uuid;
  v_pago uuid;
  v_nums int[];
  v_precio numeric;
begin
  select r.* into v_raffle
    from public.raffles r
   where r.status = 'active'
     and r.price_per_number > 0
     and not exists (
       select 1 from public.raffle_numbers n
        where n.raffle_id = r.id and n.status = 'sold'
     )
   order by r.created_at desc
   limit 1;

  if v_raffle.id is null then
    perform pg_temp.anota('2 AVISO    no hay un sorteo activo sin números vendidos para probar');
    perform pg_temp.anota('3 AVISO    sin escenario');
    perform pg_temp.anota('4 AVISO    sin escenario');
    return;
  end if;

  -- array de 3 números
  select array_agg(number order by number) into v_nums
    from (
      select n.number
        from public.raffle_numbers n
       where n.raffle_id = v_raffle.id and n.status = 'available'
       order by n.number
       limit 3
    ) s;

  if v_nums is null or array_length(v_nums, 1) < 3 then
    perform pg_temp.anota('2 AVISO    el sorteo no tiene 3 números disponibles');
    perform pg_temp.anota('3 AVISO    sin escenario');
    perform pg_temp.anota('4 AVISO    sin escenario');
    return;
  end if;

  select p.id into v_a
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id <> v_raffle.created_by
   order by p.created_at
   limit 1;

  select p.id into v_b
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id <> v_raffle.created_by
     and p.id <> coalesce(v_a, '00000000-0000-0000-0000-000000000000'::uuid)
   order by p.created_at
   limit 1;

  if v_a is null or v_b is null then
    perform pg_temp.anota('2 AVISO    hacen falta dos compradores con perfil');
    perform pg_temp.anota('3 AVISO    sin escenario');
    perform pg_temp.anota('4 AVISO    sin escenario');
    return;
  end if;

  v_precio := v_raffle.price_per_number;

  -- Pago por DOS números, con un importe distinto al precio actual a propósito.
  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_a, v_raffle.id, v_nums[1:2], round(v_precio * 2 - 1, 2), 'approved')
  returning id into v_pago;

  update public.raffle_numbers
     set status = 'sold', sold_to = v_a, sold_at = now(), payment_id = v_pago
   where raffle_id = v_raffle.id and number = any (v_nums[1:2]);

  -- Un número del camino manual (transferencia): sin pago asociado.
  update public.raffle_numbers
     set status = 'sold', sold_to = v_b, sold_at = now(), payment_id = null
   where raffle_id = v_raffle.id and number = v_nums[3];

  perform set_config('test.v79.raffle', v_raffle.id::text, true);
  perform set_config('test.v79.a', v_a::text, true);
  perform set_config('test.v79.b', v_b::text, true);
  perform set_config('test.v79.precio', v_precio::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_raffle.created_by, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 2) Cancelar como el organizador
-- ---------------------------------------------------------------------
set local role authenticated;

do $$
declare
  v_id uuid := nullif(current_setting('test.v79.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    v_n := public.cancel_raffle(v_id, 'prueba 0079');
    perform pg_temp.anota('2 ' || case when v_n = 2
      then 'OK       genera una devolución por comprador (2)'
      else 'AVISO    generó ' || coalesce(v_n::text, 'null') || ' devoluciones' end);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  la cancelación falló: ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 3-4) Importes
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v79.raffle', true), '')::uuid;
  v_a uuid := nullif(current_setting('test.v79.a', true), '')::uuid;
  v_b uuid := nullif(current_setting('test.v79.b', true), '')::uuid;
  v_precio numeric := nullif(current_setting('test.v79.precio', true), '')::numeric;
  v_importe_a numeric;
  v_importe_b numeric;
  v_esperado_a numeric;
begin
  if v_id is null then return; end if;

  select amount into v_importe_a from public.refunds where raffle_id = v_id and user_id = v_a;
  select amount into v_importe_b from public.refunds where raffle_id = v_id and user_id = v_b;

  v_esperado_a := round(v_precio * 2 - 1, 2);

  perform pg_temp.anota('3 ' || case
    when v_importe_a is null then 'CRÍTICO  no hay devolución para el comprador con pago'
    when v_importe_a = v_esperado_a
      then 'OK       devuelve lo cobrado (' || v_importe_a || '), no el precio de hoy (' || round(v_precio * 2, 2) || ')'
    else 'CRÍTICO  devuelve ' || v_importe_a || ' y lo cobrado era ' || v_esperado_a end);

  perform pg_temp.anota('4 ' || case
    when v_importe_b is null then 'CRÍTICO  no hay devolución para el comprador manual'
    when v_importe_b = round(v_precio, 2)
      then 'OK       el comprador manual cae al precio vigente (' || v_importe_b || ')'
    else 'OTRO     devuelve ' || v_importe_b || ' y se esperaba ' || round(v_precio, 2) end);
end $$;

select current_setting('test.v79', true) as resultado;

rollback;

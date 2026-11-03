-- =====================================================================
-- Prueba manual de aislamiento RLS entre organizadores
-- =====================================================================
-- Cómo usarla:
--   1. En el SQL Editor de Supabase, reemplazá los tres valores de abajo:
--      UUID_A     = organizador que hace la prueba (debe tener >= 1 sorteo)
--      UUID_B     = OTRO organizador (distinto de A)
--      SORTEO_B   = un sorteo de UUID_B
--   2. Ejecutá el bloque completo.
--   3. Si no aparece ningún error, pasó. El ROLLBACK no deja cambios.
--
-- Cómo funciona: se cambia al rol `authenticated` (el de la app) y se simula
-- el JWT de A. Así las consultas pasan por RLS como en producción. Si alguna
-- cuenta pudiera leer o modificar datos de la otra, el DO lanza FALLA.
-- =====================================================================

begin;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a', -- <UUID_A>
  true
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-4000-8000-00000000000a', -- <UUID_A>
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  v_a uuid := '00000000-0000-4000-8000-00000000000a'; -- <UUID_A>
  v_b uuid := '00000000-0000-4000-8000-00000000000b'; -- <UUID_B>
  v_raffle_b uuid := '00000000-0000-4000-8000-0000000000b1'; -- <SORTEO_B>
  v int;
begin
  if v_a = '00000000-0000-4000-8000-00000000000a'
     or v_b = '00000000-0000-4000-8000-00000000000b'
     or v_raffle_b = '00000000-0000-4000-8000-0000000000b1' then
    raise exception 'Reemplazá UUID_A, UUID_B y SORTEO_B por valores reales antes de correr la prueba';
  end if;

  -- Control: A tiene que ver al menos un sorteo propio; si no, la prueba es vacía.
  select count(*) into v from public.raffles where created_by = v_a;
  if v = 0 then
    raise exception 'A no tiene sorteos propios: elegí otro UUID_A para que la prueba tenga sentido';
  end if;

  -- 1) A no puede ver sorteos de B.
  select count(*) into v from public.raffles where created_by = v_b;
  if v <> 0 then
    raise exception 'FALLA: A ve % sorteos de B', v;
  end if;

  -- 2) A no puede ver números de los sorteos de B.
  select count(*) into v
  from public.raffle_numbers rn
  join public.raffles r on r.id = rn.raffle_id
  where r.created_by = v_b;
  if v <> 0 then
    raise exception 'FALLA: A ve % números de B', v;
  end if;

  -- 3) A no puede ver premios de los sorteos de B.
  select count(*) into v
  from public.prizes p
  join public.raffles r on r.id = p.raffle_id
  where r.created_by = v_b;
  if v <> 0 then
    raise exception 'FALLA: A ve % premios de B', v;
  end if;

  -- 4) A no puede ver pagos de los sorteos de B.
  select count(*) into v
  from public.payments pay
  join public.raffles r on r.id = pay.raffle_id
  where r.created_by = v_b;
  if v <> 0 then
    raise exception 'FALLA: A ve % pagos de B', v;
  end if;

  -- 5) A no puede modificar números del sorteo de B.
  update public.raffle_numbers
  set status = status
  where raffle_id = v_raffle_b;

  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FALLA: A modificó % números del sorteo de B', v;
  end if;

  raise notice 'OK: A no ve ni modifica datos de B (sorteos, números, premios, pagos)';
end $$;

reset role;
rollback;

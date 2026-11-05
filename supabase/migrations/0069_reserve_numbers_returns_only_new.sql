-- =====================================================================
-- 0069 — reserve_numbers devuelve solo lo que reservó
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, CRÍTICO nº 2 — doble cobro):
--   La versión de 0001:201 reservaba bien y después seleccionaba
--   `where raffle_id = ... and number = any (p_numbers) and status = 'reserved'
--    and reserved_by = v_uid` (0001:233-239).
--
--   Ese `select` no devuelve «lo que reservé ahora»: devuelve todo lo que el
--   usuario tenga reservado entre los números pedidos, incluido lo reservado en
--   un checkout anterior. Consecuencia: el segundo checkout del mismo carrito
--   pasaba la validación de `app/api/checkout/route.ts:156`, creaba un segundo
--   `payments` y una segunda preferencia, y el cliente podía pagar dos veces los
--   mismos números.
--
--   Fallo hermano: una reserva propia ya vencida seguía contando como válida
--   (status 'reserved' con `reserved_until` en el pasado), así que el pago se
--   creaba sobre números que el cron iba a liberar en minutos.
--
-- Qué hace ahora (mismo patrón que `reserve_numbers_prepaid`, 0029:107-132):
--   1. Libera las reservas propias ya vencidas de ese sorteo.
--   2. Reserva solo los números disponibles y devuelve EXACTAMENTE esos, con
--      `returning` dentro de un CTE.
--
--   La firma no cambia (`uuid, int[]` → `int[]`), así que los permisos de
--   0001:383-384 y la llamada del checkout siguen igual.
--
-- Idempotente.
-- =====================================================================

create or replace function public.reserve_numbers(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requested int[];
  v_reserved int[];
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  -- Sin duplicados: pedir [4,4,4] reserva y devuelve un solo 4.
  select coalesce(array_agg(distinct x order by x), array[]::int[])
    into v_requested
    from unnest(coalesce(p_numbers, array[]::int[])) as x;

  if array_length(v_requested, 1) is null then
    return array[]::int[];
  end if;

  -- 1) Las reservas propias vencidas se sueltan primero: si quedaran
  --    'reserved' con reserved_until pasado, el cron las liberaría después de
  --    que el usuario pagó.
  update public.raffle_numbers
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and reserved_by = v_uid
     and reserved_until is not null
     and reserved_until < now();

  -- 2) Reserva solo lo disponible y devuelve EXACTAMENTE lo reservado ahora.
  --    Es la parte que mata el doble cobro: un segundo checkout del mismo
  --    carrito devuelve vacío y el checkout responde 409 en vez de cobrar.
  with nuevos as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = now() + interval '10 minutes'
     where raffle_id = p_raffle_id
       and number = any (v_requested)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number order by number), array[]::int[])
    into v_reserved
    from nuevos;

  return v_reserved;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0069', 'reserve_numbers devuelve solo lo reservado en la llamada y suelta las reservas propias vencidas')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación rápida (prueba completa: supabase/tests/verificar_0069.sql)
-- =====================================================================
--   select pg_get_functiondef('public.reserve_numbers'::regproc) like '%with nuevos%'
--     as tiene_el_patron_nuevo;
--
-- Rollback: volver al cuerpo de 0001:201.
-- =====================================================================

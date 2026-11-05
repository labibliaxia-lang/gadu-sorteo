-- =====================================================================
-- 0076 — reserve_numbers valida lo mismo que el prepago
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, MEDIA nº 12):
--   `reserve_numbers` (0001:201, reescrita en 0069) no mira dos cosas que
--   `reserve_numbers_prepaid` sí aplica desde 0037/0040:
--     · la cuenta suspendida (`profiles.is_banned`), y
--     · el techo de 20 reservas por hora por usuario.
--   El ban de Auth no invalida un access token ya emitido por hasta una hora,
--   así que un suspendido podía seguir barriendo números por el camino de
--   Mercado Pago. Y sin tope, una sola cuenta podía reservar en bucle y
--   inmovilizar el inventario hasta que venciera cada TTL.
--
-- Además se alinean dos validaciones que el camino prepago ya hacía y este no:
--   máximo 100 números por compra y rango 1..10000.
--
-- Qué NO cambia:
--   · la firma (`uuid, int[]` → `int[]`) ni los permisos de 0001:383-384;
--   · el patrón que mata el doble cobro (CTE `nuevos` + `returning`, 0069);
--   · la liberación de las reservas propias vencidas antes de reservar.
--   La clave del limitador es la misma que usa el prepago (`reserve:<uid>`), así
--   que los dos caminos comparten el presupuesto de 20/hora.
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

  -- 1) Cuenta suspendida: el token viejo sigue siendo válido hasta una hora.
  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
  end if;

  -- 2) Techo de 20 reservas por hora, compartido con el camino prepago.
  if not public.check_rate_limit('reserve:' || v_uid::text, 20, 3600) then
    raise exception 'Demasiadas reservas seguidas. Probá de nuevo en unos minutos.';
  end if;

  -- Sin duplicados: pedir [4,4,4] reserva y devuelve un solo 4.
  select coalesce(array_agg(distinct x order by x), array[]::int[])
    into v_requested
    from unnest(coalesce(p_numbers, array[]::int[])) as x;

  if array_length(v_requested, 1) is null then
    return array[]::int[];
  end if;

  -- 3) Mismas validaciones de volumen y rango que el prepago.
  if array_length(v_requested, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(v_requested) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  -- 4) Las reservas propias vencidas se sueltan primero: si quedaran
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

  -- 5) Reserva solo lo disponible y devuelve EXACTAMENTE lo reservado ahora.
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
    values ('0076', 'reserve_numbers valida suspendidos, tope de 20/h, maximo 100 numeros y rango')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba: supabase/tests/verificar_0076.sql)
-- =====================================================================
-- Rollback: volver al cuerpo de 0069.
-- =====================================================================

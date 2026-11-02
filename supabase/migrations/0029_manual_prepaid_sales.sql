-- =====================================================================
-- 0029 — Prepago manual por WhatsApp (idempotente)
-- =====================================================================
-- Flujo nuevo: el comprador reserva números y manda el comprobante por
-- WhatsApp; el organizador los marca como pagados a mano desde el panel.
--
-- 1) Reafirma organizer_mark_sold (0016). Es la venta manual que ya usa el
--    panel de números. Se vuelve a crear para que esta migración baste por sí
--    sola aunque 0016 no haya corrido, y conserva el chequeo de dueño.
-- 2) reserve_numbers_prepaid: reserva con hold largo (48 h por defecto) y
--    devuelve SOLO los números que reservó ESTA llamada. Las reservas previas
--    del mismo usuario no se devuelven, así un doble clic no duplica el pago.
-- 3) organizer_mark_reserved_sold: reserved -> sold atómico y estricto. Solo
--    toca números reservados y con comprador; si alguno dejó de estar
--    reservado, revierte todo y avisa. Es la operación de "Marcar como Pagado".
--
-- Nota de seguridad: las tres funciones son SECURITY DEFINER con search_path
-- fijo; la venta manual exige ser admin Y dueño del sorteo (o superadmin).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Venta manual del organizador (reafirma 0016)
-- ---------------------------------------------------------------------
create or replace function public.organizer_mark_sold(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  update public.raffle_numbers
  set status = 'sold',
      sold_to = reserved_by,
      sold_at = now(),
      payment_id = null,
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status in ('available', 'reserved');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Reserva prepaga con hold largo
-- ---------------------------------------------------------------------
create or replace function public.reserve_numbers_prepaid(
  p_raffle_id uuid,
  p_numbers int[],
  p_hold_hours integer default 48
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hold integer;
  v_reserved int[];
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is null then
    raise exception 'Elegí al menos un número';
  end if;

  if array_length(p_numbers, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(p_numbers) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  -- Techo de 72 h: una reserva olvidada no puede inmovilizar el sorteo.
  v_hold := greatest(1, least(coalesce(p_hold_hours, 48), 72));

  -- Libera solo las reservas vencidas del propio usuario en este sorteo.
  update public.raffle_numbers
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and status = 'reserved'
    and reserved_by = v_uid
    and reserved_until is not null
    and reserved_until < now();

  with updated as (
    update public.raffle_numbers
    set status = 'reserved',
        reserved_by = v_uid,
        reserved_until = now() + make_interval(hours => v_hold)
    where raffle_id = p_raffle_id
      and number = any (p_numbers)
      and status = 'available'
    returning number
  )
  select coalesce(array_agg(number), array[]::int[])
  into v_reserved
  from updated;

  return v_reserved;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Marcar una reserva como pagada (estricto, todo o nada)
-- ---------------------------------------------------------------------
create or replace function public.organizer_mark_reserved_sold(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_expected int;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is null then
    raise exception 'Elegí al menos un número';
  end if;

  v_expected := array_length(p_numbers, 1);

  update public.raffle_numbers
  set status = 'sold',
      sold_to = reserved_by,
      sold_at = now(),
      payment_id = null,
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by is not null;

  get diagnostics v_count = row_count;

  -- Todo o nada: si un número ya no estaba reservado, el UPDATE se revierte
  -- y el organizador vuelve a cargar la lista, en vez de dejar una venta
  -- parcial sin comprador.
  if v_count <> v_expected then
    raise exception 'Algunos números ya no están reservados';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Permisos
-- ---------------------------------------------------------------------
revoke execute on function public.reserve_numbers_prepaid(uuid, int[], integer)
  from public, anon;
grant execute on function public.reserve_numbers_prepaid(uuid, int[], integer)
  to authenticated;

revoke execute on function public.organizer_mark_reserved_sold(uuid, int[])
  from public, anon;
grant execute on function public.organizer_mark_reserved_sold(uuid, int[])
  to authenticated;

revoke execute on function public.organizer_mark_sold(uuid, int[])
  from public, anon;
grant execute on function public.organizer_mark_sold(uuid, int[])
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0029', 'prepago manual por WhatsApp: reserva con hold y venta manual estricta')
on conflict (version) do nothing;

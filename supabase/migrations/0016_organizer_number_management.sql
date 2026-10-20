-- =====================================================================
-- 0016 — Gestión manual de números por el organizador (idempotente)
-- =====================================================================
-- Permite al organizador (rol 'admin') aprobar comprobantes de transferencia
-- (available/reserved -> sold) o liberar reservas (reserved -> available),
-- SOLO sobre los sorteos que creó (created_by = auth.uid()). El superadmin
-- gestiona cualquier sorteo.
-- =====================================================================

-- Marca números como vendidos (aprobación manual de comprobante).
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

-- Libera reservas (reserved -> available).
create or replace function public.organizer_release_numbers(
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
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.organizer_mark_sold(uuid, int[]) from public, anon;
grant execute on function public.organizer_mark_sold(uuid, int[]) to authenticated;

revoke execute on function public.organizer_release_numbers(uuid, int[]) from public, anon;
grant execute on function public.organizer_release_numbers(uuid, int[]) to authenticated;

-- =====================================================================
-- 0004 — create_raffle_numbers con cantidad configurable (idempotente)
-- =====================================================================
-- Nueva firma: create_raffle_numbers(p_raffle_id uuid, p_max_numbers integer)
-- Reemplaza la versión anterior (1 parámetro) para evitar sobrecarga ambigua.
-- Re-ejecutable: DROP FUNCTION IF EXISTS + CREATE OR REPLACE.
-- =====================================================================

-- Elimina la firma anterior (uuid).
drop function if exists public.create_raffle_numbers(uuid);

create or replace function public.create_raffle_numbers(
  p_raffle_id uuid,
  p_max_numbers integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if p_max_numbers is null or p_max_numbers < 10 or p_max_numbers > 10000 then
    raise exception 'La cantidad de números debe estar entre 10 y 10000';
  end if;

  -- Genera los números 1..p_max_numbers (cantidad exacta = p_max_numbers).
  insert into public.raffle_numbers (raffle_id, number)
  select p_raffle_id, gs
  from generate_series(1, p_max_numbers) as gs
  on conflict (raffle_id, number) do nothing;
end;
$$;

-- Permisos (igual que la versión anterior): solo usuarios autenticados.
-- La validación de admin se hace dentro de la propia función.
revoke execute on function public.create_raffle_numbers(uuid, integer) from public, anon;
grant execute on function public.create_raffle_numbers(uuid, integer) to authenticated;

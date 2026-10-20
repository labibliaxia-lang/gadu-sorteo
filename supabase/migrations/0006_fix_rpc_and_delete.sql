-- =====================================================================
-- 0006 — Reparar create_raffle_numbers (idempotente)
-- =====================================================================
-- Elimina TODAS las versiones previas para evitar sobrecarga/ambigüedad
-- y crea la versión definitiva que genera EXACTAMENTE p_max_numbers.
-- El borrado en cascada de números/premios ya existe en 0001
-- (ON DELETE CASCADE), así que no hace falta alterar tablas.
-- =====================================================================

drop function if exists public.create_raffle_numbers(uuid);
drop function if exists public.create_raffle_numbers(uuid, integer);

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

  insert into public.raffle_numbers (raffle_id, number)
  select p_raffle_id, gs
  from generate_series(1, p_max_numbers) as gs
  on conflict (raffle_id, number) do nothing;
end;
$$;

revoke execute on function public.create_raffle_numbers(uuid, integer) from public, anon;
grant execute on function public.create_raffle_numbers(uuid, integer) to authenticated;

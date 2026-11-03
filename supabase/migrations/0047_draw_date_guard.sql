-- =====================================================================
-- 0047 — El sorteo solo puede ejecutarse desde su fecha/hora programada
-- =====================================================================
-- Refuerza en la base lo que la UI y la Server Action ya controlan: una fila
-- no puede pasar a `drawn` antes de `draw_date`. Evita tanto el error de tipeo
-- como un intento de saltarse el contador llamando al RPC directamente.
--
-- No modifica pagos, reservas ni el algoritmo del sorteo.
-- =====================================================================

create or replace function public.enforce_draw_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'drawn'
     and (old.status is distinct from 'drawn')
     and new.draw_date is not null
     and new.draw_date > now() then
    raise exception 'El sorteo está programado para el %; todavía no se puede ejecutar',
      to_char(new.draw_date at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_draw_date on public.raffles;
create trigger enforce_draw_date
  before update on public.raffles
  for each row execute procedure public.enforce_draw_date();

insert into public._applied_migrations (version, note)
values ('0047', 'bloqueo de sorteo antes de la fecha programada')
on conflict (version) do nothing;

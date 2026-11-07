-- =====================================================================
-- 0114 — Candado de bases legales al publicar
-- =====================================================================
-- Un sorteo no puede quedar en estado `active` sin que el organizador haya
-- aceptado sus bases legales (`terms_accepted_by_organizer = true`).
--
-- Se valida en la base, así que también frena inserts/updates directos por
-- API. No mira sorteos ya existentes: solo actúa cuando se crea un sorteo
-- activo o cuando se intenta activar uno.
--
-- No toca sorteo, reservas, pagos ni triggers de límites.
-- Idempotente.
-- =====================================================================

create or replace function public.enforce_terms_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aceptado boolean;
begin
  -- Mismo criterio que el candado de KYC (0060): las sesiones de servicio
  -- (SQL Editor, cron, service role) pueden preparar datos; un usuario
  -- autenticado nunca puede publicar sin aceptar las bases.
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  -- En INSERT se usa el valor nuevo; en UPDATE se acepta el de la fila nueva.
  v_aceptado := coalesce(new.terms_accepted_by_organizer, false);

  if not v_aceptado then
    raise exception
      'No se puede publicar un sorteo sin aceptar sus bases legales (terms_accepted_by_organizer)';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_terms_on_publish on public.raffles;
create trigger enforce_terms_on_publish
  before insert or update of status, terms_accepted_by_organizer
  on public.raffles
  for each row execute procedure public.enforce_terms_on_publish();

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0114', 'candado en base: no se publica un sorteo activo sin bases legales aceptadas')
    on conflict (version) do nothing;
  end if;
end;
$$;

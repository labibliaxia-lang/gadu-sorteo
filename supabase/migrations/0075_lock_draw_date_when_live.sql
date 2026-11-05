-- =====================================================================
-- 0075 — La fecha del sorteo es una promesa: no se mueve con el sorteo en venta
-- =====================================================================
-- Motivo:
--   La cuenta regresiva pública solo vale si la fecha no se estira. Hoy el
--   organizador puede mover `draw_date` hacia adelante con el sorteo `active`:
--   el contador se reinicia y la urgencia deja de ser una señal.
--   0071 solo frena ADELANTAR el sorteo (bajar la fecha en el mismo UPDATE que
--   pasa a `drawn`), no extender la venta.
--
-- Qué hace:
--   Trigger BEFORE UPDATE: si el sorteo está `active` y `draw_date` cambia,
--   aborta. Superadmin y service_role quedan exceptuados (correcciones y
--   procesos del motor).
--   Para moverla: cerrar el sorteo, corregir la fecha y volver a publicarlo.
--   Con el sorteo cerrado no hay contador público, así que no se engaña a nadie.
--
-- Idempotente.
-- =====================================================================

create or replace function public.lock_draw_date_when_live()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.draw_date is distinct from old.draw_date
     and old.status = 'active'
     and coalesce(current_user, '') not in ('service_role', 'supabase_admin')
     and not public.is_superadmin() then
    raise exception
      'La fecha del sorteo (% ) no se puede cambiar con el sorteo en venta. Cerrá el sorteo, corregí la fecha y volvé a publicarlo.',
      to_char(old.draw_date at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.lock_draw_date_when_live() is
  'La fecha del sorteo no cambia mientras el sorteo esta active: la cuenta regresiva publica tiene que ser una promesa.';

drop trigger if exists lock_draw_date_when_live on public.raffles;
create trigger lock_draw_date_when_live
  before update on public.raffles
  for each row execute function public.lock_draw_date_when_live();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0075', 'la fecha del sorteo no se mueve con el sorteo en venta')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba completa: supabase/tests/verificar_0074.sql)
-- =====================================================================
-- Rollback:
--   drop trigger if exists lock_draw_date_when_live on public.raffles;
--   drop function if exists public.lock_draw_date_when_live();
-- =====================================================================

-- =====================================================================
-- 0083 — Un sorteo con denuncia pendiente no se puede volver a publicar
-- =====================================================================
-- Qué resuelve: `pauseReportedRaffle` bajaba el sorteo (`active → closed` +
-- `is_listed = false`), pero el organizador podía devolverlo a `active` por
-- PostgREST. La política de UPDATE de `raffles` se lo permite porque es su
-- propio sorteo, y ninguna comprobación miraba las denuncias. Pausar quedaba
-- a un PATCH de distancia de deshacerse.
--
-- Qué hace: bloquea la transición a `active` mientras exista una denuncia en
-- estado `pending` para ese sorteo (0064: estado por defecto de una denuncia).
--
-- Qué NO hace:
--   · No impide cerrar, sortear ni cancelar: sólo republicar.
--   · No toca pagos ni reservas.
--   · No impide deslistar/relistar un sorteo sin denuncias: ahí el guard no
--     aplica y todo sigue como antes.
--
-- Quién queda exento (mismo criterio que `guard_raffle_result`, 0067):
--   Las conexiones de cliente (`authenticated`, `anon`) son las que se frenan.
--   El SQL Editor (`postgres`) y `service_role` —el panel de superadmin,
--   `pauseReportedRaffle`, los scripts de mantenimiento— siguen pudiendo
--   corregir a mano. La moderación no se puede quedar trabada por este guard.
--
-- Por qué `security definer`: el `exists` tiene que ver TODAS las denuncias
-- pendientes. Con invoker, la RLS de `raffle_reports` filtraría y el guard
-- dejaría pasar justo el caso que tiene que frenar.
-- =====================================================================

create or replace function public.guard_reopen_reported_raffle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_user, '') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Sólo interesa la vuelta a la venta.
  if new.status = 'active' and old.status is distinct from 'active' then
    if exists (
      select 1
      from public.raffle_reports rr
      where rr.raffle_id = new.id
        and rr.status = 'pending'
    ) then
      raise exception
        'El sorteo tiene una denuncia pendiente de revisión: no se puede volver a publicar';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_reopen_reported_raffle on public.raffles;
create trigger guard_reopen_reported_raffle
  before update on public.raffles
  for each row execute procedure public.guard_reopen_reported_raffle();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0083', 'un sorteo con denuncia pendiente no se republica')
    on conflict (version) do nothing;
  end if;
end
$$;

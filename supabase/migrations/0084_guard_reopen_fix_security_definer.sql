-- =====================================================================
-- 0084 — Arregla el guard de republicación (0083 no frenaba nada)
-- =====================================================================
-- Qué pasó: la 0083 definía el trigger con `security definer` y decidía con
-- `current_user`. Dentro de una función `security definer`, `current_user` es
-- el DUEÑO de la función (`postgres`), no el rol que hace el UPDATE. Así, la
-- primera condición (`current_user not in ('authenticated','anon')`) se cumplía
-- siempre y el guard salía sin mirar nada.
--
-- Medido en la base: con una denuncia `pending` y el sorteo pausado, el dueño
-- lo devolvió a `active` sin ningún error. El guard era decorativo.
--
-- Cómo se arregla, en dos piezas:
--   1. `tiene_denuncia_pendiente(uuid)` — `security definer`, para que el
--      `exists` vea TODAS las denuncias sin que la RLS de `raffle_reports` lo
--      filtre (un organizador no ve las denuncias de su sorteo).
--   2. El trigger, SIN `security definer`, para que `current_user` sea de verdad
--      `authenticated` cuando el update viene de PostgREST.
--
-- Exenciones que se mantienen: `service_role` (panel de superadmin,
-- `pauseReportedRaffle`, scripts) y el SQL Editor (`postgres`) no se frenan.
-- La moderación no puede quedar trabada por su propio guard.
--
-- Idempotente: redefine ambas funciones y recrea el trigger.
-- =====================================================================

-- 1) Consulta de denuncias, inmune a la RLS.
create or replace function public.tiene_denuncia_pendiente(p_raffle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.raffle_reports rr
    where rr.raffle_id = p_raffle_id
      and rr.status = 'pending'
  );
$$;

comment on function public.tiene_denuncia_pendiente(uuid) is
  'true si el sorteo tiene alguna denuncia en estado pending. SECURITY DEFINER para no depender de la RLS de raffle_reports.';

-- 2) El trigger, como invoker: acá `current_user` sí es el rol del cliente.
create or replace function public.guard_reopen_reported_raffle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_user, '') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Sólo interesa la vuelta a la venta.
  if new.status = 'active' and old.status is distinct from 'active' then
    if public.tiene_denuncia_pendiente(new.id) then
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
    values ('0084', 'arregla 0083: security definer dejaba pasar todo')
    on conflict (version) do nothing;
  end if;
end
$$;

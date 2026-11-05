-- =====================================================================
-- 0077 — «Destacado» lo pone el superadmin, no el organizador
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, BAJO nº 20):
--   `0066` agregó `is_featured`/`featured_at` a `raffles` y el `grant update`
--   de `0065` es de tabla, no de columnas: cualquier organizador podía poner su
--   propio sorteo en «Destacado» con un PATCH por PostgREST, sin pasar por el
--   panel de superadmin ni por la auditoría. El destacado es una herramienta
--   comercial del dueño del producto, no una preferencia del organizador.
--
-- Enfoque (mismo criterio que 0067):
--   La Server Action que destaca usa el cliente con service role, así que
--   `current_user` no es `authenticated`. Se bloquea solo a las conexiones de
--   cliente (`authenticated`, `anon`), salvo que el usuario sea superadmin.
--   El SQL Editor (`postgres`) y el motor (`service_role`) siguen pudiendo
--   corregir a mano: son el dueño de la base.
--
-- Qué cubre:
--   · UPDATE: cambiar `is_featured` o `featured_at` desde el cliente aborta.
--   · INSERT: un alta desde el cliente nace con `is_featured = false`; el
--     organizador no puede destacar su sorteo al crearlo.
--
-- Idempotente.
-- =====================================================================

create or replace function public.guard_featured_flag()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_user, '') in ('authenticated', 'anon')
     and not public.is_superadmin() then
    if tg_op = 'INSERT' then
      -- No abortamos el alta: solo se ignora lo que pidió el cliente.
      new.is_featured := false;
      new.featured_at := null;
      return new;
    end if;

    raise exception 'Solo el superadmin puede destacar un sorteo'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_featured_flag() is
  'El organizador no puede marcar su sorteo como destacado: eso lo decide el superadmin.';

drop trigger if exists guard_featured_flag_on_insert on public.raffles;
create trigger guard_featured_flag_on_insert
  before insert on public.raffles
  for each row execute function public.guard_featured_flag();

drop trigger if exists guard_featured_flag_on_update on public.raffles;
create trigger guard_featured_flag_on_update
  before update of is_featured, featured_at on public.raffles
  for each row execute function public.guard_featured_flag();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0077', 'solo el superadmin marca un sorteo como destacado')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba: supabase/tests/verificar_0077.sql)
-- =====================================================================
-- Rollback:
--   drop trigger if exists guard_featured_flag_on_insert on public.raffles;
--   drop trigger if exists guard_featured_flag_on_update on public.raffles;
--   drop function if exists public.guard_featured_flag();
-- =====================================================================

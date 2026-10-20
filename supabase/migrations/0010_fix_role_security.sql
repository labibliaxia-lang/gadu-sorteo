-- =====================================================================
-- 0010 — Evitar autopromoción de rol (idempotente)
-- =====================================================================
-- Impide que un usuario sin privilegios cambie su propia columna `role`.
-- Permite cambios de rol a: admins existentes (is_admin) o service_role
-- (auth.uid() es null en ese contexto, usado por las Server Actions).
-- =====================================================================

create or replace function public.prevent_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'No tenés permisos para cambiar el rol';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_self_update on public.profiles;
create trigger prevent_role_self_update
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_update();

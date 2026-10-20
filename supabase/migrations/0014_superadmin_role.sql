-- =====================================================================
-- 0014 — Rol superadmin y aislamiento de organizadores (idempotente)
-- =====================================================================
-- Introduce un rol 'superadmin' por encima de 'admin' (organizadores):
--   * superadmin: visibilidad y gestión global de sorteos.
--   * admin: solo puede gestionar los sorteos que creó (created_by).
-- La lectura pública de sorteos NO se modifica.
-- =====================================================================

-- 1) Ampliar el rol para incluir 'superadmin'.
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

-- 2) is_admin() ahora incluye superadmin (todo el RLS existente sigue andando).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

-- 3) is_superadmin() — solo superadmin.
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

-- 4) Evitar auto-promoción: un 'admin' no puede pasarse a 'superadmin'.
create or replace function public.prevent_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if new.role = 'superadmin' or old.role = 'superadmin' then
      if auth.uid() is not null and not public.is_superadmin() then
        raise exception 'Solo un superadmin puede gestionar el rol superadmin';
      end if;
    elsif auth.uid() is not null and not public.is_admin() then
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

-- 5) RLS de sorteos: superadmin gestiona todo; organizador solo lo suyo.
--    La creación fuerza que created_by sea el usuario autenticado.
drop policy if exists "raffles_insert_admin" on public.raffles;
create policy "raffles_insert_admin"
  on public.raffles for insert
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "raffles_update_admin" on public.raffles;
create policy "raffles_update_admin"
  on public.raffles for update
  using (public.is_superadmin() or (public.is_admin() and created_by = auth.uid()))
  with check (public.is_superadmin() or (public.is_admin() and created_by = auth.uid()));

drop policy if exists "raffles_delete_admin" on public.raffles;
create policy "raffles_delete_admin"
  on public.raffles for delete
  using (public.is_superadmin() or (public.is_admin() and created_by = auth.uid()));

-- ---------------------------------------------------------------------
-- PROMOCIÓN DEL DUEÑO (manual, ejecutar UNA sola vez en SQL Editor):
--
--   update public.profiles
--   set role = 'superadmin'
--   where id = (
--     select u.id from auth.users u
--     where lower(u.email) = lower('TU_EMAIL@GMAIL.COM')
--     limit 1
--   );
-- ---------------------------------------------------------------------

-- =====================================================================
-- 0008 — Campos públicos del perfil del organizador (idempotente)
-- =====================================================================

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists instagram_url text,
  add column if not exists location text,
  add column if not exists is_verified boolean not null default false;

-- Permitir leer públicamente SOLO los perfiles de organizadores (admin).
grant select on public.profiles to anon;

drop policy if exists "profiles_select_public_admin" on public.profiles;
create policy "profiles_select_public_admin"
  on public.profiles for select
  using (role = 'admin');

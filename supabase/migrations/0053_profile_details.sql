-- =====================================================================
-- 0053 — Datos de perfil y avatares (idempotente)
-- =====================================================================
-- Agrega bio y sitio web al perfil. La vista pública del organizador pasa a
-- exponer solo los campos que el organizador decide mostrar en su perfil:
-- nombre, avatar, verificación, bio, web, ubicación e Instagram.
--
-- Bucket público `avatars`: lectura pública, subida/edición solo del dueño en
-- su carpeta <auth.uid()>/...
-- =====================================================================

alter table public.profiles
  add column if not exists bio text,
  add column if not exists website_url text;

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 400);

-- ---------------------------------------------------------------------
-- Vista pública del organizador con los campos de presentación
-- ---------------------------------------------------------------------
drop view if exists public.public_organizers;
create view public.public_organizers as
  select
    id,
    slug,
    full_name,
    avatar_url,
    is_verified,
    bio,
    website_url,
    location,
    instagram_url
  from public.profiles
  where role in ('admin', 'superadmin');

revoke all on public.public_organizers from public, anon, authenticated;
grant select on public.public_organizers to anon, authenticated;
grant select on public.public_organizers to service_role;

-- ---------------------------------------------------------------------
-- Bucket de avatares
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into public._applied_migrations (version, note)
values ('0053', 'datos de perfil, bio, web y bucket de avatares')
on conflict (version) do nothing;

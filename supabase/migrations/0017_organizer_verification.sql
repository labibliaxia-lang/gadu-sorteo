-- =====================================================================
-- 0017 — Verificación de identidad del organizador (idempotente)
-- =====================================================================
-- Flujo KYC: el organizador sube DNI (frente) + selfie. El superadmin
-- aprueba o rechaza. Las imágenes viven en un bucket PRIVADO (nunca público).
-- =====================================================================

-- 1) Campos de verificación en profiles.
alter table public.profiles
  add column if not exists dni_front_url text;

alter table public.profiles
  add column if not exists face_url text;

alter table public.profiles
  add column if not exists dni_verified boolean not null default false;

alter table public.profiles
  add column if not exists face_verified boolean not null default false;

alter table public.profiles
  add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'approved', 'rejected'));

-- 2) Bucket privado para KYC (documento + rostro).
insert into storage.buckets (id, name, public)
values ('organizer-kyc', 'organizer-kyc', false)
on conflict (id) do nothing;

-- 3) Políticas estrictas:
--    * el dueño solo sube/lee dentro de su carpeta <auth.uid()>/...
--    * el superadmin puede leer cualquier archivo (para revisar y aprobar).
--    * NO hay lectura pública.

drop policy if exists "kyc_owner_insert" on storage.objects;
create policy "kyc_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organizer-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc_owner_select" on storage.objects;
create policy "kyc_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organizer-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "kyc_superadmin_select" on storage.objects;
create policy "kyc_superadmin_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organizer-kyc'
    and public.is_superadmin()
  );

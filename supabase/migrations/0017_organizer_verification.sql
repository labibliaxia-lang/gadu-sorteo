-- =====================================================================
-- 0017 — Verificación de identidad del organizador (idempotente)
-- =====================================================================
-- Flujo KYC: el organizador sube DNI (frente + dorso) y selfie. El
-- superadmin aprueba o rechaza. Las imágenes viven en un bucket PRIVADO
-- (`organizer-kyc`, public = false) y sólo se muestran con URLs firmadas.
--
-- ⚠️ Esta migración ya existía en instalaciones viejas. Es idempotente y
-- ahora agrega además `dni_back_url`. En una base ya existente, `supabase db
-- push` NO vuelve a ejecutar una migración registrada: hay que correr este
-- archivo a mano en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Campos de verificación en profiles.
alter table public.profiles
  add column if not exists dni_front_url text;

alter table public.profiles
  add column if not exists dni_back_url text;

alter table public.profiles
  add column if not exists face_url text;

alter table public.profiles
  add column if not exists dni_verified boolean not null default false;

alter table public.profiles
  add column if not exists face_verified boolean not null default false;

alter table public.profiles
  add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending', 'approved', 'rejected'));

-- Cola del superadmin: pendientes ordenadas por antigüedad. El índice parcial
-- evita recorrer todos los perfiles (la mayoría no está en revisión).
create index if not exists profiles_verification_pending_idx
  on public.profiles (created_at)
  where verification_status = 'pending';

-- 2) Bucket privado para KYC (documento + rostro). Nunca público.
--    MIME y tamaño alineados con 0061: sólo JPG/PNG hasta 5 MB.
--    El `do update` garantiza que el bucket siga privado aunque alguien lo
--    haya cambiado a mano desde el panel de Storage.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'organizer-kyc',
  'organizer-kyc',
  false,
  array['image/jpeg', 'image/png'],
  5 * 1024 * 1024
)
on conflict (id) do update
  set public = false,
      allowed_mime_types = excluded.allowed_mime_types,
      file_size_limit = excluded.file_size_limit;

-- 3) Políticas estrictas de Storage:
--    * el dueño sólo sube/lee/reemplaza dentro de su carpeta <auth.uid()>/...
--      (el UPDATE es necesario para el `upsert` al reenviar documentos);
--    * el superadmin puede leer cualquier archivo (para revisar y aprobar);
--    * NO hay lectura pública, ni borrado por parte del organizador: una vez
--      subida la evidencia, el organizador no puede eliminarla desde la app.

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

drop policy if exists "kyc_owner_update" on storage.objects;
create policy "kyc_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'organizer-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
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

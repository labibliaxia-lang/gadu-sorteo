-- =====================================================================
-- 0061 — Restringir MIME de los buckets a JPG/PNG (idempotente)
-- =====================================================================
-- Mitigación del RCE del optimizador de Next 14: se evita que se suban
-- SVG/AVIF y se limita el tamaño. Las imágenes existentes no se borran.
-- =====================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png'],
    file_size_limit = 5 * 1024 * 1024
where id in ('raffle-images', 'avatars', 'organizer-kyc');

insert into public._applied_migrations (version, note)
values ('0061', 'mime jpg/png en buckets de imagenes y kyc')
on conflict (version) do nothing;

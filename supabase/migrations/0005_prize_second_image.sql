-- =====================================================================
-- 0005 — Segunda imagen en premios (idempotente)
-- =====================================================================
-- Agrega image_url_2 (texto, opcional) a la tabla prizes.
-- No borra image_url (será la "Foto 1 / principal").
-- Re-ejecutable: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

alter table public.prizes
  add column if not exists image_url_2 text;

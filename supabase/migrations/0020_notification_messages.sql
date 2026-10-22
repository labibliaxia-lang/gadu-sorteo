-- =====================================================================
-- 0020 — Mensajes de notificación configurables por organizador (idempotente)
-- =====================================================================
-- Textos personalizables de confirmación de compra y de premios que el
-- organizador puede editar desde su perfil.
-- =====================================================================

alter table public.profiles
  add column if not exists purchase_message text;

alter table public.profiles
  add column if not exists prize_message text;

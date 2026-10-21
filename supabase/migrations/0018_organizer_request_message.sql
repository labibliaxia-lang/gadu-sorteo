-- =====================================================================
-- 0018 — Mensaje/propuesta en la solicitud de organizador (idempotente)
-- =====================================================================
-- Guarda la propuesta que el usuario envía al solicitar ser organizador
-- (para negociar comisiones/condiciones con el superadmin).
-- =====================================================================

alter table public.profiles
  add column if not exists request_message text;

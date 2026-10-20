-- =====================================================================
-- 0009 — Solicitud de rol administrador (idempotente)
-- =====================================================================

alter table public.profiles
  add column if not exists role_requested boolean not null default false;

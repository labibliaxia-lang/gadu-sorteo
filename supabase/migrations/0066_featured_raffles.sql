-- =====================================================================
-- 0066 — Sorteos destacados (idempotente)
-- =====================================================================
-- El superadmin elige qué sorteos aparecen como destacados en la home y en la
-- sección «más sorteos» de cada landing. `featured_at` guarda cuándo se destacó
-- para poder ordenar y auditar.
--
-- Sin políticas nuevas: la escritura la hace el service role desde una Server
-- Action que exige `requireSuperadminSession()` y deja fila en
-- `admin_audit_logs`. La lectura ya es pública por `raffles_select_public`.
-- =====================================================================

alter table public.raffles
  add column if not exists is_featured boolean not null default false;

alter table public.raffles
  add column if not exists featured_at timestamptz;

-- Índice parcial: la home ordena por destacados y esta consulta es chica.
create index if not exists raffles_featured_idx
  on public.raffles (featured_at desc nulls last)
  where is_featured;

insert into public._applied_migrations (version, note)
values ('0066', 'sorteos destacados: is_featured y featured_at')
on conflict (version) do nothing;

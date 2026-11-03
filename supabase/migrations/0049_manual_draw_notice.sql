-- =====================================================================
-- 0049 — Aviso de sorteo manual listo para ejecutar (idempotente)
-- =====================================================================
-- Marca cuándo se le avisó al organizador que un sorteo en modo manual ya
-- llegó a su fecha/hora. Evita repetir el email en cada cron o visita.
-- =====================================================================

alter table public.raffles
  add column if not exists manual_draw_notified_at timestamptz;

insert into public._applied_migrations (version, note)
values ('0049', 'aviso unico al organizador cuando el sorteo manual esta listo')
on conflict (version) do nothing;

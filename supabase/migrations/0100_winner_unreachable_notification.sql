-- =====================================================================
-- 0100 — Si al ganador no se le puede avisar, el organizador se entera
-- =====================================================================
-- Caso real (2026-11-06): un sorteo se sorteó, el ganador tenía el campo
-- `email` vacío y el aviso automático no salió. Nadie se enteró: ni el
-- ganador ni el organizador.
--
-- Qué cambia:
--   1. Un tipo de notificación nuevo: `winner_unreachable`.
--   2. El sorteo (manual y automático) avisa al organizador cuando el ganador
--      no tiene email o el envío falló, con nombre, número y teléfono.
--
-- Idempotente.
-- =====================================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'reservation_pending',
    'payment_approved',
    'reservation_expired',
    'refund_requested',
    'refund_confirmed',
    'winner_unreachable',
    'draw_ready',
    'report_pending'
  ));

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0100', 'si el ganador no tiene email, el organizador recibe un aviso con su telefono')
    on conflict (version) do nothing;
  end if;
end;
$$;

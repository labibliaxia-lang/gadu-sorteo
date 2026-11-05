-- =====================================================================
-- 0068 — El cron no libera números con un pago en curso
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, CRÍTICO nº 3):
--   `reserve_numbers` reserva por 10 minutos (0001:228) y
--   `release_expired_reservations` (0001:307) libera toda reserva vencida sin
--   mirar si hay un pago en curso.
--
--   Con tarjeta el usuario tarda más de 10 minutos en muchos casos; con pago
--   en efectivo (Rapipago/PagoFácil) el cobro se acredita horas o días después.
--   Resultado: el cron liberaba los números, el pago llegaba aprobado y
--   `sell_numbers` no encontraba nada que vender. El cliente pagaba y no
--   recibía números. La corrección del webhook (conteo de filas vendidas) hizo
--   que eso ya no pase en silencio, pero la venta se sigue perdiendo.
--
-- Qué cambia:
--   Se libera una reserva vencida SALVO que exista un pago en `pending` para
--   ese sorteo y ese número, creado en las últimas 24 horas. 24 h es la
--   vigencia por defecto de una preferencia de Checkout Pro y cubre el efectivo.
--
-- Qué NO cambia:
--   * No se toca el estado de ningún pago. Marcarlos `expired` haría que el
--     webhook los ignore por «estado terminal» y volvería el silencio que la
--     corrección anterior eliminó.
--   * Pasadas 24 h la reserva se libera igual que antes: el inventario nunca
--     queda tomado para siempre por un carrito abandonado.
--   * La firma de la función no cambia: el cron (`app/api/cron/
--     release-reservations/route.ts`) sigue llamándola igual.
--
-- Idempotente.
-- =====================================================================

create or replace function public.release_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.raffle_numbers n
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where n.status = 'reserved'
     and n.reserved_until < now()
     -- Un pago en curso y reciente es dueño de la reserva: liberarla es
     -- cobrarle a alguien un número que ya no va a recibir.
     and not exists (
       select 1
         from public.payments p
        where p.raffle_id = n.raffle_id
          and p.status = 'pending'
          and n.number = any (p.numbers)
          and p.created_at > now() - interval '24 hours'
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0068', 'el cron no libera numeros con un pago pendiente de menos de 24h')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación rápida (para la prueba completa: supabase/tests/verificar_0068.sql)
-- =====================================================================
--   select pg_get_functiondef('public.release_expired_reservations'::regproc) like '%24 hours%'
--     as tiene_la_guarda;
--
-- Rollback:
--   -- volver al cuerpo de 0001:307 (sin la cláusula `not exists`).
-- =====================================================================

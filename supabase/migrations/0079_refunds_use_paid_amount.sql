-- =====================================================================
-- 0079 — Las devoluciones usan lo cobrado, no el precio de hoy
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, MEDIA nº 13):
--   `cancel_raffle` (0063:167) generaba la devolución con
--   `count(*) * v_raffle.price_per_number`. Si el organizador cambió el precio
--   después de vender, la devolución no coincide con lo que el comprador pagó:
--   puede devolverle de menos (lo peor) o de más.
--
-- Qué cambia:
--   El importe de cada número vendido sale de `payments.amount` cuando el número
--   tiene `payment_id`:
--     · cada pago se reparte entre los números vendidos que cubre
--       (`amount / cantidad de números vendidos con ese payment_id`), así la
--       suma de las partes es exactamente lo cobrado;
--     · los números del camino manual (transferencia) no tienen pago asociado,
--       así que siguen usando `price_per_number` como estimación — no hay otro
--       registro de lo acordado.
--
-- Qué NO cambia:
--   · la firma, los permisos, el estado del sorteo ni la liberación de reservas;
--   · `on conflict (raffle_id, user_id) do nothing`: una devolución por comprador;
--   · el redondeo a 2 decimales al insertar.
--
-- Idempotente.
-- =====================================================================

create or replace function public.cancel_raffle(
  p_raffle_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raffle record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select * into v_raffle
  from public.raffles
  where id = p_raffle_id
  for update;

  if not found then
    raise exception 'El sorteo no existe';
  end if;

  if v_raffle.created_by <> auth.uid() and not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  if v_raffle.status not in ('active', 'closed') then
    raise exception 'Solo se puede cancelar un sorteo activo o cerrado';
  end if;

  update public.raffles
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_raffle_id;

  update public.raffle_numbers
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and status = 'reserved';

  -- Devolución = lo efectivamente cobrado. Cada pago se reparte entre los
  -- números vendidos que cubre; los del camino manual caen al precio actual.
  with pagos as (
    select n.payment_id, count(*)::numeric as numeros
      from public.raffle_numbers n
     where n.raffle_id = p_raffle_id
       and n.status = 'sold'
       and n.payment_id is not null
     group by n.payment_id
  ),
  items as (
    select
      n.sold_to,
      case
        when n.payment_id is null then v_raffle.price_per_number
        else coalesce(pay.amount, v_raffle.price_per_number) / pagos.numeros
      end as importe
      from public.raffle_numbers n
      left join public.payments pay on pay.id = n.payment_id
      left join pagos on pagos.payment_id = n.payment_id
     where n.raffle_id = p_raffle_id
       and n.status = 'sold'
       and n.sold_to is not null
  )
  insert into public.refunds (raffle_id, user_id, amount)
  select p_raffle_id, sold_to, round(sum(importe), 2)
    from items
   group by sold_to
  on conflict (raffle_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cancel_raffle(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_raffle(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0079', 'las devoluciones usan payments.amount y no el precio vigente')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba: supabase/tests/verificar_0079.sql)
-- =====================================================================
-- Rollback: volver al cuerpo de 0063.
-- =====================================================================

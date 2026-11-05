-- =====================================================================
-- 0070 — Devoluciones y contracargos bajan de estado y dan de baja números
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, ALTA nº 8):
--   * `payments.status` solo admitía pending/approved/rejected/cancelled/expired
--     (0001:45), pero `lib/payments.ts` ya contaba `refunded` y `charged_back`
--     como estados finales: el código los esperaba y la base no los permitía.
--   * El webhook cortaba en el guard de estado terminal (webhook:146), así que
--     un pago `approved` que después se devolvía o se desconocía nunca se
--     procesaba: los números quedaban `sold` y el comprador seguía participando
--     con la plata devuelta. Con tarjeta robada es gratis jugar.
--
-- Qué agrega esta migración:
--   1. El CHECK de `payments.status` acepta `refunded` y `charged_back`.
--   2. `void_sold_numbers`: pasa números `sold` a `available` SOLO si son de ese
--      usuario y de ese pago, y SOLO si el sorteo sigue `active`. Después del
--      cierre los hashes ya comprometen el listado: ahí la baja es manual.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estados nuevos
-- ---------------------------------------------------------------------
-- Se borra cualquier CHECK de `status` que exista, sin depender del nombre
-- automático que Postgres le puso en 0001: un `drop constraint` por nombre
-- equivocado sería un no-op silencioso y el estado nuevo seguiría rechazado.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payments drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.payments
  add constraint payments_status_check
  check (status in (
    'pending', 'approved', 'rejected', 'cancelled', 'expired',
    'refunded', 'charged_back'
  ));

-- ---------------------------------------------------------------------
-- 2) Baja de números por devolución o contracargo
-- ---------------------------------------------------------------------
create or replace function public.void_sold_numbers(
  p_raffle_id uuid,
  p_user_id uuid,
  p_numbers int[],
  p_payment_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count int;
begin
  select status into v_status
  from public.raffles
  where id = p_raffle_id;

  if v_status is null then
    raise exception 'El sorteo no existe';
  end if;

  -- Con el sorteo cerrado o sorteado el listado ya está comprometido: dar de
  -- baja números en ese momento invalidaría el hash publicado.
  if v_status <> 'active' then
    raise exception
      'El sorteo no está en venta (estado %): la baja de números requiere revisión manual',
      v_status;
  end if;

  update public.raffle_numbers
     set status = 'available',
         sold_to = null,
         sold_at = null,
         payment_id = null
   where raffle_id = p_raffle_id
     and number = any (p_numbers)
     and status = 'sold'
     and sold_to = p_user_id
     and payment_id = p_payment_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Solo el servidor: la baja de una venta no la decide el navegador.
revoke execute on function public.void_sold_numbers(uuid, uuid, int[], uuid)
  from public, anon, authenticated;
grant execute on function public.void_sold_numbers(uuid, uuid, int[], uuid)
  to service_role;

-- ---------------------------------------------------------------------
-- 3) Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0070', 'estados refunded/charged_back y baja de numeros por contracargo solo con el sorteo en venta')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba completa: supabase/tests/verificar_0070.sql)
-- =====================================================================
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'payments_status_check';
--
-- Rollback:
--   drop function if exists public.void_sold_numbers(uuid, uuid, int[], uuid);
--   -- el CHECK vuelve al de 0001 (sin refunded/charged_back).
-- =====================================================================

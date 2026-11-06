-- =====================================================================
-- 0090 — Cerrar la fase 1 de notificaciones
-- =====================================================================
-- Qué agrega sobre 0089:
--   1. `notificar_reserva` incluye el TELÉFONO del comprador, para que el
--      botón «Pedir comprobante» abra WhatsApp con destinatario.
--   2. `notificar_pago_aprobado(payment_id)`: aviso informativo cuando
--      Mercado Pago acredita. Lo llama el webhook con service role.
--
-- Idempotente.
-- =====================================================================

create or replace function public.notificar_reserva(
  p_raffle_id uuid,
  p_buyer uuid,
  p_numbers int[],
  p_expires timestamptz,
  p_type text default 'reservation_pending'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_nombre text;
  v_telefono text;
  v_precio numeric;
begin
  if p_numbers is null or cardinality(p_numbers) = 0 then
    return;
  end if;

  select r.created_by, r.price_per_number
    into v_owner, v_precio
    from public.raffles r
   where r.id = p_raffle_id;

  if v_owner is null then
    return;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Un comprador'),
    nullif(btrim(p.phone), '')
    into v_nombre, v_telefono
    from public.profiles p
   where p.id = p_buyer;

  insert into public.notifications (
    user_id, type, raffle_id, subject_user_id, payload, priority, expires_at
  )
  values (
    v_owner,
    p_type,
    p_raffle_id,
    p_buyer,
    jsonb_build_object(
      'numbers', to_jsonb(p_numbers),
      'count', cardinality(p_numbers),
      'buyer_name', coalesce(v_nombre, 'Un comprador'),
      'buyer_phone', v_telefono,
      'price_per_number', v_precio,
      'total', round(coalesce(v_precio, 0) * cardinality(p_numbers), 2)
    ),
    case when p_type = 'reservation_pending' then 'urgent' else 'info' end,
    case when p_type = 'reservation_pending' then p_expires else null end
  );
end;
$$;

revoke all on function public.notificar_reserva(uuid, uuid, int[], timestamptz, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Aviso de pago acreditado
-- ---------------------------------------------------------------------
create or replace function public.notificar_pago_aprobado(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago record;
  v_owner uuid;
  v_nombre text;
  v_telefono text;
begin
  select p.id, p.raffle_id, p.user_id, p.numbers, p.amount
    into v_pago
    from public.payments p
   where p.id = p_payment_id
     and p.status = 'approved';

  if not found then
    return;
  end if;

  select r.created_by into v_owner
    from public.raffles r
   where r.id = v_pago.raffle_id;

  if v_owner is null then
    return;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Un comprador'),
    nullif(btrim(p.phone), '')
    into v_nombre, v_telefono
    from public.profiles p
   where p.id = v_pago.user_id;

  insert into public.notifications (
    user_id, type, raffle_id, subject_user_id, payload, priority
  )
  values (
    v_owner,
    'payment_approved',
    v_pago.raffle_id,
    v_pago.user_id,
    jsonb_build_object(
      'numbers', to_jsonb(v_pago.numbers),
      'count', cardinality(coalesce(v_pago.numbers, array[]::int[])),
      'buyer_name', coalesce(v_nombre, 'Un comprador'),
      'buyer_phone', v_telefono,
      'total', v_pago.amount
    ),
    'info'
  );
end;
$$;

revoke all on function public.notificar_pago_aprobado(uuid)
  from public, anon, authenticated;
grant execute on function public.notificar_pago_aprobado(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0090', 'notificaciones fase 1: telefono del comprador y aviso de pago acreditado')
    on conflict (version) do nothing;
  end if;
end;
$$;

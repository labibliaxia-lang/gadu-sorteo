-- =====================================================================
-- 0093 — El comprador puede confirmar que recibió la devolución
-- =====================================================================
-- Hueco: la devolución solo la cierra el organizador. El comprador no tiene
-- forma de avisar que la plata le llegó, y el organizador no recibe ningún
-- aviso cuando eso pasa.
--
-- Qué agrega:
--   1. `refunds.buyer_confirmed_at`: cuándo el comprador confirmó.
--   2. `confirm_refund_received(refund_id)`: solo el dueño de la devolución,
--      idempotente, y avisa al organizador con una notificación.
--   3. La notificación `refund_confirmed` en el check de tipos.
--
-- No cambia el estado de la devolución: confirmar que llegó no es lo mismo que
-- el organizador la declare pagada. El aviso público sigue dependiendo de
-- `status = 'pending'` hasta que el organizador la cierre.
--
-- Idempotente.
-- =====================================================================

alter table public.refunds
  add column if not exists buyer_confirmed_at timestamptz;

-- ---------------------------------------------------------------------
-- La notificación nueva
-- ---------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'reservation_pending',
    'payment_approved',
    'reservation_expired',
    'refund_requested',
    'refund_confirmed',
    'draw_ready',
    'report_pending'
  ));

-- ---------------------------------------------------------------------
-- Confirmación del comprador
-- ---------------------------------------------------------------------
create or replace function public.confirm_refund_received(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_refund record;
  v_owner uuid;
  v_nombre text;
  v_telefono text;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select r.id, r.raffle_id, r.amount, r.buyer_confirmed_at
    into v_refund
    from public.refunds r
   where r.id = p_refund_id
     and r.user_id = v_uid
   for update;

  if not found then
    raise exception 'La devolución no existe o no es tuya';
  end if;

  -- Idempotente: confirmar dos veces no duplica el aviso.
  if v_refund.buyer_confirmed_at is not null then
    return;
  end if;

  update public.refunds
     set buyer_confirmed_at = now()
   where id = p_refund_id;

  select rf.created_by into v_owner
    from public.raffles rf
   where rf.id = v_refund.raffle_id;

  if v_owner is null then
    return;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Un comprador'),
    nullif(btrim(p.phone), '')
    into v_nombre, v_telefono
    from public.profiles p
   where p.id = v_uid;

  insert into public.notifications (
    user_id, type, raffle_id, subject_user_id, payload, priority
  )
  values (
    v_owner,
    'refund_confirmed',
    v_refund.raffle_id,
    v_uid,
    jsonb_build_object(
      'refund_id', p_refund_id,
      'amount', v_refund.amount,
      'buyer_name', coalesce(v_nombre, 'Un comprador'),
      'buyer_phone', v_telefono
    ),
    'normal'
  );
end;
$$;

revoke all on function public.confirm_refund_received(uuid)
  from public, anon;
grant execute on function public.confirm_refund_received(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0093', 'el comprador confirma la devolucion recibida y se avisa al organizador')
    on conflict (version) do nothing;
  end if;
end;
$$;

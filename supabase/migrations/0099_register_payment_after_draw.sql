-- =====================================================================
-- 0099 — Registrar pagos después de sortear y avisar al ganador a mano
-- =====================================================================
-- Dos huecos que aparecieron en producción:
--
--   1. `organizer_register_payment` solo aceptaba sorteos active/closed. Si el
--      organizador olvidaba registrar el pago y el sorteo se sorteaba, ya no
--      podía hacerlo: el número quedaba "sin pago registrado" para siempre y
--      la contabilidad no cerraba.
--      Se permite ahora con el sorteo `drawn`, con una condición: SOLO se
--      enlaza el pago a números ya vendidos; no se toca su estado ni el dueño,
--      así que el resultado del sorteo no cambia.
--
--   2. El aviso al ganador depende de email + opt-in + términos. Si falla, es
--      silencioso. Se agrega la acción de auditoría `winner_notified` para
--      dejar constancia de los reenvíos manuales.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La auditoría registra el aviso al ganador
-- ---------------------------------------------------------------------
alter table public.raffle_audit
  drop constraint if exists raffle_audit_action_check;

alter table public.raffle_audit
  add constraint raffle_audit_action_check check (action in (
    'release_reservation',
    'refund_numbers',
    'mark_sold',
    'register_payment',
    'refund_number_released',
    'winner_notified'
  ));

-- ---------------------------------------------------------------------
-- 2) Registrar pagos con el sorteo sorteado
-- ---------------------------------------------------------------------
create or replace function public.organizer_register_payment(
  p_raffle_id uuid,
  p_numbers int[],
  p_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado text;
  v_precio numeric;
  v_numeros int[];
  v_comprador uuid;
  v_monto numeric;
  v_pago uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not public.is_admin() or not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  select r.status, r.price_per_number
    into v_estado, v_precio
    from public.raffles r
   where r.id = p_raffle_id
   for update;

  if v_estado is null then
    raise exception 'El sorteo no existe';
  end if;

  -- drawn incluido: después del sorteo todavía se puede registrar plata.
  -- El sorteo en sí no cambia porque abajo solo se enlaza payment_id.
  if v_estado not in ('active', 'closed', 'drawn') then
    raise exception 'El sorteo está %: no se pueden registrar pagos', v_estado;
  end if;

  select
    array_agg(distinct n.number order by n.number),
    (array_agg(distinct n.sold_to))[1]
    into v_numeros, v_comprador
    from public.raffle_numbers n
   where n.raffle_id = p_raffle_id
     and n.status = 'sold'
     and n.payment_id is null
     and n.number = any (coalesce(p_numbers, array[]::int[]));

  if v_numeros is null then
    raise exception 'No hay números vendidos sin pago entre los elegidos';
  end if;

  if (select count(distinct n.sold_to)
        from public.raffle_numbers n
       where n.raffle_id = p_raffle_id
         and n.number = any (v_numeros)) <> 1 then
    raise exception 'Los números elegidos son de compradores distintos';
  end if;

  if v_comprador is null then
    raise exception 'Los números sin comprador no pueden tener un pago registrado';
  end if;

  v_monto := round(
    coalesce(p_amount, coalesce(v_precio, 0) * cardinality(v_numeros)),
    2
  );

  if v_monto is null or v_monto <= 0 then
    raise exception 'El importe tiene que ser mayor que cero';
  end if;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_comprador, p_raffle_id, v_numeros, v_monto, 'approved')
  returning id into v_pago;

  -- Solo el enlace: ni status ni sold_to cambian, el resultado no se toca.
  update public.raffle_numbers
     set payment_id = v_pago
   where raffle_id = p_raffle_id
     and number = any (v_numeros);

  insert into public.raffle_audit (raffle_id, actor_id, action, numbers, amount, reason)
  values (
    p_raffle_id,
    v_uid,
    'register_payment',
    v_numeros,
    v_monto,
    case when v_estado = 'drawn'
      then 'pago registrado despues del sorteo (solo contabilidad, no cambia el resultado)'
      else 'pago registrado por el organizador'
    end
  );

  return v_pago;
end;
$$;

revoke all on function public.organizer_register_payment(uuid, int[], numeric)
  from public, anon;
grant execute on function public.organizer_register_payment(uuid, int[], numeric)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0099', 'registrar pagos con el sorteo sorteado (solo contabilidad) y auditar el aviso al ganador')
    on conflict (version) do nothing;
  end if;
end;
$$;

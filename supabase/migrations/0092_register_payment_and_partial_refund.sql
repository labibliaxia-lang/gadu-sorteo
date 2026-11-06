-- =====================================================================
-- 0092 — Ventas: registrar pago y elegir qué números devolver
-- =====================================================================
-- Qué agrega sobre 0091:
--   1. `organizer_register_payment(...)`: el organizador registra un pago que
--      ya cobró (transferencia en efectivo/alias) sobre números vendidos a mano.
--      Crea la fila en `payments` aprobada, la enlaza a los números y audita.
--   2. `raffle_sales_summary` devuelve además `numbers_manual`: los números
--      vendidos que todavía no tienen pago, para ofrecer el botón en la fila.
--   3. La auditoría acepta la acción 'register_payment'.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La auditoría acepta registrar pagos
-- ---------------------------------------------------------------------
alter table public.raffle_audit
  drop constraint if exists raffle_audit_action_check;

alter table public.raffle_audit
  add constraint raffle_audit_action_check check (action in (
    'release_reservation',
    'refund_numbers',
    'mark_sold',
    'register_payment'
  ));

-- ---------------------------------------------------------------------
-- 2) Resumen con los números sin pago
-- ---------------------------------------------------------------------
drop function if exists public.raffle_sales_summary(uuid);

create or replace function public.raffle_sales_summary(p_raffle_id uuid)
returns table (
  buyer_id uuid,
  full_name text,
  phone text,
  numbers int[],
  quantity integer,
  paid numeric,
  refunded numeric,
  net numeric,
  payment_state text,
  first_sale_at timestamptz,
  last_sale_at timestamptz,
  numbers_manual int[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not public.is_superadmin() and not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  return query
  with vendidos as (
    select n.sold_to as comprador, n.number, n.sold_at, n.payment_id
      from public.raffle_numbers n
     where n.raffle_id = p_raffle_id
       and n.status = 'sold'
  ),
  pagado as (
    select p.user_id as comprador,
           sum(p.amount) as paid,
           bool_or(p.status = 'approved') as aprobado,
           bool_or(p.status = 'pending') as pendiente
      from public.payments p
     where p.raffle_id = p_raffle_id
     group by p.user_id
  ),
  devuelto as (
    select r.user_id as comprador, sum(r.amount) as refunded
      from public.refunds r
     where r.raffle_id = p_raffle_id
     group by r.user_id
  )
  select
    v.comprador,
    coalesce(nullif(btrim(pr.full_name), ''), 'Sin comprador registrado'),
    nullif(btrim(pr.phone), ''),
    array_agg(v.number order by v.number),
    count(*)::integer,
    coalesce(pg.paid, 0),
    coalesce(dv.refunded, 0),
    coalesce(pg.paid, 0) - coalesce(dv.refunded, 0),
    case
      when coalesce(pg.aprobado, false) then 'pagado'
      when coalesce(pg.pendiente, false) then 'pendiente'
      else 'manual'
    end,
    min(v.sold_at),
    max(v.sold_at),
    (array_agg(v.number order by v.number) filter (where v.payment_id is null))
      as numbers_manual
  from vendidos v
  left join public.profiles pr on pr.id = v.comprador
  left join pagado pg on pg.comprador is not distinct from v.comprador
  left join devuelto dv on dv.comprador is not distinct from v.comprador
  group by v.comprador, pr.full_name, pr.phone, pg.paid, pg.aprobado, pg.pendiente, dv.refunded
  order by count(*) desc, max(v.sold_at) desc nulls last;
end;
$$;

revoke all on function public.raffle_sales_summary(uuid) from public, anon;
grant execute on function public.raffle_sales_summary(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Registrar un pago ya cobrado
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

  if v_estado not in ('active', 'closed') then
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
    'pago registrado por el organizador'
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
    values ('0092', 'ventas: registrar pago sobre numeros vendidos a mano y elegir numeros a devolver')
    on conflict (version) do nothing;
  end if;
end;
$$;

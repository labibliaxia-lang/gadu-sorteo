-- =====================================================================
-- 0091 — Panel de ventas: plata real, devolución con liberación y auditoría
-- =====================================================================
-- Spec: 02-DOCS/wiki/ftd/panel-ventas.md
--
-- Qué agrega:
--   1. `raffle_audit`: quién liberó o devolvió qué, con monto y motivo.
--   2. `raffle_sales_summary(raffle)`: una fila por comprador con lo cobrado
--      (payments.amount), lo devuelto (refunds) y el neto. La planilla deja de
--      calcular `números × precio`.
--   3. `refund_and_release_numbers(...)`: devuelve y libera números vendidos,
--      repartiendo cada pago entre sus números (mismo criterio que 0079),
--      exigiendo motivo y auditando.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Auditoría del organizador
-- ---------------------------------------------------------------------
create table if not exists public.raffle_audit (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    'release_reservation',
    'refund_numbers',
    'mark_sold'
  )),
  numbers int[] not null default '{}',
  amount numeric(12, 2),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists raffle_audit_raffle_idx
  on public.raffle_audit (raffle_id, created_at desc);

alter table public.raffle_audit enable row level security;

revoke all on public.raffle_audit from public, anon, authenticated;
grant select on public.raffle_audit to authenticated;
grant all on public.raffle_audit to service_role;

drop policy if exists raffle_audit_select_owner on public.raffle_audit;
create policy raffle_audit_select_owner
on public.raffle_audit for select
to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1 from public.raffles r
     where r.id = raffle_id and r.created_by = auth.uid()
  )
);

-- Sin política de INSERT: escriben las funciones security definer.

-- ---------------------------------------------------------------------
-- 2) Resumen de ventas con plata real
-- ---------------------------------------------------------------------
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
  last_sale_at timestamptz
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
    select n.sold_to as comprador, n.number, n.sold_at
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
    max(v.sold_at)
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
-- 3) Devolver y liberar números vendidos
-- ---------------------------------------------------------------------
create or replace function public.refund_and_release_numbers(
  p_raffle_id uuid,
  p_numbers int[],
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado text;
  v_motivo text := btrim(coalesce(p_reason, ''));
  v_numeros int[];
  v_total numeric := 0;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not public.is_admin() or not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  select r.status into v_estado
    from public.raffles r
   where r.id = p_raffle_id
   for update;

  if v_estado is null then
    raise exception 'El sorteo no existe';
  end if;

  if v_estado not in ('active', 'closed') then
    raise exception 'El sorteo está %: no se pueden liberar números', v_estado;
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribí un motivo de al menos 10 caracteres';
  end if;

  select array_agg(distinct n.number order by n.number)
    into v_numeros
    from public.raffle_numbers n
   where n.raffle_id = p_raffle_id
     and n.status = 'sold'
     and n.number = any (coalesce(p_numbers, array[]::int[]));

  if v_numeros is null then
    return 0;
  end if;

  -- Cada pago se reparte entre los números vendidos que cubre (criterio 0079).
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
        when n.payment_id is null then r.price_per_number
        else coalesce(pay.amount, r.price_per_number) / pagos.numeros
      end as importe
      from public.raffle_numbers n
      join public.raffles r on r.id = n.raffle_id
      left join public.payments pay on pay.id = n.payment_id
      left join pagos on pagos.payment_id = n.payment_id
     where n.raffle_id = p_raffle_id
       and n.status = 'sold'
       and n.number = any (v_numeros)
       and n.sold_to is not null
  )
  select coalesce(round(sum(importe), 2), 0) into v_total from items;

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
        when n.payment_id is null then r.price_per_number
        else coalesce(pay.amount, r.price_per_number) / pagos.numeros
      end as importe
      from public.raffle_numbers n
      join public.raffles r on r.id = n.raffle_id
      left join public.payments pay on pay.id = n.payment_id
      left join pagos on pagos.payment_id = n.payment_id
     where n.raffle_id = p_raffle_id
       and n.status = 'sold'
       and n.number = any (v_numeros)
       and n.sold_to is not null
  )
  insert into public.refunds (raffle_id, user_id, amount)
  select p_raffle_id, sold_to, round(sum(importe), 2)
    from items
   group by sold_to
  on conflict (raffle_id, user_id)
  do update set amount = public.refunds.amount + excluded.amount;

  update public.raffle_numbers
     set status = 'available',
         sold_to = null,
         sold_at = null,
         payment_id = null,
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'sold'
     and number = any (v_numeros);

  get diagnostics v_count = row_count;

  insert into public.raffle_audit (raffle_id, actor_id, action, numbers, amount, reason)
  values (p_raffle_id, v_uid, 'refund_numbers', v_numeros, v_total, v_motivo);

  return v_count;
end;
$$;

revoke all on function public.refund_and_release_numbers(uuid, int[], text)
  from public, anon;
grant execute on function public.refund_and_release_numbers(uuid, int[], text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0091', 'panel de ventas: resumen con plata real, devolucion con liberacion y auditoria')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- 0063 — Cancelación de sorteos y devoluciones manuales (idempotente)
-- =====================================================================
-- Un sorteo activo/cerrado que no alcanzó el mínimo puede cancelarse.
-- No se toca el motor de sorteo: `draw_winner_core` solo acepta active/closed.
--
-- Al cancelar:
--   - se liberan las reservas,
--   - se crea una devolución pendiente por comprador con números vendidos,
--   - el organizador las marca como pagadas cuando devuelve el dinero.
--
-- No hay reembolsos automáticos: el cobro es por transferencia/prepago manual.
-- =====================================================================

alter table public.raffles
  drop constraint if exists raffles_status_check;

alter table public.raffles
  add constraint raffles_status_check
  check (status in ('active', 'closed', 'drawn', 'cancelled'));

alter table public.raffles
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (raffle_id, user_id)
);

create index if not exists refunds_raffle_idx
  on public.refunds (raffle_id, status);
create index if not exists refunds_user_idx
  on public.refunds (user_id, created_at desc);

alter table public.refunds enable row level security;

drop policy if exists refunds_select_owner_or_buyer on public.refunds;
create policy refunds_select_owner_or_buyer
  on public.refunds for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = refunds.raffle_id and r.created_by = auth.uid()
    )
  );

drop policy if exists refunds_update_organizer on public.refunds;
create policy refunds_update_organizer
  on public.refunds for update
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = refunds.raffle_id and r.created_by = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = refunds.raffle_id and r.created_by = auth.uid()
    )
  );

revoke all on public.refunds from public, anon, authenticated;
grant select, update on public.refunds to authenticated;
grant all on public.refunds to service_role;

-- El organizador solo puede cambiar estado/nota/paid_at; no el monto ni el
-- comprador. `paid_at` se completa al marcar la devolución como pagada.
create or replace function public.guard_refund_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_superadmin() then
    if new.raffle_id is distinct from old.raffle_id
       or new.user_id is distinct from old.user_id
       or new.amount is distinct from old.amount then
      raise exception 'No se puede modificar el monto ni el comprador de la devolución';
    end if;
  end if;

  if new.status = 'paid' and old.status <> 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  if new.status = 'pending' then
    new.paid_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_refund_update on public.refunds;
create trigger guard_refund_update
  before update on public.refunds
  for each row execute procedure public.guard_refund_update();


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

  insert into public.refunds (raffle_id, user_id, amount)
  select
    p_raffle_id,
    n.sold_to,
    count(*) * v_raffle.price_per_number
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold'
    and n.sold_to is not null
  group by n.sold_to
  on conflict (raffle_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cancel_raffle(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_raffle(uuid, text) to authenticated;

insert into public._applied_migrations (version, note)
values ('0063', 'cancelacion de sorteos y devoluciones manuales')
on conflict (version) do nothing;

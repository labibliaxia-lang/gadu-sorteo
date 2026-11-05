-- =====================================================================
-- 0082 — Baja de cuenta: solicitud, validaciones y anonimización posible
-- =====================================================================
-- Por qué (spec: 02-DOCS/wiki/ftd/baja-de-cuenta.md):
--   Hoy el único camino para darse de baja es un mail, y el borrado del panel
--   destroza registros de dinero: `payments.user_id` y `refunds.user_id` son
--   `on delete cascade`, así que borrar al comprador borra sus pagos.
--   Para poder ANONIMIZAR en vez de destruir, la cascada tiene que dejar de
--   ser cascada: los importes sobreviven con `user_id` en null.
--
-- Qué agrega:
--   1. `account_deletion_requests`: la solicitud, con una sola pendiente por
--      usuario y RLS (el usuario ve y cancela la suya; el superadmin ve todo).
--   2. `payments.user_id` y `refunds.user_id` pasan a nullable con
--      `on delete set null`.
--   3. `account_deletion_blockers(uid)`: las cuatro condiciones que impiden
--      aprobar la baja, en un solo lugar, para que la pantalla y la acción no
--      puedan discrepar.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Solicitudes
-- ---------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  anonymized_at timestamptz
);

-- Una sola solicitud abierta por persona.
create unique index if not exists account_deletion_one_pending
  on public.account_deletion_requests (user_id)
  where status = 'pending';

create index if not exists account_deletion_status_idx
  on public.account_deletion_requests (status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

revoke all on public.account_deletion_requests from public, anon;
grant select, insert, update on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

drop policy if exists adr_select_own_or_super on public.account_deletion_requests;
create policy adr_select_own_or_super
on public.account_deletion_requests for select
to authenticated
using (user_id = auth.uid() or public.is_superadmin());

-- Alta: solo la propia, en pending y sin campos de revisión.
drop policy if exists adr_insert_own on public.account_deletion_requests;
create policy adr_insert_own
on public.account_deletion_requests for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
  and anonymized_at is null
);

-- El usuario solo puede cancelar la suya y solo si sigue pendiente.
drop policy if exists adr_cancel_own on public.account_deletion_requests;
create policy adr_cancel_own
on public.account_deletion_requests for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'cancelled');

-- El superadmin resuelve.
drop policy if exists adr_super_update on public.account_deletion_requests;
create policy adr_super_update
on public.account_deletion_requests for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- ---------------------------------------------------------------------
-- 2) Dejar de destruir la plata: la cascada pasa a set null
-- ---------------------------------------------------------------------
do $$
declare
  v_attnum smallint;
  c record;
begin
  -- payments.user_id
  select attnum into v_attnum
    from pg_attribute
   where attrelid = 'public.payments'::regclass and attname = 'user_id';

  for c in
    select conname from pg_constraint
     where conrelid = 'public.payments'::regclass
       and contype = 'f'
       and conkey = array[v_attnum]
  loop
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;

  alter table public.payments alter column user_id drop not null;
end $$;

alter table public.payments
  add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

do $$
declare
  v_attnum smallint;
  c record;
begin
  -- refunds.user_id (apunta a profiles)
  select attnum into v_attnum
    from pg_attribute
   where attrelid = 'public.refunds'::regclass and attname = 'user_id';

  for c in
    select conname from pg_constraint
     where conrelid = 'public.refunds'::regclass
       and contype = 'f'
       and conkey = array[v_attnum]
  loop
    execute format('alter table public.refunds drop constraint %I', c.conname);
  end loop;

  alter table public.refunds alter column user_id drop not null;
end $$;

alter table public.refunds
  add constraint refunds_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3) Las cuatro condiciones, en un solo lugar
-- ---------------------------------------------------------------------
create or replace function public.account_deletion_blockers(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(motivo order by motivo), array[]::text[])
  from (
    select 'sorteos_abiertos' as motivo
     where exists (
       select 1 from public.raffles
        where created_by = p_user and status in ('active', 'closed')
     )
    union all
    select 'pagos_en_vuelo'
     where exists (
       select 1 from public.payments
        where user_id = p_user and status = 'pending'
     )
    union all
    select 'devoluciones_pendientes'
     where exists (
       select 1 from public.refunds
        where user_id = p_user and status = 'pending'
     )
    union all
    select 'numeros_en_sorteos_abiertos'
     where exists (
       select 1
         from public.raffle_numbers n
         join public.raffles r on r.id = n.raffle_id
        where (n.reserved_by = p_user or n.sold_to = p_user)
          and n.status in ('reserved', 'sold')
          and r.status in ('active', 'closed')
     )
  ) bloqueos;
$$;

comment on function public.account_deletion_blockers(uuid) is
  'Motivos por los que una cuenta todavia no puede darse de baja. Array vacio = puede.';

revoke all on function public.account_deletion_blockers(uuid)
  from public, anon;
grant execute on function public.account_deletion_blockers(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0082', 'baja de cuenta: solicitudes, RLS y validaciones; pagos y devoluciones ya no se borran en cascada')
    on conflict (version) do nothing;
  end if;
end;
$$;

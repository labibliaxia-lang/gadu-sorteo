-- =====================================================================
-- 0089 — Bandeja de notificaciones del organizador (fase 1)
-- =====================================================================
-- Spec: 02-DOCS/wiki/ftd/notificaciones-organizador.md
--
-- Qué agrega:
--   1. `notifications`: una fila por decisión pendiente, con RLS por
--      organizador. El cliente NO inserta: la crean las funciones.
--   2. `notificar_reserva(...)`: helper que arma el aviso con números,
--      comprador, precio y vencimiento.
--   3. `reserve_numbers` y `reserve_numbers_prepaid` avisan al reservar
--      (una notificación por reserva, no por número).
--   4. `release_expired_reservations` avisa al liberar por vencimiento.
--   5. `extend_reservation(...)`: el organizador puede dar +N minutos.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'reservation_pending',
    'payment_approved',
    'reservation_expired',
    'refund_requested',
    'draw_ready',
    'report_pending'
  )),
  raffle_id uuid references public.raffles (id) on delete cascade,
  subject_user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  priority text not null default 'normal'
    check (priority in ('urgent', 'normal', 'info')),
  status text not null default 'pending'
    check (status in ('pending', 'read', 'resolved', 'expired')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz
);

create index if not exists notifications_pendientes_idx
  on public.notifications (user_id, status, priority, expires_at);

create index if not exists notifications_historial_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

revoke all on public.notifications from public, anon;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications for select
to authenticated
using (user_id = auth.uid() or public.is_superadmin());

-- Solo se puede tocar el estado de la propia notificación.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Sin política de INSERT: las crea el servidor (security definer o service role).

-- Realtime para la campana.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception
      when duplicate_object then null;
      when others then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Helper
-- ---------------------------------------------------------------------
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

  select coalesce(nullif(btrim(p.full_name), ''), 'Un comprador')
    into v_nombre
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
-- 3) reserve_numbers avisa al organizador (cuerpo de 0088 + aviso)
-- ---------------------------------------------------------------------
create or replace function public.reserve_numbers(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requested int[];
  v_reserved int[];
  v_expira timestamptz;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
  end if;

  if not public.check_rate_limit('reserve:' || v_uid::text, 20, 3600) then
    raise exception 'Demasiadas reservas seguidas. Probá de nuevo en unos minutos.';
  end if;

  select coalesce(array_agg(distinct x order by x), array[]::int[])
    into v_requested
    from unnest(coalesce(p_numbers, array[]::int[])) as x;

  if array_length(v_requested, 1) is null then
    return array[]::int[];
  end if;

  if array_length(v_requested, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(v_requested) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  if exists (
    select 1 from public.raffles
    where id = p_raffle_id and draw_date <= now()
  ) then
    raise exception 'El sorteo ya alcanzó su fecha: no se pueden reservar números';
  end if;

  update public.raffle_numbers
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and reserved_by = v_uid
     and reserved_until is not null
     and reserved_until < now();

  v_expira := now() + interval '10 minutes';

  with nuevos as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = v_expira
     where raffle_id = p_raffle_id
       and number = any (v_requested)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number order by number), array[]::int[])
    into v_reserved
  from nuevos;

  perform public.notificar_reserva(p_raffle_id, v_uid, v_reserved, v_expira);

  return v_reserved;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) reserve_numbers_prepaid también avisa (cuerpo de 0040 + aviso)
-- ---------------------------------------------------------------------
create or replace function public.reserve_numbers_prepaid(
  p_raffle_id uuid,
  p_numbers int[],
  p_hold_hours integer default 48
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hold integer;
  v_reserved int[];
  v_expira timestamptz;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
  end if;

  if not public.check_rate_limit('reserve:' || v_uid::text, 20, 3600) then
    raise exception 'Demasiadas reservas seguidas. Probá de nuevo en unos minutos.';
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is null then
    raise exception 'Elegí al menos un número';
  end if;

  if array_length(p_numbers, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(p_numbers) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  v_hold := greatest(1, least(coalesce(p_hold_hours, 48), 72));

  update public.raffle_numbers
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and reserved_by = v_uid
     and reserved_until is not null
     and reserved_until < now();

  v_expira := now() + make_interval(hours => v_hold);

  with updated as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = v_expira
     where raffle_id = p_raffle_id
       and number = any (p_numbers)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number), array[]::int[])
    into v_reserved
  from updated;

  perform public.notificar_reserva(p_raffle_id, v_uid, v_reserved, v_expira);

  return v_reserved;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Vencimiento avisa antes de liberar
-- ---------------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Aviso agrupado por comprador y sorteo, antes de soltar los números.
  with victimas as (
    select
      n.raffle_id,
      n.reserved_by,
      array_agg(n.number order by n.number) as numeros
      from public.raffle_numbers n
     where n.status = 'reserved'
       and n.reserved_until < now()
       and n.reserved_by is not null
       and not exists (
         select 1
           from public.payments p
          where p.raffle_id = n.raffle_id
            and p.status = 'pending'
            and n.number = any (p.numbers)
            and p.created_at > now() - interval '24 hours'
       )
     group by n.raffle_id, n.reserved_by
  ),
  avisos as (
    insert into public.notifications (
      user_id, type, raffle_id, subject_user_id, payload, priority
    )
    select
      r.created_by,
      'reservation_expired',
      v.raffle_id,
      v.reserved_by,
      jsonb_build_object('numbers', to_jsonb(v.numeros), 'count', cardinality(v.numeros)),
      'info'
      from victimas v
      join public.raffles r on r.id = v.raffle_id
     where r.created_by is not null
    returning 1
  )
  select count(*) into v_count from avisos;

  update public.raffle_numbers n
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where n.status = 'reserved'
     and n.reserved_until < now()
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
-- 6) Ampliar la reserva (solo el organizador del sorteo)
-- ---------------------------------------------------------------------
create or replace function public.extend_reservation(
  p_raffle_id uuid,
  p_numbers int[],
  p_minutes int default 15
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min int := greatest(5, least(coalesce(p_minutes, 15), 60));
  v_count int;
  v_nueva timestamptz;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not public.is_admin() or not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  if p_numbers is null or cardinality(p_numbers) = 0 then
    return 0;
  end if;

  update public.raffle_numbers
     set reserved_until = greatest(coalesce(reserved_until, now()), now())
                          + make_interval(mins => v_min)
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and number = any (p_numbers);

  get diagnostics v_count = row_count;

  select min(n.reserved_until) into v_nueva
    from public.raffle_numbers n
   where n.raffle_id = p_raffle_id
     and n.status = 'reserved'
     and n.number = any (p_numbers);

  update public.notifications
     set expires_at = v_nueva
   where raffle_id = p_raffle_id
     and type = 'reservation_pending'
     and status = 'pending';

  return v_count;
end;
$$;

revoke all on function public.extend_reservation(uuid, int[], int)
  from public, anon;
grant execute on function public.extend_reservation(uuid, int[], int)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0089', 'bandeja de notificaciones del organizador: reserva, vencimiento y ampliar')
    on conflict (version) do nothing;
  end if;
end;
$$;

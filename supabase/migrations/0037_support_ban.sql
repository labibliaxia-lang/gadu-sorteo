-- =====================================================================
-- 0037 — Soporte y ban de cuentas (idempotente)
-- =====================================================================
-- Objetivo: que el superadmin pueda revisar cuentas y suspenderlas.
--
-- 1) profiles: is_banned, banned_at, ban_reason, banned_by.
-- 2) Trigger: solo superadmin/service_role pueden tocar esos campos; un
--    usuario baneado no puede desbanearse por PostgREST.
-- 3) reserve_numbers_prepaid: rechaza reservas de cuentas suspendidas
--    (el ban de Auth no invalida un access token ya emitido por hasta 1 h).
--
-- No toca pagos ni sorteos. Es idempotente.
-- =====================================================================

alter table public.profiles
  add column if not exists is_banned boolean not null default false;

alter table public.profiles
  add column if not exists banned_at timestamptz;

alter table public.profiles
  add column if not exists ban_reason text;

alter table public.profiles
  add column if not exists banned_by uuid references auth.users (id) on delete set null;

create index if not exists profiles_is_banned_idx
  on public.profiles (is_banned)
  where is_banned;

-- ---------------------------------------------------------------------
-- Trigger de protección de los campos de ban
-- ---------------------------------------------------------------------
create or replace function public.guard_ban_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service_role y SQL Editor no tienen auth.uid(); el superadmin sí puede.
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  if old.is_banned is distinct from new.is_banned
     or old.banned_at is distinct from new.banned_at
     or old.ban_reason is distinct from new.ban_reason
     or old.banned_by is distinct from new.banned_by then
    raise exception 'No autorizado';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_ban_fields on public.profiles;
create trigger guard_ban_fields
  before update of is_banned, banned_at, ban_reason, banned_by
  on public.profiles
  for each row execute procedure public.guard_ban_fields();

-- ---------------------------------------------------------------------
-- Reservas: una cuenta suspendida no puede reservar
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
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
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

  -- Techo de 72 h: una reserva olvidada no puede inmovilizar el sorteo.
  v_hold := greatest(1, least(coalesce(p_hold_hours, 48), 72));

  -- Libera solo las reservas vencidas del propio usuario en este sorteo.
  update public.raffle_numbers
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and status = 'reserved'
    and reserved_by = v_uid
    and reserved_until is not null
    and reserved_until < now();

  with updated as (
    update public.raffle_numbers
    set status = 'reserved',
        reserved_by = v_uid,
        reserved_until = now() + make_interval(hours => v_hold)
    where raffle_id = p_raffle_id
      and number = any (p_numbers)
      and status = 'available'
    returning number
  )
  select coalesce(array_agg(number), array[]::int[])
  into v_reserved
  from updated;

  return v_reserved;
end;
$$;

insert into public._applied_migrations (version, note)
values ('0037', 'soporte: ban de cuentas y reservas bloqueadas para suspendidos')
on conflict (version) do nothing;

-- =====================================================================
-- 0040 — Rate limiting en base (idempotente)
-- =====================================================================
-- Vercel no tiene memoria compartida entre instancias, así que el límite se
-- guarda en Postgres y se consulta con una función atómica.
--
-- 1) rate_limits: una fila por clave con ventana y contador.
-- 2) check_rate_limit(): incrementa y devuelve true si está dentro del límite.
--    Solo service_role la ejecuta; la usan las Server Actions y el RPC de
--    reservas (SECURITY DEFINER).
-- 3) reserve_numbers_prepaid: máximo 20 reservas por hora por usuario.
--
-- No afecta pagos ni sorteos. Es idempotente.
-- =====================================================================

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.rate_limits enable row level security;

revoke all on public.rate_limits from public, anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return true;
  end if;

  if p_max < 1 or p_window_seconds < 1 then
    return true;
  end if;

  insert into public.rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
  set
    count = case
      when public.rate_limits.window_start
        < now() - make_interval(secs => p_window_seconds)
      then 1
      else public.rate_limits.count + 1
    end,
    window_start = case
      when public.rate_limits.window_start
        < now() - make_interval(secs => p_window_seconds)
      then now()
      else public.rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------
-- Reservas: límite por usuario (20/h) además del chequeo de suspendidos
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
values ('0040', 'rate limiting en base para reservas y emails')
on conflict (version) do nothing;

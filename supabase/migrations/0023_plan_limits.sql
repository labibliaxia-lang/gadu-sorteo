-- =====================================================================
-- 0023 — Feature-gating por plan + enforcement en base (idempotente)
-- =====================================================================
-- Planes:
--   * organizador (común): hasta 2 sorteos activos y 1.000 números/sorteo.
--   * premium            : hasta 20 sorteos activos y 10.000 números/sorteo.
-- El frontend replica estos límites (lib/plans.ts), pero la base es la
-- fuente de verdad: estas funciones impiden saltarse la UI por API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Normalización de profiles.plan
--    ('free' legacy pasa a 'organizador').
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text not null default 'organizador';

-- Quita la restricción anterior ANTES de normalizar los valores.
alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  alter column plan set default 'organizador';

update public.profiles
set plan = 'organizador'
where plan = 'free';

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('organizador', 'premium'));

-- ---------------------------------------------------------------------
-- 2) Límites por plan (usados por la UI vía lib/plans.ts y por la BD).
-- ---------------------------------------------------------------------
create or replace function public.plan_max_active_raffles(p_plan text)
returns integer
language sql
immutable
as $$
  select case when lower(coalesce(p_plan, '')) = 'premium' then 20 else 2 end;
$$;

create or replace function public.plan_max_numbers(p_plan text)
returns integer
language sql
immutable
as $$
  select case when lower(coalesce(p_plan, '')) = 'premium' then 10000 else 1000 end;
$$;

-- ---------------------------------------------------------------------
-- 3) Tope de números por sorteo según el plan del dueño.
--    (Reemplaza la versión de 0006, mismo signature: uuid, integer.)
-- ---------------------------------------------------------------------
create or replace function public.create_raffle_numbers(
  p_raffle_id uuid,
  p_max_numbers integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_plan  text;
  v_limit integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  -- Dueño del sorteo: el organizador solo puede tocar los suyos.
  select created_by into v_owner
  from public.raffles
  where id = p_raffle_id;

  if not found then
    raise exception 'Sorteo no encontrado';
  end if;

  if not public.is_superadmin() and v_owner is distinct from v_uid then
    raise exception 'No autorizado';
  end if;

  select plan into v_plan
  from public.profiles
  where id = v_owner;

  v_limit := public.plan_max_numbers(v_plan);

  if p_max_numbers is null or p_max_numbers < 10 or p_max_numbers > v_limit then
    raise exception
      'Tu plan permite entre 10 y % números por sorteo', v_limit;
  end if;

  insert into public.raffle_numbers (raffle_id, number)
  select p_raffle_id, gs
  from generate_series(1, p_max_numbers) as gs
  on conflict (raffle_id, number) do nothing;
end;
$$;

revoke execute on function public.create_raffle_numbers(uuid, integer)
  from public, anon;
grant execute on function public.create_raffle_numbers(uuid, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4) Tope de sorteos activos según el plan del creador.
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_raffle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_plan   text;
  v_limit  integer;
  v_active integer;
begin
  if new.created_by is null then
    return new;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  select role, plan into v_role, v_plan
  from public.profiles
  where id = new.created_by;

  -- El superadmin no tiene tope.
  if v_role = 'superadmin' then
    return new;
  end if;

  v_limit := public.plan_max_active_raffles(v_plan);

  select count(*) into v_active
  from public.raffles
  where created_by = new.created_by
    and status = 'active'
    and id is distinct from new.id;

  if v_active >= v_limit then
    raise exception
      'Tu plan permite hasta % sorteos activos. Pasate a Premium para publicar más.',
      v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_plan_raffle_limit on public.raffles;
create trigger enforce_plan_raffle_limit
  before insert or update of status on public.raffles
  for each row execute procedure public.enforce_plan_raffle_limit();

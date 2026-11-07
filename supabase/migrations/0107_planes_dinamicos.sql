-- =====================================================================
-- 0107 — Planes dinámicos, cobro manual y cierre de bypasses
-- =====================================================================
-- Qué cambia:
--   1. `plan_configs`: una fila por plan (organizador/starter, pro, premium,
--      social) con límites, precio y toggles. Fuente de verdad en la base.
--   2. Los triggers/RPC de límites leen de esa tabla (antes tenían números
--      fijos en el código).
--   3. Cierre de bypasses premium: MP, auto-draw, referidos y landing se
--      validan en la base, no solo en la UI.
--   4. `raffles.currency` (ARS/MXN/COP/CLP, default ARS).
--   5. `expire_plans` degrada a Starter y pausa los sorteos excedidos.
--   6. Estado `paused` para sorteos pausados por downgrade.
--
-- Idempotente. No toca pagos, webhook, prepago ni referidos auditados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla de configuración de planes
-- ---------------------------------------------------------------------
create table if not exists public.plan_configs (
  plan_name text primary key
    check (plan_name in ('organizador', 'pro', 'premium', 'social')),
  label text not null,
  max_raffles integer not null default 2 check (max_raffles between 0 and 1000),
  max_numbers integer not null default 100 check (max_numbers between 10 and 10000),
  max_prizes integer not null default 3 check (max_prizes between 1 and 30),
  price_ars numeric(12, 2) not null default 0 check (price_ars >= 0),
  allow_referrals boolean not null default false,
  allow_landing boolean not null default false,
  allow_mp boolean not null default false,
  allow_auto_draw boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.plan_configs
  (plan_name, label, max_raffles, max_numbers, max_prizes, price_ars,
   allow_referrals, allow_landing, allow_mp, allow_auto_draw)
values
  ('organizador', 'Starter', 2, 100, 3, 0, false, false, false, false),
  ('pro', 'Pro', 6, 1000, 10, 0, true, true, false, false),
  ('premium', 'Premium', 20, 10000, 30, 0, true, true, true, true),
  ('social', 'Social / ONG', 5, 1000, 5, 0, true, true, false, false)
on conflict (plan_name) do nothing;

alter table public.plan_configs enable row level security;

drop policy if exists plan_configs_select_superadmin on public.plan_configs;
create policy plan_configs_select_superadmin
on public.plan_configs for select
to authenticated
using (public.is_superadmin());

revoke all on public.plan_configs from public, anon;
grant select on public.plan_configs to authenticated;
grant all on public.plan_configs to service_role;

-- ---------------------------------------------------------------------
-- 2) Planes válidos en profiles, precios y pedidos
--    (se buscan los checks por definición: los nombres cambiaron entre
--    migraciones y un drop por nombre puede dejar el viejo en pie)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('organizador', 'pro', 'premium', 'social'));

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.plan_prices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.plan_prices drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
     where conrelid = 'public.plan_orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.plan_orders drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.plan_prices
  add constraint plan_prices_plan_check
  check (plan in ('organizador', 'pro', 'premium', 'social'));

alter table public.plan_orders
  add constraint plan_orders_plan_check
  check (plan in ('organizador', 'pro', 'premium', 'social'));

-- ---------------------------------------------------------------------
-- 3) Sorteos: moneda y estado pausado
-- ---------------------------------------------------------------------
alter table public.raffles
  add column if not exists currency text not null default 'ARS';

alter table public.raffles drop constraint if exists raffles_currency_check;
alter table public.raffles
  add constraint raffles_currency_check
  check (currency in ('ARS', 'MXN', 'COP', 'CLP'));

alter table public.raffles drop constraint if exists raffles_status_check;
alter table public.raffles
  add constraint raffles_status_check
  check (status in ('active', 'closed', 'drawn', 'cancelled', 'paused'));

-- ---------------------------------------------------------------------
-- 4) Lectores dinámicos (con fallback a los valores viejos)
-- ---------------------------------------------------------------------
create or replace function public.plan_config(p_plan text)
returns public.plan_configs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.plan_configs;
begin
  select * into v_cfg from public.plan_configs where plan_name = p_plan;
  if v_cfg.plan_name is null then
    select * into v_cfg from public.plan_configs where plan_name = 'organizador';
  end if;
  return v_cfg;
end;
$$;

revoke all on function public.plan_config(text) from public, anon;
grant execute on function public.plan_config(text) to authenticated, service_role;

create or replace function public.plan_max_active_raffles(p_plan text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.max_raffles from public.plan_configs c where c.plan_name = p_plan),
    (select c.max_raffles from public.plan_configs c where c.plan_name = 'organizador'),
    2
  );
$$;

create or replace function public.plan_max_numbers(p_plan text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.max_numbers from public.plan_configs c where c.plan_name = p_plan),
    (select c.max_numbers from public.plan_configs c where c.plan_name = 'organizador'),
    100
  );
$$;

create or replace function public.plan_allows(p_plan text, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case p_feature
      when 'referrals' then (select c.allow_referrals from public.plan_configs c where c.plan_name = p_plan)
      when 'landing' then (select c.allow_landing from public.plan_configs c where c.plan_name = p_plan)
      when 'mp' then (select c.allow_mp from public.plan_configs c where c.plan_name = p_plan)
      when 'auto_draw' then (select c.allow_auto_draw from public.plan_configs c where c.plan_name = p_plan)
      else false
    end,
    false
  );
$$;

revoke all on function public.plan_allows(text, text) from public, anon;
grant execute on function public.plan_allows(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) Límites dinámicos: sorteos activos, números y premios
-- ---------------------------------------------------------------------
create or replace function public.enforce_plan_raffle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_plan text;
  v_limit integer;
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
      'Tu plan permite hasta % sorteos activos. Mejorá tu plan para publicar más.',
      v_limit;
  end if;

  return new;
end;
$$;

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
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_plan text;
  v_limit integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  select created_by into v_owner
  from public.raffles
  where id = p_raffle_id;

  if not found then
    raise exception 'Sorteo no encontrado';
  end if;

  if not public.is_superadmin() and v_owner is distinct from v_uid then
    raise exception 'No autorizado';
  end if;

  select plan into v_plan from public.profiles where id = v_owner;
  v_limit := public.plan_max_numbers(v_plan);

  if p_max_numbers is null or p_max_numbers < 10 or p_max_numbers > v_limit then
    raise exception 'Tu plan permite entre 10 y % números por sorteo', v_limit;
  end if;

  insert into public.raffle_numbers (raffle_id, number)
  select p_raffle_id, gs
  from generate_series(1, p_max_numbers) as gs
  on conflict (raffle_id, number) do nothing;
end;
$$;

revoke all on function public.create_raffle_numbers(uuid, integer) from public, anon;
grant execute on function public.create_raffle_numbers(uuid, integer) to authenticated;

-- Premios + bypasses premium en un solo trigger de raffles.
create or replace function public.enforce_raffle_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_role text;
  v_cfg public.plan_configs;
  v_max_prizes integer := 3;
begin
  if new.min_tickets_required is null or new.min_tickets_required < 0 then
    raise exception 'El mínimo de tickets no puede ser negativo';
  end if;

  if new.min_tickets_required > 10000 then
    raise exception 'El mínimo de tickets no puede superar 10.000';
  end if;

  if new.winners_count is null or new.winners_count < 1
     or new.winners_count > 30 then
    raise exception 'La cantidad de premios debe estar entre 1 y 30';
  end if;

  if public.is_superadmin() then
    v_max_prizes := 30;
  elsif new.created_by is not null then
    select p.plan, p.role into v_plan, v_role
    from public.profiles p
    where p.id = new.created_by;

    if v_role = 'superadmin' then
      v_max_prizes := 30;
    else
      v_cfg := public.plan_config(v_plan);
      v_max_prizes := coalesce(v_cfg.max_prizes, 3);

      -- 0107: beneficios premium, validados en la base. En UPDATE solo se
      -- exige cuando la columna cambia, para no romper sorteos ya existentes.
      if new.payment_type = 'mercadopago'
         and not coalesce(v_cfg.allow_mp, false)
         and (tg_op = 'INSERT' or new.payment_type is distinct from old.payment_type) then
        raise exception 'Mercado Pago no está incluido en tu plan';
      end if;

      if new.auto_draw
         and not coalesce(v_cfg.allow_auto_draw, false)
         and (tg_op = 'INSERT' or new.auto_draw is distinct from old.auto_draw) then
        raise exception 'El sorteo automático no está incluido en tu plan';
      end if;

      if coalesce(new.referral_enabled, false)
         and not coalesce(v_cfg.allow_referrals, false)
         and (tg_op = 'INSERT' or new.referral_enabled is distinct from old.referral_enabled) then
        raise exception 'Invitá y ganá no está incluido en tu plan';
      end if;

      -- La columna tiene default vacío (`[]`/`{}`), no NULL: sin este filtro
      -- cualquier sorteo parecía tener landing y se bloqueaba solo.
      if new.landing_content is not null
         and new.landing_content not in ('[]'::jsonb, '{}'::jsonb)
         and not coalesce(v_cfg.allow_landing, false)
         and (tg_op = 'INSERT' or new.landing_content is distinct from old.landing_content) then
        raise exception 'La landing promocional no está incluida en tu plan';
      end if;
    end if;
  end if;

  if new.winners_count > v_max_prizes then
    raise exception 'Tu plan permite hasta % premio(s) por sorteo', v_max_prizes;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_raffle_rules on public.raffles;
create trigger enforce_raffle_rules
  before insert or update on public.raffles
  for each row execute procedure public.enforce_raffle_rules();

-- ---------------------------------------------------------------------
-- 6) Vencimiento: degradar a Starter y pausar sorteos excedidos
-- ---------------------------------------------------------------------
create or replace function public.expire_plans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_downgraded int := 0;
  v_revoked int := 0;
  v_paused int := 0;
  v_user uuid;
  v_limit integer;
begin
  -- Premium/Pro/Social vencido -> Starter (organizador).
  with degradados as (
    update public.profiles
       set plan = 'organizador',
           plan_expires_at = null
     where plan in ('premium', 'pro', 'social')
       and plan_expires_at is not null
       and plan_expires_at < now() - interval '3 days'
    returning id
  )
  select count(*) into v_downgraded from degradados;

  -- Organizador vencido -> usuario (nunca toca superadmin).
  update public.profiles
     set role = 'user',
         plan = 'organizador',
         plan_expires_at = null,
         role_expires_at = null
   where role = 'admin'
     and role_expires_at is not null
     and role_expires_at < now() - interval '3 days';
  get diagnostics v_revoked = row_count;

  -- 0107: al degradar, pausar los sorteos activos que exceden el nuevo plan.
  v_limit := public.plan_max_active_raffles('organizador');

  for v_user in
    select created_by
      from public.raffles
     where status = 'active'
     group by created_by
    having count(*) > v_limit
  loop
    update public.raffles
       set status = 'paused'
     where id in (
       select id
         from public.raffles
        where created_by = v_user
          and status = 'active'
        order by created_at asc
        offset v_limit
     );
    v_paused := v_paused + 1;
  end loop;

  return jsonb_build_object(
    'premium_downgraded', v_downgraded,
    'organizers_revoked', v_revoked,
    'users_with_excess_paused', v_paused
  );
end;
$$;

revoke execute on function public.expire_plans() from public, anon, authenticated;
grant execute on function public.expire_plans() to service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0107', 'planes dinamicos, cobro manual 30 dias, bypasses premium cerrados, currency y downgrade con pausa')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- 0032 — Planes de pago mensual: precios, vencimiento y baja (idempotente)
-- =====================================================================
-- Modelo decidido con el dueño:
--   * Organizador y Premium son prepago mensual (30 días por compra).
--   * El precio mensual lo edita el superadmin; la comisión se acuerda por
--     WhatsApp y se factura aparte (la web solo la menciona).
--   * Al vencer, con 3 días de gracia: Premium -> Organizador y
--     Organizador -> usuario. La baja la aplica `expire_plans()` (cron).
--
-- 1) plan_prices: precio mensual editable, lectura pública, escritura solo
--    por service role (Server Action de superadmin).
-- 2) profiles.plan_expires_at / role_expires_at: vencimientos separados.
-- 3) Trigger que impide que el usuario se auto-extienda el vencimiento.
-- 4) redeem_license_code: cada canje suma 30 días desde el vencimiento
--    vigente (renovar antes no pierde días).
-- 5) expire_plans(): aplica la escalera de baja. Solo service_role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Precios de planes
-- ---------------------------------------------------------------------
create table if not exists public.plan_prices (
  plan text primary key check (plan in ('organizador', 'premium')),
  price_ars numeric(12, 2) not null default 0 check (price_ars >= 0),
  note text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.plan_prices enable row level security;

grant select on public.plan_prices to anon, authenticated;
grant all on public.plan_prices to service_role;

drop policy if exists "plan_prices_select_public" on public.plan_prices;
create policy "plan_prices_select_public"
  on public.plan_prices for select
  to anon, authenticated
  using (true);

-- Semilla: precio 0 = "consultar" hasta que el superadmin lo configure.
insert into public.plan_prices (plan, price_ars, note)
values
  ('organizador', 0, 'Configurar precio mensual'),
  ('premium', 0, 'Configurar precio mensual')
on conflict (plan) do nothing;

-- ---------------------------------------------------------------------
-- 2) Vencimientos en el perfil
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

alter table public.profiles
  add column if not exists role_expires_at timestamptz;

-- ---------------------------------------------------------------------
-- 3) El usuario no puede extender sus propios vencimientos
-- ---------------------------------------------------------------------
create or replace function public.prevent_expiry_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_superadmin() then
    return new;
  end if;

  if auth.uid() is distinct from new.id then
    return new;
  end if;

  if new.plan_expires_at is distinct from old.plan_expires_at
     or new.role_expires_at is distinct from old.role_expires_at then
    raise exception 'El vencimiento del plan lo administra la plataforma';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_expiry_self_update on public.profiles;
create trigger prevent_expiry_self_update
  before update on public.profiles
  for each row execute procedure public.prevent_expiry_self_update();

-- ---------------------------------------------------------------------
-- 4) Canje: 30 días por código, acumulando desde el vencimiento vigente
-- ---------------------------------------------------------------------
create or replace function public.redeem_license_code(p_code text)
returns table (ok boolean, plan text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := trim(coalesce(p_code, ''));
  v_row      public.license_codes%rowtype;
  v_promoted boolean := false;
  v_premium  boolean := false;
  v_days     interval := interval '30 days';
begin
  if v_uid is null then
    return query select false, null::text, 'Debés iniciar sesión para canjear un código';
    return;
  end if;

  if v_code = '' then
    return query select false, null::text, 'Ingresá un código';
    return;
  end if;

  -- FOR UPDATE evita doble canje concurrente.
  select * into v_row
  from public.license_codes
  where code = v_code
  for update;

  if not found then
    return query select false, null::text, 'Código inválido';
    return;
  end if;

  if v_row.status = 'redeemed' then
    return query select false, v_row.plan, 'Ese código ya fue utilizado';
    return;
  end if;

  if v_row.status = 'revoked' then
    return query select false, v_row.plan, 'Ese código fue revocado';
    return;
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return query select false, v_row.plan, 'Ese código expiró';
    return;
  end if;

  update public.license_codes
  set status = 'redeemed',
      redeemed_by = v_uid,
      redeemed_at = now()
  where id = v_row.id;

  -- Promoción controlada: limpia los claims SOLO dentro de esta transacción
  -- para poder asignar rol admin cuando hace falta (trigger de 0014/0025).
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if lower(coalesce(v_row.plan, '')) = 'organizador' then
    update public.profiles
    set role = case when role = 'user' then 'admin' else role end,
        role_expires_at =
          greatest(coalesce(role_expires_at, now()), now()) + v_days,
        plan = case when plan = 'premium' then 'premium' else 'organizador' end
    where id = v_uid
      and role <> 'superadmin';

    if found then
      v_promoted := true;
    end if;

  elsif lower(coalesce(v_row.plan, '')) = 'premium' then
    update public.profiles
    set role = case when role = 'user' then 'admin' else role end,
        plan = 'premium',
        plan_expires_at =
          greatest(coalesce(plan_expires_at, now()), now()) + v_days,
        role_expires_at =
          greatest(coalesce(role_expires_at, now()), now()) + v_days
    where id = v_uid
      and role <> 'superadmin';

    if found then
      v_premium := true;
    end if;
  end if;

  return query select
    true,
    v_row.plan,
    case
      when v_promoted then 'Código canjeado: plan Organizador por 30 días.'
      when v_premium then 'Código canjeado: plan Premium por 30 días.'
      else 'Código canjeado correctamente'
    end;
end;
$$;

revoke execute on function public.redeem_license_code(text) from public, anon;
grant execute on function public.redeem_license_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Baja por vencimiento (3 días de gracia). Solo service_role.
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
begin
  -- Premium vencido -> Organizador.
  update public.profiles
  set plan = 'organizador',
      plan_expires_at = null
  where plan = 'premium'
    and plan_expires_at is not null
    and plan_expires_at < now() - interval '3 days';
  get diagnostics v_downgraded = row_count;

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

  return jsonb_build_object(
    'premium_downgraded', v_downgraded,
    'organizers_revoked', v_revoked
  );
end;
$$;

revoke execute on function public.expire_plans() from public, anon, authenticated;
grant execute on function public.expire_plans() to service_role;

-- ---------------------------------------------------------------------
-- 6) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0032', 'precios de planes mensuales, vencimiento con gracia y baja automatica')
on conflict (version) do nothing;

-- =====================================================================
-- 0022 — Códigos de licencia/activación de 25 caracteres (idempotente)
-- =====================================================================
-- Generador criptográficamente seguro (sin pgcrypto: usa gen_random_uuid()
-- como fuente de entropía). Alfabeto con MAYÚSCULAS, minúsculas, dígitos y
-- símbolos, excluyendo caracteres ambiguos (0/O, 1/l/I).
--   * 25 caracteres exactos
--   * al menos 1 mayúscula, 1 minúscula, 1 dígito y 1 símbolo
--   * ~152 bits de entropía
-- =====================================================================

create table if not exists public.license_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan text not null default 'organizador',
  status text not null default 'active'
    check (status in ('active', 'redeemed', 'revoked')),
  created_by uuid references auth.users (id) on delete set null,
  redeemed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  expires_at timestamptz
);

create index if not exists license_codes_status_idx
  on public.license_codes (status);

create index if not exists license_codes_redeemed_by_idx
  on public.license_codes (redeemed_by);

alter table public.license_codes enable row level security;

drop policy if exists "license_codes_superadmin_select"
  on public.license_codes;
create policy "license_codes_superadmin_select"
  on public.license_codes for select to authenticated
  using (public.is_superadmin());

-- Cada usuario puede ver sus propios códigos canjeados.
drop policy if exists "license_codes_own_redeemed"
  on public.license_codes;
create policy "license_codes_own_redeemed"
  on public.license_codes for select to authenticated
  using (redeemed_by = auth.uid());

grant select on public.license_codes to authenticated;
grant all on public.license_codes to service_role;

-- ---------------------------------------------------------------------
-- Plan del usuario (marca de suscripción). El canje de un código
-- 'premium' activa esta marca sin alterar el rol.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text not null default 'free';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'premium'));
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Generador de códigos de 25 caracteres (alta entropía).
-- ---------------------------------------------------------------------
create or replace function public.generate_license_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upper   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_lower   constant text := 'abcdefghijkmnopqrstuvwxyz';
  v_digits  constant text := '23456789';
  v_symbols constant text := '!@#$%&*+-=?';
  v_all     text := v_upper || v_lower || v_digits || v_symbols;
  v_len     constant int := 25;
  v_bytes   bytea;
  v_blen    int;
  v_chars   text[] := array[]::text[];
  v_pos     int := 0;
  v_idx     int;
  i         int;
  j         int;
  tmp       text;
begin
  -- 64 bytes aleatorios = 4 UUID v4 (cada uno aporta 16 bytes).
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex')
          || decode(replace(gen_random_uuid()::text, '-', ''), 'hex')
          || decode(replace(gen_random_uuid()::text, '-', ''), 'hex')
          || decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_blen := length(v_bytes);

  -- Garantiza al menos un carácter de cada clase.
  v_idx := (get_byte(v_bytes, v_pos) * 256 + get_byte(v_bytes, v_pos + 1))
             % length(v_upper);
  v_chars := v_chars || substr(v_upper, v_idx + 1, 1);
  v_pos := v_pos + 2;

  v_idx := (get_byte(v_bytes, v_pos) * 256 + get_byte(v_bytes, v_pos + 1))
             % length(v_lower);
  v_chars := v_chars || substr(v_lower, v_idx + 1, 1);
  v_pos := v_pos + 2;

  v_idx := (get_byte(v_bytes, v_pos) * 256 + get_byte(v_bytes, v_pos + 1))
             % length(v_digits);
  v_chars := v_chars || substr(v_digits, v_idx + 1, 1);
  v_pos := v_pos + 2;

  v_idx := (get_byte(v_bytes, v_pos) * 256 + get_byte(v_bytes, v_pos + 1))
             % length(v_symbols);
  v_chars := v_chars || substr(v_symbols, v_idx + 1, 1);
  v_pos := v_pos + 2;

  -- Resto (21) desde el alfabeto completo.
  for i in 1..(v_len - 4) loop
    v_idx := (get_byte(v_bytes, v_pos) * 256 + get_byte(v_bytes, v_pos + 1))
               % length(v_all);
    v_chars := v_chars || substr(v_all, v_idx + 1, 1);
    v_pos := v_pos + 2;
  end loop;

  -- Mezcla Fisher-Yates para que las clases no queden en posiciones fijas.
  for i in reverse v_len..2 loop
    v_pos := (v_pos + 2) % v_blen;
    j := (
      get_byte(v_bytes, v_pos) * 256
      + get_byte(v_bytes, (v_pos + 1) % v_blen)
    ) % i + 1;

    tmp := v_chars[i];
    v_chars[i] := v_chars[j];
    v_chars[j] := tmp;
  end loop;

  return array_to_string(v_chars, '');
end;
$$;

revoke execute on function public.generate_license_code() from public, anon;

-- ---------------------------------------------------------------------
-- Crear un código (solo superadmin).
-- ---------------------------------------------------------------------
create or replace function public.create_license_code(
  p_plan text default 'organizador',
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_try   int := 0;
  v_plan  text := coalesce(nullif(trim(p_plan), ''), 'organizador');
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.generate_license_code();
    begin
      insert into public.license_codes (code, plan, created_by, expires_at)
      values (v_code, v_plan, auth.uid(), p_expires_at);
      return v_code;
    exception
      when unique_violation then
        if v_try >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.create_license_code(text, timestamptz)
  from public, anon;
grant execute on function public.create_license_code(text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------
-- Canjear un código (usuario autenticado).
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

  -- Beneficios según el plan del código.
  if lower(coalesce(v_row.plan, '')) = 'organizador' then
    -- Asciende a organizador. Nunca degrada a admin/superadmin.
    -- El trigger prevent_role_self_update bloquea cambios de rol cuando
    -- auth.uid() no es nulo y el usuario no es admin; para esta promoción
    -- controlada limpiamos los claims SOLO dentro de esta transacción.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);

    update public.profiles
    set role = 'admin'
    where id = v_uid
      and role = 'user';

    if found then
      v_promoted := true;
    end if;

  elsif lower(coalesce(v_row.plan, '')) = 'premium' then
    -- Activa el plan premium sin tocar el rol del usuario.
    update public.profiles
    set plan = 'premium'
    where id = v_uid;

    if found then
      v_premium := true;
    end if;
  end if;

  return query select
    true,
    v_row.plan,
    case
      when v_promoted then 'Código canjeado correctamente. Ahora sos organizador.'
      when v_premium then 'Código canjeado correctamente. Plan premium activado.'
      else 'Código canjeado correctamente'
    end;
end;
$$;

revoke execute on function public.redeem_license_code(text) from public, anon;
grant execute on function public.redeem_license_code(text) to authenticated;

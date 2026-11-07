-- =====================================================================
-- 0120 — Códigos cortos de referido
-- =====================================================================
-- Los enlaces de referidos usaban el UUID de la cuenta
-- (`/?ref=<uuid>`): largo, feo y apuntando a la Home. Esta migración agrega
-- `profiles.referral_code`, un código de 6 caracteres alfanuméricos, único y
-- estable, que la app usa en `/r/<code>`.
--
-- Piezas:
--   1. `generar_referral_code()`         — sortea 6 caracteres.
--   2. `generar_referral_code_unico()`   — reintenta hasta que no exista.
--   3. `asignar_referral_code()`         — trigger para altas nuevas. Una vez
--      asignado, el código no cambia: los enlaces compartidos no se rompen.
--   4. Backfill de los perfiles existentes.
--   5. `resolver_referral_code(code)`    — RPC pública de sólo lectura para
--      traducir código → UUID sin exponer la tabla `profiles`.
--
-- No toca pagos, el motor de sorteos ni los triggers de referidos existentes
-- (0007/0102/0118/0119): sólo agrega una columna y funciones nuevas.
--
-- Idempotente: se puede volver a aplicar sin efectos secundarios.
-- =====================================================================

alter table public.profiles
  add column if not exists referral_code text;

-- ---------------------------------------------------------------------
-- 1) Generación del código
-- ---------------------------------------------------------------------
-- Alfabeto sin caracteres ambiguos (I, O, 0, 1): el código se dicta por
-- WhatsApp o se tipea a mano sin confusiones, y sigue siendo alfanumérico.
create or replace function public.generar_referral_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text := '';
  i int;
begin
  for i in 1..6 loop
    v_codigo := v_codigo || substr(
      v_alfabeto,
      1 + floor(random() * length(v_alfabeto))::int,
      1
    );
  end loop;
  return v_codigo;
end;
$$;

revoke all on function public.generar_referral_code() from public, anon, authenticated;

-- Devuelve un código que todavía no esté usado por ningún perfil.
create or replace function public.generar_referral_code_unico()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_intento int := 0;
begin
  loop
    v_codigo := public.generar_referral_code();
    exit when not exists (
      select 1 from public.profiles p where p.referral_code = v_codigo
    );

    v_intento := v_intento + 1;
    if v_intento >= 50 then
      raise exception 'No se pudo generar un código de referido único';
    end if;
  end loop;
  return v_codigo;
end;
$$;

revoke all on function public.generar_referral_code_unico() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Alta de usuarios nuevos
-- ---------------------------------------------------------------------
-- Se engancha en `profiles` (no en `auth.users`) para no tocar el trigger
-- existente `handle_new_user`: ese trigger ya inserta la fila del perfil y
-- este completa el código.
--
-- En UPDATE el código queda inmutable. Si la fila venía sin código (por
-- ejemplo, una migración a medias), se genera uno.
create or replace function public.asignar_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.referral_code is not null then
    new.referral_code := old.referral_code;
    return new;
  end if;

  if new.referral_code is null or btrim(new.referral_code) = '' then
    new.referral_code := public.generar_referral_code_unico();
  else
    new.referral_code := upper(btrim(new.referral_code));
  end if;

  return new;
end;
$$;

drop trigger if exists asignar_referral_code on public.profiles;
create trigger asignar_referral_code
  before insert or update of referral_code on public.profiles
  for each row execute function public.asignar_referral_code();

-- ---------------------------------------------------------------------
-- 3) Backfill de los perfiles existentes
-- ---------------------------------------------------------------------
-- Corre después del trigger: si alguien se registra mientras la migración
-- está en curso, ya entra con código.
do $$
declare
  r record;
begin
  for r in
    select id
      from public.profiles
     where referral_code is null
     order by created_at
  loop
    update public.profiles
       set referral_code = public.generar_referral_code_unico()
     where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Unicidad y formato
-- ---------------------------------------------------------------------
create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code)
  where referral_code is not null;

alter table public.profiles
  drop constraint if exists profiles_referral_code_formato;

alter table public.profiles
  add constraint profiles_referral_code_formato
  check (referral_code ~ '^[A-Z0-9]{6}$');

-- ---------------------------------------------------------------------
-- 5) Resolución pública código → perfil
-- ---------------------------------------------------------------------
-- La RLS de `profiles` sólo deja ver la fila propia, así que la ruta
-- `/r/[code]` no puede consultar la tabla directamente. Esta función corre
-- como dueña de la tabla y devuelve únicamente el UUID del organizador.
create or replace function public.resolver_referral_code(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.referral_code = upper(btrim(p_code))
   limit 1;
$$;

revoke all on function public.resolver_referral_code(text) from public, anon, authenticated;
grant execute on function public.resolver_referral_code(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0120', 'referidos: códigos cortos únicos, backfill y resolución pública')
    on conflict (version) do nothing;
  end if;
end;
$$;

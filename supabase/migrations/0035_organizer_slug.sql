-- =====================================================================
-- 0035 — Slug público del organizador (idempotente)
-- =====================================================================
-- Objetivo: URLs legibles tipo /organizador/juan-perez en lugar del UUID.
--
-- 1) profiles.slug: único, generado desde full_name, estable (no cambia si el
--    usuario se renombra) y no editable por el propio usuario.
-- 2) Backfill de organizadores y superadmins existentes.
-- 3) Trigger de alta/cambio de rol para nuevas cuentas de panel.
-- 4) La vista public_organizers expone también `slug`.
--
-- No toca pagos, sorteos ni datos sensibles. Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columna y normalizador
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists slug text;

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(
        both '-'
        from regexp_replace(
          lower(
            translate(
              coalesce(p_text, ''),
              'áéíóúüñÁÉÍÓÚÜÑ',
              'aeiouunAEIOUUN'
            )
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      ''
    ),
    'organizador'
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Trigger: asigna y protege el slug
-- ---------------------------------------------------------------------
create or replace function public.ensure_profile_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_n int := 1;
begin
  if tg_op = 'UPDATE' then
    -- Una vez asignado, el enlace no se cambia desde la cuenta.
    if old.slug is not null then
      if new.slug is distinct from old.slug
         and auth.uid() is not null
         and not public.is_superadmin() then
        raise exception 'El enlace del perfil no se puede cambiar';
      end if;
      return new;
    end if;
  end if;

  -- Solo las cuentas de panel necesitan slug.
  if new.role not in ('admin', 'superadmin') then
    return new;
  end if;

  if new.slug is not null and length(trim(new.slug)) > 0 then
    return new;
  end if;

  v_base := public.slugify(new.full_name);
  v_candidate := v_base;

  while exists (
    select 1 from public.profiles p
    where p.slug = v_candidate and p.id <> new.id
  ) loop
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

drop trigger if exists ensure_profile_slug on public.profiles;
create trigger ensure_profile_slug
  before insert or update of full_name, role on public.profiles
  for each row execute procedure public.ensure_profile_slug();

-- ---------------------------------------------------------------------
-- 3) Backfill de cuentas existentes
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_n int;
begin
  for r in
    select id, full_name
    from public.profiles
    where slug is null
      and role in ('admin', 'superadmin')
    order by created_at
  loop
    v_base := public.slugify(r.full_name);
    v_candidate := v_base;
    v_n := 1;

    while exists (
      select 1 from public.profiles p where p.slug = v_candidate
    ) loop
      v_n := v_n + 1;
      v_candidate := v_base || '-' || v_n;
    end loop;

    update public.profiles set slug = v_candidate where id = r.id;
  end loop;
end;
$$;

create unique index if not exists profiles_slug_key
  on public.profiles (slug)
  where slug is not null;

-- ---------------------------------------------------------------------
-- 4) Vista pública con slug (y superadmins incluidos)
-- ---------------------------------------------------------------------
drop view if exists public.public_organizers;
create view public.public_organizers as
  select
    id,
    slug,
    full_name,
    avatar_url,
    is_verified
  from public.profiles
  where role in ('admin', 'superadmin');

revoke all on public.public_organizers from public, anon, authenticated;
grant select on public.public_organizers to anon, authenticated;
grant select on public.public_organizers to service_role;

-- ---------------------------------------------------------------------
-- 5) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0035', 'slug publico del organizador y vista public_organizers con slug')
on conflict (version) do nothing;

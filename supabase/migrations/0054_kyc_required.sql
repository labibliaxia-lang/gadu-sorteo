-- =====================================================================
-- 0054 — KYC obligatorio para publicar sorteos (idempotente)
-- =====================================================================
-- Requisitos para organizadores/premium:
--   * datos personales cargados: nombre, teléfono, ubicación y DNI;
--   * verificación aprobada por el superadmin (DNI + selfie).
--
-- El bloqueo vive en un trigger sobre raffles: cualquier alta o reapertura a
-- `active` sin KYC aprobado falla, aunque se llame directo a PostgREST.
-- Superadmin y service_role quedan exceptuados.
-- =====================================================================

alter table public.profiles
  add column if not exists dni_number text;

create or replace function public.enforce_organizer_kyc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  -- Superadmin y procesos de sistema no pasan por el requisito.
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  if new.status <> 'active' then
    return new;
  end if;

  -- Solo al crear o al reabrir/publicar; editar un sorteo ya activo no se
  -- bloquea para no romper la gestión existente.
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select
    p.verification_status,
    p.full_name,
    p.phone,
    p.location,
    p.dni_number
  into v_profile
  from public.profiles p
  where p.id = new.created_by;

  if not found
     or v_profile.verification_status <> 'approved'
     or nullif(btrim(coalesce(v_profile.full_name, '')), '') is null
     or nullif(btrim(coalesce(v_profile.phone, '')), '') is null
     or nullif(btrim(coalesce(v_profile.location, '')), '') is null
     or nullif(btrim(coalesce(v_profile.dni_number, '')), '') is null then
    raise exception
      'KYC incompleto: cargá tus datos personales y esperá la aprobación de identidad antes de publicar';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_organizer_kyc on public.raffles;
create trigger enforce_organizer_kyc
  before insert or update on public.raffles
  for each row execute procedure public.enforce_organizer_kyc();

insert into public._applied_migrations (version, note)
values ('0054', 'kyc obligatorio para publicar sorteos')
on conflict (version) do nothing;

-- =====================================================================
-- 0060 — Dirección de recepción de premios (idempotente)
-- =====================================================================
-- Todos los perfiles deben cargar una dirección de entrega. Es privada:
-- no se expone en public_organizers ni en ninguna página pública.
-- El organizador la ve únicamente para los ganadores de SUS sorteos.
--
-- Los organizadores/premium además cargan la dirección del DNI en el KYC;
-- la app exige que coincida con la dirección de entrega antes de aprobar.
-- =====================================================================

alter table public.profiles
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'AR',
  add column if not exists dni_address text;

-- La exigencia para publicar (0054) suma la dirección de entrega y la del DNI.
create or replace function public.enforce_organizer_kyc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select
    p.verification_status,
    p.full_name,
    p.phone,
    p.location,
    p.dni_number,
    p.address_line,
    p.city,
    p.province,
    p.postal_code,
    p.dni_address
  into v_profile
  from public.profiles p
  where p.id = new.created_by;

  if not found
     or v_profile.verification_status <> 'approved'
     or nullif(btrim(coalesce(v_profile.full_name, '')), '') is null
     or nullif(btrim(coalesce(v_profile.phone, '')), '') is null
     or nullif(btrim(coalesce(v_profile.location, '')), '') is null
     or nullif(btrim(coalesce(v_profile.dni_number, '')), '') is null
     or nullif(btrim(coalesce(v_profile.address_line, '')), '') is null
     or nullif(btrim(coalesce(v_profile.city, '')), '') is null
     or nullif(btrim(coalesce(v_profile.province, '')), '') is null
     or nullif(btrim(coalesce(v_profile.postal_code, '')), '') is null
     or nullif(btrim(coalesce(v_profile.dni_address, '')), '') is null then
    raise exception
      'KYC incompleto: cargá tus datos personales, dirección de entrega y dirección del DNI antes de publicar';
  end if;

  return new;
end;
$$;

insert into public._applied_migrations (version, note)
values ('0060', 'direccion de recepcion y direccion dni para kyc')
on conflict (version) do nothing;

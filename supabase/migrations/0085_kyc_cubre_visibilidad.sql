-- =====================================================================
-- 0085 — El KYC mira la VISIBILIDAD, no sólo el estado
-- =====================================================================
-- Qué resuelve: `enforce_organizer_kyc` (0060:34-36) arrancaba con
--
--     if new.status <> 'active' then return new; end if;
--
-- o sea: sólo exigía KYC para sorteos ACTIVOS. Pero la home no filtra por
-- estado —sólo por `is_listed`—, así que un sorteo `closed` se publica igual.
--
-- Consecuencia real: una cuenta con role='admin' pero SIN verificación aprobada
-- podía insertar un sorteo `closed` y ese sorteo aparecía en la home, con su
-- texto, su alias y su WhatsApp. En la plataforma no se puede reservar (para eso
-- hace falta `active`), pero la página es pública y ofrece un contacto: alcanza
-- para pedir transferencias por fuera. Es el vector de estafa clásico.
--
-- Y hay cómo llegar a role='admin' sin KYC: `prevent_role_self_update` (0010)
-- exige `is_admin()`, no `is_superadmin()`, así que un organizador ya aprobado
-- puede promover a otro. Ese otro queda sin verificar.
--
-- Qué cambia: la condición pasa a ser «¿este sorteo puede quedar visible?».
--
--     if new.status <> 'active' and new.is_listed is not true then return new; end if;
--
--   · Borrador no listado  (status<>'active' y is_listed=false) → no pide KYC.
--   · Cualquier cosa visible (active, o is_listed=true)      → pide KYC.
--
-- El UPDATE conserva la lógica de 0060 con la misma idea: si el sorteo YA era
-- visible (activo o listado), editar el título no vuelve a pedir el KYC. El
-- control ocurre al publicar, no en cada guardado.
--
-- Sin cambios en: los 9 campos exigidos, el mensaje de error, la exención de
-- `superadmin` y la de `service_role`/SQL Editor (`auth.uid()` nulo). `auth.uid()`
-- se lee de los claims, así que sigue funcionando dentro de esta función
-- `security definer` — es el error que cometí en la 0083 con `current_user`.
-- =====================================================================

create or replace function public.enforce_organizer_kyc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_visible boolean;
  v_ya_era_visible boolean;
begin
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;

  -- Visible = está a la venta o aparece en los listados.
  v_visible := (new.status = 'active') or (new.is_listed is true);

  if not v_visible then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_ya_era_visible := (old.status = 'active') or (old.is_listed is true);
    if v_ya_era_visible then
      return new;
    end if;
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

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0085', 'el KYC mira visibilidad (active o listado), no solo status')
    on conflict (version) do nothing;
  end if;
end
$$;

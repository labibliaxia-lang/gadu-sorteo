-- =====================================================================
-- 0031 — Congelar sorteos y proteger campos del perfil (idempotente)
-- =====================================================================
-- 1) Trigger en raffles: una vez que el sorteo está `drawn`, no se puede
--    cambiar el ganador ni reabrir el sorteo. Cierra el re-sorteo por UPDATE
--    directo (el dueño podía reabrir y volver a sortear).
-- 2) draw_winner falla explícitamente si el sorteo ya fue sorteado (además
--    del estado, que ya rechazaba), y mantiene el chequeo de dueño de 0030.
-- 3) Trigger de profiles: además de plan/KYC/solicitudes (0025), bloquea la
--    auto-edición de `email` e `is_verified`. El superadmin y el service_role
--    conservan acceso.
--
-- No se toca el esquema más allá de funciones y triggers. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Inmutabilidad del resultado
-- ---------------------------------------------------------------------
create or replace function public.prevent_drawn_raffle_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'drawn' then
    if new.status is distinct from old.status
       or new.winner_number is distinct from old.winner_number
       or new.winner_user_id is distinct from old.winner_user_id
       or new.winner_name is distinct from old.winner_name
       or new.drawn_at is distinct from old.drawn_at then
      raise exception
        'El sorteo ya fue sorteado: el resultado no se puede cambiar ni reabrir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_drawn_raffle_changes on public.raffles;
create trigger prevent_drawn_raffle_changes
  before update on public.raffles
  for each row execute procedure public.prevent_drawn_raffle_changes();

-- ---------------------------------------------------------------------
-- 2) draw_winner: falla si ya se sorteó; dueño o superadmin
-- ---------------------------------------------------------------------
create or replace function public.draw_winner(p_raffle_id uuid)
returns table (winning_number int, winner_user uuid, winner_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number int;
  v_user uuid;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'drawn'
  ) then
    raise exception 'El sorteo ya fue sorteado';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status in ('active', 'closed')
  ) then
    raise exception 'El sorteo no se puede sortear (estado inválido)';
  end if;

  select n.number, n.sold_to
  into v_number, v_user
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id and n.status = 'sold'
  order by random()
  limit 1;

  if v_number is null then
    raise exception 'No hay números vendidos para sortear';
  end if;

  select full_name into v_name
  from public.profiles
  where id = v_user;

  update public.raffles
  set status = 'drawn',
      winner_number = v_number,
      winner_user_id = v_user,
      winner_name = v_name,
      drawn_at = now()
  where id = p_raffle_id;

  return query select v_number, v_user, v_name;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Perfil: email e is_verified inmutables para el propio usuario
-- ---------------------------------------------------------------------
-- Copia de prevent_sensitive_self_update (0025) con dos campos más.
-- SECURITY INVOKER a propósito: no necesita privilegios extra.
create or replace function public.prevent_sensitive_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  -- Sin usuario final (service_role, cron, webhooks, migraciones): sin límites.
  if auth.uid() is null then
    return new;
  end if;

  -- El superadmin gestiona cualquier fila.
  if public.is_superadmin() then
    return new;
  end if;

  -- Un admin gestiona filas ajenas; esta protección es sólo para la propia.
  if auth.uid() is distinct from new.id then
    return new;
  end if;

  -- Email inmutable para el usuario: era editable y se usaba para altas de
  -- organizador (suplantación) y para la auditoría.
  if (v_new ->> 'email') is distinct from (v_old ->> 'email') then
    raise exception 'El email no se puede cambiar desde el perfil';
  end if;

  -- Sello de verificación: lo resuelve el superadmin, nunca el usuario.
  if (v_new ->> 'is_verified') is distinct from (v_old ->> 'is_verified') then
    raise exception 'La verificación de identidad la resuelve el superadmin';
  end if;

  -- Plan (paywall): no se puede auto-ascender a premium.
  if (v_new ->> 'plan') is distinct from (v_old ->> 'plan') then
    raise exception 'No tenés permisos para cambiar tu plan';
  end if;

  -- KYC: sólo se permite volver a 'pending' al subir documentos.
  if (v_new ->> 'verification_status') is distinct from (v_old ->> 'verification_status')
     and coalesce(v_new ->> 'verification_status', '') <> 'pending' then
    raise exception 'La verificación de identidad la resuelve el superadmin';
  end if;

  if (v_new ->> 'dni_verified') is distinct from (v_old ->> 'dni_verified')
     or (v_new ->> 'face_verified') is distinct from (v_old ->> 'face_verified') then
    raise exception 'La verificación de identidad la resuelve el superadmin';
  end if;

  -- Solicitud de organizador: el usuario sólo puede abrirla ('pending')
  -- o cancelarla ('none'); aprobarla o rechazarla es del superadmin.
  if (v_new ->> 'admin_request_status') is distinct from (v_old ->> 'admin_request_status')
     and coalesce(v_new ->> 'admin_request_status', 'none') not in ('pending', 'none') then
    raise exception 'Solo el superadmin puede resolver las solicitudes';
  end if;

  if (v_new ->> 'role_request_status') is distinct from (v_old ->> 'role_request_status')
     and coalesce(v_new ->> 'role_request_status', 'none') not in ('pending', 'none') then
    raise exception 'Solo el superadmin puede resolver las solicitudes';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_sensitive_self_update on public.profiles;
create trigger prevent_sensitive_self_update
  before update on public.profiles
  for each row execute procedure public.prevent_sensitive_self_update();

-- ---------------------------------------------------------------------
-- 4) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0031', 'congela resultado de sorteos y protege email/is_verified del perfil')
on conflict (version) do nothing;

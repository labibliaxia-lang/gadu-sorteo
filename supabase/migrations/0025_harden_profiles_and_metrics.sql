-- =====================================================================
-- 0025 — Endurecimiento de profiles + métricas globales del superadmin
-- =====================================================================
-- 1) Cierra la autoconcesión de privilegios por RLS: `profiles_update_own`
--    (0001) permite escribir CUALQUIER columna propia y el trigger de 0014
--    sólo vigila `role`. Sin esto, cualquier autenticado puede ponerse
--    plan='premium' (saltarse el paywall de 0023/0024), o
--    verification_status='approved' / dni_verified=true (saltarse el KYC
--    que revisa el superadmin en /admin/super).
-- 2) Añade los índices que faltaban para las métricas del panel.
-- 3) Añade `superadmin_metrics()`: recaudación y contadores exactos en la
--    base (la suma en JS estaba topada a 1000 filas por PostgREST).
-- 4) Restringe la lectura del registro de auditoría al superadmin.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas sensibles que un usuario NO puede modificar en su fila
-- ---------------------------------------------------------------------
-- Se usa to_jsonb(old/new) para no depender de que las migraciones 0011,
-- 0013, 0017 y 0023 estén aplicadas: si la columna no existe, el valor es
-- null a ambos lados y la comparación da "sin cambio".
--
-- La función es SECURITY INVOKER (el default) a propósito: no necesita más
-- privilegios que quien hace el UPDATE, y un trigger con SECURITY DEFINER es
-- superficie de escalada que aquí no compra nada.
--
-- ⚠️ La protección NO mira el rol de conexión (`current_user`). Mira si la
-- petición trae un usuario final (`auth.uid()`). Es a propósito: si alguien
-- conecta con otro rol —pooler en modo sesión, `postgres`, un rol propio— un
-- filtro por nombre de rol se saltearía el control **en silencio**, y un
-- control que deja de controlar sin avisar es peor que no tenerlo.
--
-- Queda exenta la escritura sin usuario final: service_role (Server Actions,
-- cron, webhooks), `postgres` (migraciones, DBA) y las funciones SECURITY
-- DEFINER que limpian los claims antes de escribir, como el canje de licencias
-- de 0022 (líneas 258-259):
--   * rama 'premium'  -> update profiles set plan='premium'  (0022:270-274)
--   * rama organizador-> update profiles set role='admin'
-- ---------------------------------------------------------------------
create or replace function public.prevent_sensitive_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  -- Sin usuario final (service_role, cron, webhooks, migraciones, funciones
  -- SECURITY DEFINER con los claims limpios): sin límites.
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
-- 2) Índices para las métricas y filtros del panel
-- ---------------------------------------------------------------------
create index if not exists payments_status_created_at_idx
  on public.payments (status, created_at desc);

create index if not exists raffle_numbers_sold_at_idx
  on public.raffle_numbers (sold_at) where status = 'sold';

create index if not exists profiles_admin_request_status_idx
  on public.profiles (admin_request_status);

create index if not exists profiles_role_created_at_idx
  on public.profiles (role, created_at desc);

-- ---------------------------------------------------------------------
-- 3) Métricas globales exactas (una sola llamada desde el panel)
-- ---------------------------------------------------------------------
-- Recaudación consolidada = pagos aprobados de Mercado Pago
--                        + ventas manuales aprobadas por el organizador
--                          (organizer_mark_sold de 0016 deja payment_id null,
--                          por lo que no generan fila en `payments`).
-- ---------------------------------------------------------------------
create or replace function public.superadmin_metrics(p_from timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_payments numeric := 0;
  v_payments_count bigint := 0;
  v_manual numeric := 0;
  v_manual_count bigint := 0;
  v_sold bigint := 0;
  v_active bigint := 0;
  v_users bigint := 0;
  v_by_role jsonb := '{}'::jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  select coalesce(sum(amount), 0), count(*)
  into v_payments, v_payments_count
  from public.payments
  where status = 'approved'
    and (p_from is null or created_at >= p_from);

  select coalesce(sum(r.price_per_number), 0), count(*)
  into v_manual, v_manual_count
  from public.raffle_numbers n
  join public.raffles r on r.id = n.raffle_id
  where n.status = 'sold'
    and n.payment_id is null
    and (p_from is null or n.sold_at >= p_from);

  select count(*)
  into v_sold
  from public.raffle_numbers
  where status = 'sold'
    and (p_from is null or sold_at >= p_from);

  select count(*) into v_active
  from public.raffles
  where status = 'active';

  select count(*) into v_users
  from public.profiles;

  select coalesce(jsonb_object_agg(t.role, t.total), '{}'::jsonb)
  into v_by_role
  from (
    select role, count(*) as total
    from public.profiles
    group by role
  ) t;

  return jsonb_build_object(
    'payments_revenue', v_payments,
    'payments_count', v_payments_count,
    'manual_revenue', v_manual,
    'manual_count', v_manual_count,
    'revenue_total', v_payments + v_manual,
    'numbers_sold', v_sold,
    'raffles_active', v_active,
    'users_total', v_users,
    'users_by_role', v_by_role,
    'from', p_from
  );
end;
$$;

revoke execute on function public.superadmin_metrics(timestamptz) from public, anon;
grant execute on function public.superadmin_metrics(timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Auditoría: sólo el superadmin (antes is_admin(), que incluye
--    organizadores -> cualquier organizador leía emails de toda la base).
-- ---------------------------------------------------------------------
drop policy if exists "audit_logs_select_admin" on public.admin_audit_logs;
drop policy if exists "audit_logs_select_superadmin" on public.admin_audit_logs;
create policy "audit_logs_select_superadmin"
  on public.admin_audit_logs for select
  using (public.is_superadmin());

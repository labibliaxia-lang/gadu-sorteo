-- =====================================================================
-- ¿Está en la base lo que el repositorio declara?
-- =====================================================================
-- Pegar todo en el SQL Editor y ejecutar. Sólo lee catálogos: no modifica
-- nada, no cambia roles, no necesita transacción.
--
-- Para qué sirve: el hallazgo #2 de la auditoría fue una migración aplicada a
-- medias —la función existía y el trigger no—, invisible porque el proyecto no
-- tiene ledger de migraciones (`supabase_migrations` no existe). Esto compara
-- lo declarado con lo que hay.
--
-- Devuelve una celda con una línea por comprobación: OK · FALTA · AVISO ·
-- CRÍTICO. Cualquier FALTA o CRÍTICO es una migración incompleta.
--
-- Detalle técnico: nunca se nombra una tabla o función que pueda no existir
-- (`to_regclass` / `to_regprocedure` / `CASE` perezoso). Nombrarlas haría que
-- el planificador falle con 42P01 antes de poder informar que faltan.
-- =====================================================================

select string_agg(linea, E'\n' order by orden) as resultado
from (
  -- ------------------------------------------------------------------
  -- 1) Triggers de profiles (0014 y 0025)
  -- ------------------------------------------------------------------
  select 1 as orden, case when exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'prevent_role_self_update' and not t.tgisinternal
  ) then 'OK      trigger prevent_role_self_update (0014)'
    else 'FALTA   trigger prevent_role_self_update (0014)' end as linea

  union all
  select 2, case when exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'prevent_sensitive_self_update' and not t.tgisinternal
  ) then 'OK      trigger prevent_sensitive_self_update (0025)'
    else 'CRÍTICO trigger prevent_sensitive_self_update ausente: plan y KYC sin proteger' end

  -- ------------------------------------------------------------------
  -- 2) Cuerpo del trigger sensible
  -- ------------------------------------------------------------------
  union all
  select 3, case when not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prevent_sensitive_self_update'
  ) then 'CRÍTICO falta la función prevent_sensitive_self_update'
    when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'prevent_sensitive_self_update'
        and p.prosrc ilike '%plan%'
    ) then 'OK      prevent_sensitive_self_update controla el plan'
    else 'CRÍTICO cuerpo viejo de prevent_sensitive_self_update: no controla el plan' end

  union all
  select 4, case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prevent_sensitive_self_update'
      and p.prosrc ilike '%current_user%'
  ) then 'AVISO   prevent_sensitive_self_update mira current_user: depende del rol de conexión'
    else 'OK      no depende del rol de conexión' end

  union all
  select 5, case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'prevent_sensitive_self_update'
      and p.prosecdef
  ) then 'AVISO   prevent_sensitive_self_update es SECURITY DEFINER'
    else 'OK      prevent_sensitive_self_update es SECURITY INVOKER' end

  -- ------------------------------------------------------------------
  -- 3) Tablas del dominio y su RLS
  -- ------------------------------------------------------------------
  union all
  select 6, coalesce('CRÍTICO falta tabla: ' || string_agg(x.t, ', ' order by x.t), 'OK      tablas del dominio presentes')
  from (select unnest(array['profiles','raffles','payments','raffle_numbers','prizes','admin_audit_logs','license_codes','raffle_visits']) as t) x
  where to_regclass('public.' || x.t) is null

  union all
  select 7, coalesce('CRÍTICO sin RLS: ' || string_agg(x.t, ', ' order by x.t), 'OK      RLS activo en todas las tablas presentes')
  from (select unnest(array['profiles','raffles','payments','raffle_numbers','prizes','admin_audit_logs','license_codes','raffle_visits']) as t) x
  where to_regclass('public.' || x.t) is not null
    and not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || x.t))

  -- ------------------------------------------------------------------
  -- 4) Funciones clave
  -- ------------------------------------------------------------------
  union all
  select 8, coalesce('CRÍTICO falta función: ' || string_agg(x.f, ', ' order by x.f), 'OK      funciones clave presentes')
  from (select unnest(array[
    'public.is_admin()',
    'public.is_superadmin()',
    'public.sell_numbers(uuid,uuid,integer[],uuid)',
    'public.release_numbers(uuid,integer[],uuid)',
    'public.reserve_numbers(uuid,integer[])'
  ]) as f) x
  where to_regprocedure(x.f) is null

  -- ------------------------------------------------------------------
  -- 5) sell_numbers: ejecutable por service_role y no por authenticated
  --    (dos CASE anidados: si la función falta, no se pregunta por permisos)
  -- ------------------------------------------------------------------
  union all
  select 9, case
    when to_regprocedure('public.sell_numbers(uuid,uuid,integer[],uuid)') is null
      then 'CRÍTICO no se pueden verificar los grants: falta sell_numbers'
    when has_function_privilege('authenticated', 'public.sell_numbers(uuid,uuid,integer[],uuid)', 'execute')
      then 'CRÍTICO authenticated puede ejecutar sell_numbers'
    when not has_function_privilege('service_role', 'public.sell_numbers(uuid,uuid,integer[],uuid)', 'execute')
      then 'CRÍTICO service_role no puede ejecutar sell_numbers: las ventas no se registrarían'
    else 'OK      sell_numbers: sólo service_role'
  end

  -- ------------------------------------------------------------------
  -- 6) Auditoría: sólo superadmin (0025)
  -- ------------------------------------------------------------------
  union all
  select 10, case when to_regclass('public.admin_audit_logs') is null
      then 'CRÍTICO falta la tabla admin_audit_logs'
    when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'admin_audit_logs'
        and cmd = 'SELECT' and qual ilike '%is_superadmin%'
    ) then 'OK      auditoría legible sólo por superadmin'
    else 'CRÍTICO falta la política de auditoría con is_superadmin (0025)' end

  union all
  select 11, case when to_regclass('public.admin_audit_logs') is null then 'OK      (sin tabla, nada que avisar)'
    when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'admin_audit_logs'
        and cmd = 'SELECT' and qual ilike '%is_admin%' and qual not ilike '%is_superadmin%'
    ) then 'AVISO   auditoría legible también por organizadores (política vieja de 0012)'
    else 'OK      sin política de auditoría para organizadores' end

  -- ------------------------------------------------------------------
  -- 7) Métricas del panel (0025) y licencias (0022)
  -- ------------------------------------------------------------------
  union all
  select 12, case when to_regprocedure('public.superadmin_metrics(timestamptz)') is null
      then 'FALTA   superadmin_metrics (0025): el panel cae al cálculo por páginas'
    else 'OK      superadmin_metrics (0025)' end

  union all
  select 13, case
    when to_regclass('public.license_codes') is null then 'CRÍTICO falta la tabla license_codes (0022)'
    when to_regprocedure('public.create_license_code(text,timestamptz)') is null then 'CRÍTICO falta create_license_code (0022)'
    when to_regprocedure('public.redeem_license_code(text)') is null then 'CRÍTICO falta redeem_license_code (0022)'
    else 'OK      licencias: tabla y RPC presentes (0022)'
  end

  -- ------------------------------------------------------------------
  -- 8) Índices de 0025
  -- ------------------------------------------------------------------
  union all
  select 14, coalesce('AVISO   falta índice: ' || string_agg(x.i, ', ' order by x.i), 'OK      índices de métricas presentes (0025)')
  from (select unnest(array[
    'payments_status_created_at_idx',
    'raffle_numbers_sold_at_idx',
    'profiles_admin_request_status_idx',
    'profiles_role_created_at_idx'
  ]) as i) x
  where not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = x.i
  )

  -- ------------------------------------------------------------------
  -- 9) Columnas sensibles que el trigger protege
  -- ------------------------------------------------------------------
  union all
  select 15, coalesce('CRÍTICO falta columna sensible: ' || string_agg(x.c, ', ' order by x.c), 'OK      columnas sensibles presentes (plan, KYC, solicitudes)')
  from (select unnest(array['plan','verification_status','dni_verified','face_verified','admin_request_status','role_requested','role_request_status']) as c) x
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = x.c
  )

  -- ------------------------------------------------------------------
  -- 10) Ledger de migraciones
  -- ------------------------------------------------------------------
  union all
  select 16, case when to_regclass('supabase_migrations.schema_migrations') is null
      then 'AVISO   sin ledger de migraciones: "está en el repo" no prueba que esté en la base'
    else 'OK      ledger de migraciones presente' end
) checks;

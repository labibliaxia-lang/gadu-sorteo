-- =====================================================================
-- Diagnóstico: "new row violates row-level security policy" al crear sorteo
-- =====================================================================
-- Error que diagnostica:
--   new row violates row-level security policy for table "raffles"
--
-- Pegá TODO este bloque en el SQL Editor de Supabase y ejecutalo.
-- Sólo lee catálogos y tablas: no modifica nada, no cambia roles, no deja
-- filas. Devuelve una celda con una línea por comprobación:
--   OK · AVISO · CRÍTICO
--
-- Qué distingue:
--   * si la base tiene las políticas y funciones que declara el repositorio;
--   * qué cuentas tienen rol de panel (admin / superadmin).
--
-- Decisión:
--   * CRÍTICO en políticas/funciones → la base está desincronizada: aplicar
--     supabase/migrations/0065_reassert_admin_write_policies.sql.
--   * Todo OK → la base está bien: el problema es la cuenta o la sesión con
--     la que se crea el sorteo (debe ser admin/superadmin).
-- =====================================================================

drop table if exists pg_temp.diag_crear_sorteo;
create temp table diag_crear_sorteo (
  orden integer primary key,
  linea text not null
);

do $bloque$
declare
  v_rls boolean;
  v_insert_nombres text;
  v_insert_cond text;
  v_isadmin_def text;
  v_grants text;
  v_admins text;
  v_ledger text;
  v_ledger_0041 boolean;
begin
  -- 1) ¿RLS activo?
  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = to_regclass('public.raffles');

  insert into diag_crear_sorteo values (1, case
    when v_rls is true then 'OK      RLS activo en public.raffles'
    else 'CRÍTICO RLS desactivado en public.raffles (aplicá 0065)' end);

  -- 2) ¿Hay alguna política de INSERT?
  select string_agg(policyname, ', ' order by policyname)
  into v_insert_nombres
  from pg_policies
  where schemaname = 'public' and tablename = 'raffles' and cmd = 'INSERT';

  insert into diag_crear_sorteo values (2, case
    when v_insert_nombres is null then
      'CRÍTICO no hay política de INSERT en raffles: toda alta se rechaza (aplicá 0065)'
    else 'OK      política(s) de INSERT: ' || v_insert_nombres end);

  -- 3) ¿La política de INSERT es la de 0014/0041?
  select string_agg(coalesce(with_check, '(sin with_check)'), E'\n' order by policyname)
  into v_insert_cond
  from pg_policies
  where schemaname = 'public' and tablename = 'raffles' and cmd = 'INSERT';

  insert into diag_crear_sorteo values (3, case
    when v_insert_cond is null then
      'AVISO   sin política de INSERT no hay condición que revisar'
    when v_insert_cond ilike '%created_by%' and v_insert_cond ilike '%is_admin%' then
      'OK      la política de INSERT exige is_admin() y created_by = auth.uid()'
    else 'CRÍTICO la política de INSERT no es la de 0041: ' || v_insert_cond end);

  -- 4) ¿is_admin() incluye superadmin?
  if to_regprocedure('public.is_admin()') is null then
    insert into diag_crear_sorteo values (4, 'CRÍTICO falta la función is_admin()');
  else
    select pg_get_functiondef('public.is_admin()'::regprocedure) into v_isadmin_def;

    insert into diag_crear_sorteo values (4, case
      when v_isadmin_def ilike '%superadmin%' then
        'OK      is_admin() incluye superadmin (0014)'
      else
        'CRÍTICO is_admin() sólo reconoce admin: un superadmin no puede crear sorteos (aplicá 0065)'
    end);
  end if;

  -- 5) ¿Existe owns_raffle()?
  insert into diag_crear_sorteo values (5, case
    when to_regprocedure('public.owns_raffle(uuid)') is null then
      'CRÍTICO falta owns_raffle(uuid) (0030)'
    else
      'OK      owns_raffle(uuid) presente' end);

  -- 6) Grants de authenticated sobre raffles
  select string_agg(privilege_type, ', ' order by privilege_type)
  into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'raffles'
    and grantee = 'authenticated';

  insert into diag_crear_sorteo values (6, case
    when v_grants is null then
      'CRÍTICO authenticated no tiene permisos sobre raffles (aplicá 0065)'
    when v_grants ilike '%INSERT%' then
      'OK      authenticated puede INSERT en raffles (' || v_grants || ')'
    else
      'CRÍTICO authenticated sin INSERT en raffles: ' || v_grants end);

  -- 7) Cuentas con rol de panel
  select string_agg(format('%s = %s', u.email, p.role), ' | ' order by p.role, u.email)
  into v_admins
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('admin', 'superadmin');

  insert into diag_crear_sorteo values (7,
    'INFO    cuentas de panel: ' || coalesce(v_admins, 'ninguna'));

  -- 8) Ledger: ¿figura 0041?
  if to_regclass('public._applied_migrations') is null then
    insert into diag_crear_sorteo values (8,
      'AVISO   sin ledger de migraciones: no hay registro de qué se aplicó');
  else
    execute $q$select exists (
      select 1 from public._applied_migrations where version = '0041'
    )$q$ into v_ledger_0041;

    execute $q$select max(version) from public._applied_migrations$q$
      into v_ledger;

    insert into diag_crear_sorteo values (8, case
      when v_ledger_0041 then
        'OK      0041 figura en el ledger (última: ' || coalesce(v_ledger, '—') || ')'
      else
        'AVISO   0041 no figura en el ledger (última: ' || coalesce(v_ledger, '—') ||
        '): puede estar aplicada a medias' end);
  end if;

  -- 9) Próximo paso
  insert into diag_crear_sorteo values (9,
    'NOTA    si ves algún CRÍTICO, aplicá 0065 y reintentá. ' ||
    'Si todo da OK, revisá con qué cuenta iniciás sesión: el alta exige rol admin o superadmin.');
end
$bloque$;

select string_agg(linea, E'\n' order by orden) as resultado
from diag_crear_sorteo;

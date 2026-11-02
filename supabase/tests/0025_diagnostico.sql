-- =====================================================================
-- Diagnóstico: ¿por qué no bloquea el trigger de profiles?
-- =====================================================================
-- Pegar todo en el SQL Editor y ejecutar. Termina en ROLLBACK.
-- Devuelve una celda con el estado real de la base, más un NOTICE aparte con
-- el ledger de migraciones del CLI (si existe). No modifica nada.
-- =====================================================================

begin;

-- Nos ponemos en la piel de un usuario autenticado cualquiera.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id from public.profiles where role <> 'superadmin' order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);

select jsonb_pretty(
  jsonb_build_object(
    'auth_uid', auth.uid(),
    'es_superadmin', public.is_superadmin(),

    'triggers_en_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trigger', t.tgname,
        'funcion', p.proname,
        'security_definer', p.prosecdef,
        'su_cuerpo_menciona_plan', p.prosrc ilike '%plan%',
        'su_cuerpo_mira_current_user', p.prosrc ilike '%current_user%',
        'su_cuerpo_mira_auth_uid', p.prosrc ilike '%auth.uid%'
      )), '[]'::jsonb)
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'public.profiles'::regclass
        and not t.tgisinternal
    ),

    'funciones_prevent_existentes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nombre', p.proname,
        'security_definer', p.prosecdef,
        'lineas', array_length(string_to_array(p.prosrc, E'\n'), 1)
      )), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'prevent_%'
    ),

    'columnas_sensibles_presentes', (
      select coalesce(jsonb_agg(column_name order by column_name), '[]'::jsonb)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name in ('plan','verification_status','dni_verified','face_verified','admin_request_status','role_requested','role_request_status')
    ),

    'tabla_de_migraciones_del_cli', to_regclass('supabase_migrations.schema_migrations')::text
  )
) as diagnostico;

-- El ledger del CLI va aparte y con SQL dinámico: si la tabla no existe, un
-- CASE no evita el error, porque el nombre se resuelve al planificar.
do $$
declare
  v_list text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'Ledger del CLI: la tabla NO existe (migraciones aplicadas a mano en el SQL Editor)';
    return;
  end if;

  execute 'select coalesce(string_agg(version, '' '' order by version), ''(vacía)'') from supabase_migrations.schema_migrations'
    into v_list;

  raise notice 'Ledger del CLI: %', v_list;
end $$;

rollback;

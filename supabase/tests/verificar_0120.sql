-- =====================================================================
-- Verificador 0120 — Códigos cortos de referido (solo lectura)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de aplicar
-- `supabase/migrations/0120_referral_codes.sql`.
--
-- No escribe nada: no abre transacción, no hace commit y no modifica datos.
-- Cada fila es una prueba con `ok` en true/false.
-- =====================================================================

select 'columna profiles.referral_code (text)' as prueba,
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'profiles'
            and column_name = 'referral_code'
            and data_type = 'text'
       ) as ok,
       coalesce((
         select data_type
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'profiles'
            and column_name = 'referral_code'
       ), 'ausente') as detalle

union all

select 'indice unico profiles_referral_code_key',
       exists (
         select 1
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'profiles'
            and indexname = 'profiles_referral_code_key'
            and indexdef ilike '%unique index%'
       ),
       coalesce((
         select indexdef
           from pg_indexes
          where schemaname = 'public'
            and tablename = 'profiles'
            and indexname = 'profiles_referral_code_key'
       ), 'ausente')

union all

select 'check de formato ^[A-Z0-9]{6}$',
       exists (
         select 1
           from pg_constraint
          where conname = 'profiles_referral_code_formato'
            and conrelid = 'public.profiles'::regclass
            and contype = 'c'
       ),
       coalesce((
         select pg_get_constraintdef(oid)
           from pg_constraint
          where conname = 'profiles_referral_code_formato'
       ), 'ausente')

union all

select 'trigger asignar_referral_code',
       exists (
         select 1
           from pg_trigger
          where tgrelid = 'public.profiles'::regclass
            and tgname = 'asignar_referral_code'
            and not tgisinternal
       ),
       coalesce((
         select tgenabled::text
           from pg_trigger
          where tgrelid = 'public.profiles'::regclass
            and tgname = 'asignar_referral_code'
            and not tgisinternal
       ), 'ausente')

union all

select 'RPC resolver_referral_code SECURITY DEFINER',
       exists (
         select 1
           from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname = 'resolver_referral_code'
            and prosecdef
       ),
       coalesce((
         select 'prosecdef=' || prosecdef::text
           from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname = 'resolver_referral_code'
          limit 1
       ), 'ausente')

union all

select 'grant EXECUTE a anon y authenticated',
       (
         select count(*) = 2
           from information_schema.routine_privileges
          where routine_schema = 'public'
            and routine_name = 'resolver_referral_code'
            and grantee in ('anon', 'authenticated')
            and privilege_type = 'EXECUTE'
       ),
       coalesce((
         select string_agg(distinct grantee, ', ')
           from information_schema.routine_privileges
          where routine_schema = 'public'
            and routine_name = 'resolver_referral_code'
            and privilege_type = 'EXECUTE'
       ), 'sin grants')

union all

select 'todos los perfiles con codigo valido',
       (
         select count(*) = 0
           from public.profiles
          where referral_code is null
             or referral_code !~ '^[A-Z0-9]{6}$'
       ),
       (
         select count(*)::text || ' perfiles, '
             || count(*) filter (where referral_code is null)::text
             || ' sin codigo'
           from public.profiles
       )

union all

select 'sin codigos duplicados',
       (
         select count(*) = 0
           from (
             select referral_code
               from public.profiles
              where referral_code is not null
              group by referral_code
             having count(*) > 1
           ) d
       ),
       (
         select count(*)::text || ' codigos duplicados'
           from (
             select referral_code
               from public.profiles
              where referral_code is not null
              group by referral_code
             having count(*) > 1
           ) d
       )

union all

select 'generador devuelve 6 alfanumericos',
       (select public.generar_referral_code() ~ '^[A-Z0-9]{6}$'),
       (select public.generar_referral_code())

union all

select 'resolucion codigo -> perfil',
       not exists (
         select 1
           from (
             select id, referral_code
               from public.profiles
              where referral_code is not null
              limit 10
           ) p
          where public.resolver_referral_code(p.referral_code) is distinct from p.id
       ),
       'probados hasta 10 perfiles'

union all

select 'ledger 0120',
       exists (
         select 1
           from public._applied_migrations
          where version = '0120'
       ),
       'version registrada'

order by 1;

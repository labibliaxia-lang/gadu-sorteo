-- =====================================================================
-- Verificador 0080 — anon no ve reserved_by ni sold_to
-- =====================================================================
-- Una sola consulta, de solo lectura. Comprueba:
--   1  anon ya no tiene privilegio sobre reserved_by
--   2  anon ya no tiene privilegio sobre sold_to
--   3  anon conserva las columnas que el grid necesita
--   4  authenticated conserva las dos (el grid las usa estando logueado)
-- =====================================================================

with columnas as (
  select grantee, column_name
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'raffle_numbers'
     and privilege_type = 'SELECT'
),
tabla as (
  select grantee
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'raffle_numbers'
     and privilege_type = 'SELECT'
)
select 1 as n,
       'anon no puede leer reserved_by' as caso,
       case when not exists (
              select 1 from columnas where grantee = 'anon' and column_name = 'reserved_by'
            ) and not exists (select 1 from tabla where grantee = 'anon')
            then 'OK' else 'FALTA' end as resultado
union all
select 2,
       'anon no puede leer sold_to',
       case when not exists (
              select 1 from columnas where grantee = 'anon' and column_name = 'sold_to'
            ) and not exists (select 1 from tabla where grantee = 'anon')
            then 'OK' else 'FALTA' end
union all
select 3,
       'anon conserva las columnas del grid (number, status, reserved_until)',
       case
         when (select count(*) from columnas
                where grantee = 'anon'
                  and column_name in ('id', 'raffle_id', 'number', 'status', 'reserved_until', 'sold_at')
              ) = 6
           then 'OK'
         else 'FALTA'
       end
union all
select 4,
       'authenticated conserva reserved_by y sold_to (el grid los usa con sesión)',
       case when exists (select 1 from tabla where grantee = 'authenticated')
             and (select count(*) from columnas
                   where grantee = 'authenticated'
                     and column_name in ('reserved_by', 'sold_to')
                 ) = 2
            then 'OK' else 'AVISO' end;

-- =====================================================================
-- Verificador 0081 — privilegio EFECTIVO, no solo grants directos
-- =====================================================================
-- Por qué este reemplaza al de 0080:
--   `information_schema.column_privileges` muestra los grants directos y
--   esconde lo que un rol hereda de PUBLIC. La 0080 dio 4 OK y aun así anon
--   seguía leyendo los UUID. `has_column_privilege` responde por el privilegio
--   real del rol, herencia incluida.
-- =====================================================================

select 1 as n,
       'anon NO puede leer reserved_by' as caso,
       case when has_column_privilege('anon', 'public.raffle_numbers', 'reserved_by', 'select')
            then 'FALTA' else 'OK' end as resultado
union all
select 2,
       'anon NO puede leer sold_to',
       case when has_column_privilege('anon', 'public.raffle_numbers', 'sold_to', 'select')
            then 'FALTA' else 'OK' end
union all
select 3,
       'anon SÍ puede leer las columnas del grid',
       case when has_column_privilege('anon', 'public.raffle_numbers', 'number', 'select')
             and has_column_privilege('anon', 'public.raffle_numbers', 'status', 'select')
             and has_column_privilege('anon', 'public.raffle_numbers', 'reserved_until', 'select')
            then 'OK' else 'FALTA' end
union all
select 4,
       'authenticated conserva reserved_by y sold_to',
       case when has_column_privilege('authenticated', 'public.raffle_numbers', 'reserved_by', 'select')
             and has_column_privilege('authenticated', 'public.raffle_numbers', 'sold_to', 'select')
            then 'OK' else 'FALTA' end
union all
select 5,
       'service_role conserva el acceso (crons y RPC)',
       case when has_column_privilege('service_role', 'public.raffle_numbers', 'reserved_by', 'select')
            then 'OK' else 'FALTA' end;

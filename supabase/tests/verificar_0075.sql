-- =====================================================================
-- Verificador 0075 — la fecha del sorteo no se mueve con el sorteo en venta
-- =====================================================================
-- Una sola consulta, sin tablas intermedias ni transacción: el editor SQL de
-- Supabase no garantiza que una tabla creada en una sentencia sobreviva hasta
-- el bloque siguiente. Esto se puede pegar y correr tal cual.
--
-- Comprueba lo que el repositorio declara: trigger instalado, función con el
-- freno y excepciones para superadmin y para los procesos del motor.
-- La prueba funcional (intentar mover la fecha desde el panel) va aparte.
-- =====================================================================

with funcion as (
  select pg_get_functiondef(p.oid) as definicion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'lock_draw_date_when_live'
)
select 1 as n,
       'el trigger lock_draw_date_when_live esta instalado' as caso,
       case
         when exists (
           select 1
             from pg_trigger
            where tgname = 'lock_draw_date_when_live'
              and tgrelid = 'public.raffles'::regclass
              and not tgisinternal
         ) then 'OK'
         else 'FALTA'
       end as resultado
union all
select 2,
       'la funcion frena el cambio de fecha con el sorteo en venta',
       case
         when coalesce((select strpos(definicion, 'old.status = ''active''') from funcion), 0) > 0
           then 'OK'
         else 'FALTA'
       end
union all
select 3,
       'la funcion exceptua al superadmin y a los procesos del motor',
       case
         when coalesce((select strpos(definicion, 'is_superadmin') from funcion), 0) > 0
          and coalesce((select strpos(definicion, 'service_role') from funcion), 0) > 0
           then 'OK'
         else 'FALTA'
       end;

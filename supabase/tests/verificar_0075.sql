-- =====================================================================
-- Verificador 0074 — la fecha del sorteo no se mueve con el sorteo en venta
-- =====================================================================
-- Reglas de la casa:
--   · nunca muere a mitad de camino: reporta FALTA y sigue
--   · el control va antes del ataque
--   · no cuenta filas que el propio script ensució
--   · termina en rollback
-- =====================================================================

begin;

create table public._v0074 (
  n int,
  caso text,
  resultado text
);

do $$
declare
  v_raffle uuid;
  v_fecha timestamptz;
  v_titulo text;
begin
  insert into public._v0074 values (1, 'el trigger lock_draw_date_when_live esta instalado', 'FALTA');
  insert into public._v0074 values (2, 'control: editar el titulo con el sorteo en venta sigue permitido', 'FALTA');
  insert into public._v0074 values (3, 'la fecha del sorteo NO se mueve con el sorteo en venta', 'FALTA');

  update public._v0074
     set resultado = 'OK'
   where n = 1
     and exists (
       select 1
         from pg_trigger
        where tgname = 'lock_draw_date_when_live'
          and tgrelid = 'public.raffles'::regclass
          and not tgisinternal
     );

  select id, draw_date, title
    into v_raffle, v_fecha, v_titulo
    from public.raffles
   where status = 'active'
   order by created_at
   limit 1;

  if v_raffle is null then
    update public._v0074
       set resultado = 'SIN DATO: no hay sorteos activos para probar'
     where n in (2, 3);
    return;
  end if;

  -- Control: el mismo UPDATE sin tocar la fecha tiene que pasar.
  update public.raffles
     set title = v_titulo
   where id = v_raffle;

  update public._v0074 set resultado = 'OK' where n = 2;

  -- Ataque: extender la venta un día con el sorteo en venta.
  begin
    update public.raffles
       set draw_date = v_fecha + interval '1 day'
     where id = v_raffle;

    update public._v0074
       set resultado = 'CRITICO: la fecha se movio con el sorteo en venta'
     where n = 3;
  exception
    when check_violation then
      update public._v0074 set resultado = 'OK' where n = 3;
  end;
end $$;

select n, caso, resultado
  from public._v0074
 order by n;

rollback;

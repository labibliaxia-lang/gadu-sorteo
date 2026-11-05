-- =====================================================================
-- Verificador — la transición a `drawn` por el trigger de 0067
-- =====================================================================
-- Cierra el único "a verificar" que quedó de la auditoría del 2026-11-04.
--
-- Por qué hacía falta: los dos intentos anteriores rebotaban antes de llegar a
-- 0067, porque el sorteo de prueba tenía fecha futura y `enforce_draw_date`
-- (0047) cortaba primero. Acá se elige un sorteo ACTIVO con fecha YA PASADA:
-- 0047 deja pasar, y quien decide es 0067.
--
-- Qué prueba:
--   1  control: el dueño autenticado puede editar su sorteo (si esto falla, 2
--      no prueba nada)
--   2  ataque: el dueño autenticado NO puede pasar el sorteo a `drawn`
--   3  control del motor: el camino privilegiado SÍ puede cerrarlo
--
-- Termina en ROLLBACK: no deja cambios.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.drawn', '', true);
  perform set_config('test.drawn.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.drawn',
    coalesce(current_setting('test.drawn', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- Preparación: un sorteo activo con la fecha ya pasada
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_owner uuid;
  v_fecha timestamptz;
begin
  select id, created_by, draw_date
    into v_id, v_owner, v_fecha
    from public.raffles
   where status = 'active'
     and draw_date <= now()
   order by draw_date asc
   limit 1;

  perform set_config('test.drawn.raffle', coalesce(v_id::text, ''), true);

  if v_id is null then
    perform pg_temp.anota('0 AVISO    no hay sorteos activos con fecha pasada: creá uno o esperá a que venza alguno');
    return;
  end if;

  perform pg_temp.anota('0 OK       sorteo de prueba (fecha ya pasada): ' || v_id);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1-2) Como el dueño autenticado
-- ---------------------------------------------------------------------
set local role authenticated;

do $$
declare
  v_id uuid := nullif(current_setting('test.drawn.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set title = title where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('1 ' || case when v_n = 1
      then 'OK       control: el dueño puede editar su sorteo'
      else 'CRÍTICO  control: la edición tocó ' || v_n || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('1 CRÍTICO  control: falló una edición legítima: ' || sqlerrm);
  end;
end $$;

do $$
declare
  v_id uuid := nullif(current_setting('test.drawn.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set status = 'drawn' where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('2 ' || case when v_n = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  el organizador cerró el sorteo a mano' end);
  exception when others then
    perform pg_temp.anota('2 ' || case
      when sqlerrm ilike '%motor%'
        then 'OK       bloqueado por 0067: ' || sqlerrm
      when sqlerrm ilike any (array['%programado%', '%row-level%', '%permiso%', '%compromiso%', '%sorteado%'])
        then 'OK       bloqueado por otra guarda: ' || sqlerrm
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- 3) El camino privilegiado (motor / service_role) sí puede
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.drawn.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set status = 'drawn' where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('3 ' || case when v_n = 1
      then 'OK       el camino privilegiado sí cierra el sorteo'
      else 'AVISO    la transición tocó ' || v_n || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('3 ' || case
      when sqlerrm ilike any (array['%programado%', '%mínimo%', '%minimo%', '%sorteado%'])
        then 'OK       rebotó por una guarda correcta: ' || sqlerrm
      else 'CRÍTICO  el motor no pudo cerrar el sorteo: ' || sqlerrm end);
  end;
end $$;

-- ---------------------------------------------------------------------
-- Reporte
-- ---------------------------------------------------------------------
select current_setting('test.drawn', true) as resultado;

rollback;

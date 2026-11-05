-- =====================================================================
-- Verificación de 0071 — ¿se puede adelantar el sorteo o vender después?
-- =====================================================================
-- Pegar TODO en el SQL Editor de Supabase y ejecutar. Termina en ROLLBACK.
-- Devuelve SIEMPRE una celda, aunque falte la migración: lo que no se puede
-- probar se marca como omitido en vez de cortar el script.
--
--   1  ¿las tres funciones son las nuevas?
--   2  montaje
--   3  adelantar el sorteo bajando draw_date en el mismo UPDATE -> rechazado
--   4  sortear un sorteo con fecha pasada -> permitido (control)
--   5  vender con el sorteo ya sorteado -> no vende
--   6  vender con el sorteo en venta -> vende (control)
--   7  el organizador marca números en un sorteo sorteado -> rechazado
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.verif0071', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.verif0071',
    coalesce(current_setting('test.verif0071', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) ¿Están las tres versiones nuevas?
-- ---------------------------------------------------------------------
do $$
declare v_ok int := 0; v_def text;
begin
  begin
    v_def := pg_get_functiondef('public.enforce_draw_date'::regproc);
    if v_def ilike '%old.draw_date%' then v_ok := v_ok + 1; end if;
  exception when others then null; end;

  begin
    v_def := pg_get_functiondef('public.sell_numbers'::regproc);
    if v_def ilike '%drawn%' then v_ok := v_ok + 1; end if;
  exception when others then null; end;

  begin
    v_def := pg_get_functiondef('public.organizer_mark_sold'::regproc);
    if v_def ilike '%ya fue sorteado%' then v_ok := v_ok + 1; end if;
  exception when others then null; end;

  perform pg_temp.anota('1 ' || case when v_ok = 3
    then 'OK       las tres funciones tienen los frenos de 0071'
    else 'FALTA    solo ' || v_ok || '/3 funciones actualizadas -> aplicar 0071' end);
end $$;

-- ---------------------------------------------------------------------
-- 2) Montaje
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_user uuid;
  v_fut uuid := gen_random_uuid();
  v_past uuid := gen_random_uuid();
  v_drawn uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_payment_drawn uuid := gen_random_uuid();
begin
  select p.id into v_admin
  from public.profiles p
  where p.role in ('admin', 'superadmin') and p.is_banned is not true
  order by p.created_at
  limit 1;

  select p.id into v_user
  from public.profiles p
  order by p.created_at desc
  limit 1;

  if v_user is null then
    perform pg_temp.anota('2 AVISO    no hay usuarios con perfil para montar la prueba');
    return;
  end if;

  perform set_config('test.verif0071.admin', coalesce(v_admin::text, ''), true);
  perform set_config('test.verif0071.user', v_user::text, true);
  perform set_config('test.verif0071.fut', v_fut::text, true);
  perform set_config('test.verif0071.past', v_past::text, true);
  perform set_config('test.verif0071.drawn', v_drawn::text, true);
  perform set_config('test.verif0071.payment', v_payment::text, true);
  perform set_config('test.verif0071.payment_drawn', v_payment_drawn::text, true);

  insert into public.raffles (id, title, draw_date, price_per_number, status, created_by)
  values
    (v_fut,   'prueba 0071 futuro',  now() + interval '30 days', 100, 'active', coalesce(v_admin, v_user)),
    (v_past,  'prueba 0071 pasado',  now() - interval '1 day',   100, 'closed', coalesce(v_admin, v_user)),
    (v_drawn, 'prueba 0071 sorteado', now() - interval '2 days', 100, 'drawn',  coalesce(v_admin, v_user));

  -- `raffle_numbers.payment_id` tiene FK a `payments`: sin fila real, la prueba
  -- de venta fallaría por violación de clave foránea y no por el freno.
  insert into public.payments (id, user_id, raffle_id, numbers, amount, status)
  values
    (v_payment, v_user, v_fut, array[2], 100, 'pending'),
    (v_payment_drawn, v_user, v_drawn, array[1], 100, 'pending');

  insert into public.raffle_numbers (raffle_id, number, status, reserved_by, reserved_until)
  values
    (v_drawn, 1, 'reserved', v_user, now() + interval '10 minutes'),
    (v_fut,   2, 'reserved', v_user, now() + interval '10 minutes'),
    (v_drawn, 3, 'available', null, null);

  perform pg_temp.anota('2 OK       datos montados (3 sorteos, números reservados y uno libre)');
exception when others then
  perform pg_temp.anota('2 CRÍTICO  no se pudo montar la prueba: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- 3-4) La fecha del sorteo no se puede adelantar
-- ---------------------------------------------------------------------
do $$
declare
  v_fut uuid := nullif(current_setting('test.verif0071.fut', true), '')::uuid;
  v_past uuid := nullif(current_setting('test.verif0071.past', true), '')::uuid;
  v_rows int;
begin
  if v_fut is null then
    perform pg_temp.anota('3 AVISO    se omite: no hay datos');
    perform pg_temp.anota('4 AVISO    se omite: no hay datos');
    return;
  end if;

  -- El ataque: pasar a 'drawn' y bajar la fecha en la MISMA sentencia.
  begin
    update public.raffles
       set status = 'drawn',
           draw_date = now() - interval '1 day'
     where id = v_fut;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('3 ' || case when v_rows = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  se pudo sortear adelantando la fecha en el mismo UPDATE' end);
  exception when others then
    perform pg_temp.anota('3 ' || case when sqlerrm ilike '%programado%'
      then 'OK       rechazado: ' || sqlerrm
      else 'OTRO     rechazó por otro motivo: ' || sqlerrm end);
  end;

  -- Control: un sorteo cuya fecha ya pasó sí se puede sorteear.
  begin
    update public.raffles set status = 'drawn' where id = v_past;
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('4 ' || case when v_rows = 1
      then 'OK       con la fecha vencida el sorteo sí se puede cerrar'
      else 'CRÍTICO  bloqueó un sorteo legítimo (' || v_rows || ' filas)' end);
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  bloqueó un sorteo legítimo: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5-6) Vender después del sorteo
-- ---------------------------------------------------------------------
do $$
declare
  v_user uuid := nullif(current_setting('test.verif0071.user', true), '')::uuid;
  v_fut uuid := nullif(current_setting('test.verif0071.fut', true), '')::uuid;
  v_drawn uuid := nullif(current_setting('test.verif0071.drawn', true), '')::uuid;
  v_payment uuid := nullif(current_setting('test.verif0071.payment', true), '')::uuid;
  v_payment_drawn uuid := nullif(current_setting('test.verif0071.payment_drawn', true), '')::uuid;
  v_count int;
begin
  if v_user is null then
    perform pg_temp.anota('5 AVISO    se omite: no hay datos');
    perform pg_temp.anota('6 AVISO    se omite: no hay datos');
    return;
  end if;

  begin
    v_count := public.sell_numbers(v_drawn, v_user, array[1], v_payment_drawn);
    perform pg_temp.anota('5 ' || case when v_count = 0
      then 'OK       con el sorteo sorteado no vendió nada (el hash no cambia)'
      else 'CRÍTICO  vendió ' || v_count || ' número/s después del sorteo' end);
  exception when others then
    perform pg_temp.anota('5 CRÍTICO  la función falló: ' || sqlerrm);
  end;

  begin
    v_count := public.sell_numbers(v_fut, v_user, array[2], v_payment);
    perform pg_temp.anota('6 ' || case when v_count = 1
      then 'OK       con el sorteo en venta sí vendió (control)'
      else 'CRÍTICO  no vendió un número reservado legítimo (' || coalesce(v_count, -1) || ')' end);
  exception when others then
    perform pg_temp.anota('6 CRÍTICO  la venta legítima falló: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 7) El organizador no marca números en un sorteo sorteado
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid := nullif(current_setting('test.verif0071.admin', true), '')::uuid;
  v_drawn uuid := nullif(current_setting('test.verif0071.drawn', true), '')::uuid;
begin
  if v_admin is null then
    perform pg_temp.anota('7 AVISO    se omite: no hay organización admin para probar');
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
end $$;

set local role authenticated;

do $$
declare
  v_drawn uuid := nullif(current_setting('test.verif0071.drawn', true), '')::uuid;
  v_rows int;
begin
  if v_drawn is null then return; end if;

  begin
    v_rows := public.organizer_mark_sold(v_drawn, array[3]);
    perform pg_temp.anota('7 ' || case when v_rows = 0
      then 'AVISO    no marcó nada (0 filas): revisar'
      else 'CRÍTICO  marcó ' || v_rows || ' número/s en un sorteo ya sorteado' end);
  exception when others then
    perform pg_temp.anota('7 ' || case
      when sqlerrm ilike '%sorteado%' then 'OK       rechazado: ' || sqlerrm
      when sqlerrm ilike '%No autorizado%' then 'OTRO     el usuario de prueba no es organizador de ese sorteo'
      else 'OTRO     rechazó por otro motivo: ' || sqlerrm end);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Reporte completo en una sola celda
-- ---------------------------------------------------------------------
select current_setting('test.verif0071', true) as resultado;

rollback;

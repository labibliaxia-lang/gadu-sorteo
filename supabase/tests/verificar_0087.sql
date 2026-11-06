-- =====================================================================
-- Verificador 0087 — un sorteo con participantes no se elimina
-- =====================================================================
-- Qué prueba:
--   1  el trigger está instalado
--   2  control: un sorteo vacío SÍ se puede borrar
--   3  ataque: con un número vendido, no
--   4  ataque: con el compromiso publicado, no
--   5  ataque: con un pago, no
--
-- Todo en una transacción con ROLLBACK: no borra ni crea nada de verdad.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v83', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v83',
    coalesce(current_setting('test.v83', true), '') || p_linea || E'\n', true);
end $$;

-- 1) Trigger
do $$
begin
  perform pg_temp.anota('1 ' || case when exists (
      select 1 from pg_trigger
       where tgname = 'guard_raffle_deletion'
         and tgrelid = 'public.raffles'::regclass
         and not tgisinternal
    ) then 'OK       trigger guard_raffle_deletion instalado'
      else 'FALTA    falta el trigger -> aplicar 0087' end);
end $$;

-- 2) Control: sorteo vacío
do $$
declare v_id uuid;
begin
  insert into public.raffles (title, draw_date, price_per_number, status)
  values ('prueba 0087 vacio', now() + interval '30 days', 100, 'active')
  returning id into v_id;

  begin
    delete from public.raffles where id = v_id;
    perform pg_temp.anota('2 OK       control: un sorteo sin actividad se borra');
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  el control falló: ' || sqlerrm);
  end;
end $$;

-- 3) Ataque: número vendido
do $$
declare v_id uuid;
begin
  insert into public.raffles (title, draw_date, price_per_number, status)
  values ('prueba 0087 vendido', now() + interval '30 days', 100, 'active')
  returning id into v_id;

  insert into public.raffle_numbers (raffle_id, number, status)
  values (v_id, 7, 'sold');

  begin
    delete from public.raffles where id = v_id;
    perform pg_temp.anota('3 CRÍTICO  borró un sorteo con un número vendido');
  exception when check_violation then
    perform pg_temp.anota('3 OK       bloqueado con número vendido: ' || sqlerrm);
  end;
end $$;

-- 4) Ataque: compromiso publicado
do $$
declare v_id uuid;
begin
  insert into public.raffles (title, draw_date, price_per_number, status, draw_commitment, draw_commitment_at)
  values ('prueba 0087 compromiso', now() + interval '30 days', 100, 'active', repeat('a', 64), now())
  returning id into v_id;

  begin
    delete from public.raffles where id = v_id;
    perform pg_temp.anota('4 CRÍTICO  borró un sorteo con compromiso publicado');
  exception when check_violation then
    perform pg_temp.anota('4 OK       bloqueado con compromiso: ' || sqlerrm);
  end;
end $$;

-- 5) Ataque: pago registrado
do $$
declare
  v_id uuid;
  v_pago uuid;
  v_uid uuid;
begin
  select id into v_uid from public.profiles order by created_at limit 1;

  insert into public.raffles (title, draw_date, price_per_number, status)
  values ('prueba 0087 pago', now() + interval '30 days', 100, 'active')
  returning id into v_id;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_uid, v_id, '{}', 100, 'approved')
  returning id into v_pago;

  begin
    delete from public.raffles where id = v_id;
    perform pg_temp.anota('5 CRÍTICO  borró un sorteo con pagos');
  exception when check_violation then
    perform pg_temp.anota('5 OK       bloqueado con pago: ' || sqlerrm);
  end;
end $$;

select current_setting('test.v83', true) as resultado;

rollback;

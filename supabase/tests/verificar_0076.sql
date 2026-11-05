-- =====================================================================
-- Verificador 0076 — reserve_numbers valida lo mismo que el prepago
-- =====================================================================
-- Qué prueba:
--   1  la función declara los frenos (suspensión, tope por hora, volumen)
--   2  una cuenta suspendida no puede reservar
--   3  más de 100 números en una compra se rechaza
--   4  pasadas 20 reservas en la hora, la siguiente se rechaza
--
-- Todo dentro de una transacción que termina en ROLLBACK: no reserva nada.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v76', '', true);
  perform set_config('test.v76.raffle', '', true);
  perform set_config('test.v76.uid', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.v76',
    coalesce(current_setting('test.v76', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) Declaración: los frenos están en el cuerpo vigente
-- ---------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_numbers';

  perform pg_temp.anota('1 ' || case
    when v_def is null then 'FALTA    la función reserve_numbers no existe'
    when v_def ilike '%is_banned%'
     and v_def ilike '%check_rate_limit%'
     and v_def ilike '%100%'
      then 'OK       declara suspensión, tope por hora y máximo de números'
    else 'FALTA    la función no tiene los tres frenos -> aplicar 0076' end);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: un sorteo activo y un usuario con perfil
-- ---------------------------------------------------------------------
do $$
declare
  v_raffle uuid;
  v_uid uuid;
begin
  select id into v_raffle
    from public.raffles
   where status = 'active'
   order by created_at desc
   limit 1;

  select p.id into v_uid
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.role in ('admin', 'superadmin')
   order by p.created_at desc
   limit 1;

  perform set_config('test.v76.raffle', coalesce(v_raffle::text, ''), true);
  perform set_config('test.v76.uid', coalesce(v_uid::text, ''), true);

  if v_raffle is null or v_uid is null then
    perform pg_temp.anota('2 AVISO    faltan datos: hace falta un sorteo activo y un usuario con perfil');
    perform pg_temp.anota('3 AVISO    faltan datos');
    perform pg_temp.anota('4 AVISO    faltan datos');
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 2) Cuenta suspendida
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.v76.uid', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v76.raffle', true), '')::uuid;
  v_msg text;
begin
  if v_uid is null or v_raffle is null then return; end if;

  update public.profiles set is_banned = true where id = v_uid;

  begin
    perform public.reserve_numbers(v_raffle, array[1]);
    perform pg_temp.anota('2 CRÍTICO  una cuenta suspendida pudo reservar');
  exception when others then
    v_msg := sqlerrm;
    perform pg_temp.anota('2 ' || case when v_msg ilike '%suspendida%'
      then 'OK       la cuenta suspendida queda bloqueada'
      else 'OTRO     excepción inesperada: ' || v_msg end);
  end;

  update public.profiles set is_banned = false where id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- 3) Más de 100 números en una compra
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.v76.uid', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v76.raffle', true), '')::uuid;
  v_msg text;
begin
  if v_uid is null or v_raffle is null then return; end if;

  begin
    perform public.reserve_numbers(
      v_raffle,
      (select array_agg(n) from generate_series(1, 101) as n)
    );
    perform pg_temp.anota('3 CRÍTICO  aceptó 101 números en una compra');
  exception when others then
    v_msg := sqlerrm;
    perform pg_temp.anota('3 ' || case when v_msg ilike '%máximo 100%' or v_msg ilike '%maximo 100%'
      then 'OK       rechaza más de 100 números por compra'
      else 'OTRO     excepción inesperada: ' || v_msg end);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 4) Tope de 20 reservas por hora
-- ---------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('test.v76.uid', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v76.raffle', true), '')::uuid;
  v_msg text;
begin
  if v_uid is null or v_raffle is null then return; end if;

  -- Se deja el contador de la ventana en 20: la próxima llamada es la 21.
  insert into public.rate_limits (key, window_start, count)
  values ('reserve:' || v_uid::text, now(), 20)
  on conflict (key) do update
    set window_start = now(), count = 20;

  begin
    perform public.reserve_numbers(v_raffle, array[1]);
    perform pg_temp.anota('4 CRÍTICO  la reserva 21 de la hora pasó igual');
  exception when others then
    v_msg := sqlerrm;
    perform pg_temp.anota('4 ' || case when v_msg ilike '%demasiadas reservas%'
      then 'OK       corta en la reserva 21 de la hora'
      else 'OTRO     excepción inesperada: ' || v_msg end);
  end;
end $$;

-- ---------------------------------------------------------------------
-- Reporte
-- ---------------------------------------------------------------------
select current_setting('test.v76', true) as resultado;

rollback;

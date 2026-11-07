-- =====================================================================
-- Verificador 0114 — candado de bases legales al publicar
-- =====================================================================
-- 1 activo sin aceptar -> rechazado
-- 2 activo aceptando -> aceptado
-- 3 borrador (closed) sin aceptar -> aceptado
-- 4 pasar de closed a active sin aceptar -> rechazado
-- 5 pasar de closed a active aceptando -> aceptado
-- 6 un activo existente se puede editar sin tocar términos
-- 7 ledger
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v114', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v114',
    coalesce(current_setting('test.v114', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
  v_raffle uuid;
begin
  select id into v_owner from public.profiles
   where role = 'superadmin' order by created_at limit 1;
  if v_owner is null then
    select id into v_owner from public.profiles
     where role = 'admin' order by created_at limit 1;
  end if;

  perform set_config('test.v114.owner', coalesce(v_owner::text, ''), true);
  -- El candado exime sesiones sin identidad (SQL Editor). Para probar el
  -- rechazo hay que simular un usuario autenticado: superadmin, que además
  -- está exento del KYC y de los límites de plan.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- Sorteo activo con términos aceptados para el paso 6.
  if v_owner is not null then
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type,
                                terms_accepted_by_organizer, player_terms_text)
    values ('v114 activo ok', now() + interval '5 days', 100, 'active',
            v_owner, 'transferencia', true, 'Bases legales de prueba.')
    returning id into v_raffle;

    perform set_config('test.v114.activo', v_raffle::text, true);
  end if;
end $$;

-- 1) Activo sin aceptar
do $$
declare
  v_owner uuid := nullif(current_setting('test.v114.owner', true), '')::uuid;
  v_error text := null;
begin
  if v_owner is null then
    perform pg_temp.anota('1 AVISO    hace falta un organizador');
    return;
  end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type,
                                terms_accepted_by_organizer)
    values ('v114 sin terminos', now() + interval '5 days', 100, 'active',
            v_owner, 'transferencia', false);
  exception when others then v_error := sqlerrm; end;

  perform pg_temp.anota('1 ' || case when v_error is not null
    then 'OK       activo sin aceptar bases: rechazado'
    else 'CRÍTICO  se publicó sin bases legales' end);
end $$;

-- 2) Activo aceptando
do $$
declare
  v_owner uuid := nullif(current_setting('test.v114.owner', true), '')::uuid;
  v_raffle uuid;
begin
  if v_owner is null then return; end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type,
                                terms_accepted_by_organizer, player_terms_text)
    values ('v114 con terminos', now() + interval '5 days', 100, 'active',
            v_owner, 'transferencia', true, 'Bases legales de prueba.')
    returning id into v_raffle;

    perform pg_temp.anota('2 ' || case when v_raffle is not null
      then 'OK       activo con bases aceptadas: permitido'
      else 'CRÍTICO  no se pudo crear' end);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  ' || sqlerrm);
  end;
end $$;

-- 3) Borrador sin aceptar
do $$
declare
  v_owner uuid := nullif(current_setting('test.v114.owner', true), '')::uuid;
  v_raffle uuid;
begin
  if v_owner is null then return; end if;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type,
                                terms_accepted_by_organizer)
    values ('v114 borrador', now() + interval '5 days', 100, 'closed',
            v_owner, 'transferencia', false)
    returning id into v_raffle;

    perform pg_temp.anota('3 ' || case when v_raffle is not null
      then 'OK       un borrador sin bases se puede guardar'
      else 'CRÍTICO  no se pudo crear el borrador' end);
  exception when others then
    perform pg_temp.anota('3 CRÍTICO  ' || sqlerrm);
  end;
end $$;

-- 4 y 5) Activar desde borrador
do $$
declare
  v_owner uuid := nullif(current_setting('test.v114.owner', true), '')::uuid;
  v_raffle uuid;
  v_error text := null;
begin
  if v_owner is null then return; end if;

  insert into public.raffles (title, draw_date, price_per_number, status,
                              created_by, payment_type,
                              terms_accepted_by_organizer)
  values ('v114 activar', now() + interval '5 days', 100, 'closed',
          v_owner, 'transferencia', false)
  returning id into v_raffle;

  begin
    update public.raffles set status = 'active' where id = v_raffle;
  exception when others then v_error := sqlerrm; end;

  perform pg_temp.anota('4 ' || case when v_error is not null
    then 'OK       activar sin bases: rechazado'
    else 'CRÍTICO  se activó sin bases' end);

  update public.raffles
     set terms_accepted_by_organizer = true,
         player_terms_text = 'Bases legales de prueba.'
   where id = v_raffle;

  begin
    update public.raffles set status = 'active' where id = v_raffle;
    v_error := null;
  exception when others then v_error := sqlerrm; end;

  perform pg_temp.anota('5 ' || case when v_error is null
    then 'OK       activar con bases aceptadas: permitido'
    else 'CRÍTICO  no se pudo activar: ' || v_error end);
end $$;

-- 6) Editar un activo existente sin tocar términos
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v114.activo', true), '')::uuid;
  v_ok boolean := false;
begin
  if v_raffle is null then return; end if;

  begin
    update public.raffles set title = 'v114 activo editado' where id = v_raffle;
    v_ok := true;
  exception when others then v_ok := false; end;

  perform pg_temp.anota('6 ' || case when v_ok
    then 'OK       un activo existente se puede editar sin tocar términos'
    else 'CRÍTICO  editar un activo falló' end);
end $$;

-- 7) Ledger
do $$
begin
  perform pg_temp.anota('7 ' || case when exists (
    select 1 from public._applied_migrations where version = '0114')
    then 'OK       ledger registra 0114'
    else 'CRÍTICO  falta la fila 0114' end);
end $$;

select current_setting('test.v114', true) as resultado;
rollback;

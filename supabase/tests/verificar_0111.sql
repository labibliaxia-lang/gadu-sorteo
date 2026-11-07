-- =====================================================================
-- Verificador 0111 — solicitud de organizador y blindaje de alta
-- =====================================================================
-- 1 columnas request_tools y request_social
-- 2 un usuario puede completar su solicitud
-- 3 un rol user no puede insertar sorteos (RLS)
-- 4 existe el trigger de KYC obligatorio en raffles
-- 5 ledger 0111
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v111', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v111',
    coalesce(current_setting('test.v111', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare v_user uuid;
begin
  select id into v_user from public.profiles
   where role = 'user' order by created_at limit 1;
  perform set_config('test.v111.user', coalesce(v_user::text, ''), true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 1) Columnas
do $$
declare v_faltan text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['request_tools', 'request_social']) as c
   where not exists (
     select 1 from pg_attribute
      where attrelid = 'public.profiles'::regclass
        and attname = c and not attisdropped
   );

  perform pg_temp.anota('1 ' || case when v_faltan is null
    then 'OK       profiles tiene request_tools y request_social'
    else 'CRÍTICO  faltan columnas: ' || v_faltan end);
end $$;

-- 2) El usuario completa su solicitud
do $$
declare
  v_user uuid := nullif(current_setting('test.v111.user', true), '')::uuid;
  v_tools text;
  v_social text;
begin
  if v_user is null then
    perform pg_temp.anota('2 AVISO    no hay ninguna cuenta con rol user');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  update public.profiles
     set request_tools = 'Celulares y electrodomésticos',
         request_social = '@mitienda',
         admin_request_status = 'pending'
   where id = v_user;

  reset role;

  select request_tools, request_social into v_tools, v_social
    from public.profiles where id = v_user;

  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.anota('2 ' || case
    when v_tools is not null and v_social is not null
      then 'OK       el usuario guardó herramientas y redes en su solicitud'
    else 'CRÍTICO  no se guardaron los campos' end);
end $$;

-- 3) Un user no puede insertar sorteos
do $$
declare
  v_user uuid := nullif(current_setting('test.v111.user', true), '')::uuid;
  v_bloqueo boolean := false;
begin
  if v_user is null then
    perform pg_temp.anota('3 AVISO    no hay ninguna cuenta con rol user');
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.raffles (title, draw_date, price_per_number, status,
                                created_by, payment_type)
    values ('v111 rls', now() + interval '5 days', 100, 'closed',
            v_user, 'transferencia');
  exception when others then v_bloqueo := true; end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.anota('3 ' || case when v_bloqueo
    then 'OK       la RLS bloquea el alta de sorteos para role user'
    else 'CRÍTICO  un user pudo insertar un sorteo' end);
end $$;

-- 4) Trigger de KYC
do $$
begin
  perform pg_temp.anota('4 ' || case when exists (
    select 1 from pg_trigger
     where tgrelid = 'public.raffles'::regclass
       and tgname = 'enforce_organizer_kyc'
       and not tgisinternal)
    then 'OK       el KYC obligatorio está en la base (enforce_organizer_kyc)'
    else 'CRÍTICO  falta el trigger de KYC' end);
end $$;

-- 5) Ledger
do $$
begin
  perform pg_temp.anota('5 ' || case when exists (
    select 1 from public._applied_migrations where version = '0111')
    then 'OK       ledger registra 0111'
    else 'CRÍTICO  falta la fila 0111' end);
end $$;

select current_setting('test.v111', true) as resultado;
rollback;

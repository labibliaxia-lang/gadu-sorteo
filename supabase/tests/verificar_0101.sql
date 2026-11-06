-- =====================================================================
-- Verificador 0101 — notificaciones para los tres roles
-- =====================================================================
-- Qué prueba:
--   1  columnas title, message y audience
--   2  el check de tipos acepta los tipos nuevos
--   3  políticas de lectura/actualización propias y sin INSERT de cliente
--   4  notificar_usuario inserta con título, mensaje y audiencia
--   5  notificar_usuario no es ejecutable por authenticated
--   6  reseña nueva → notificación al organizador
--   7  pregunta nueva → notificación al organizador
--   8  denuncia nueva → notificación al superadmin
--   9  KYC pendiente → notificación al superadmin
--  10  notifications está en la publicación de Realtime
--  11  RLS: el jugador ve solo sus notificaciones
--
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v101', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v101',
    coalesce(current_setting('test.v101', true), '') || p_linea || E'\n', true);
end $$;

-- Preparación: dos cuentas y un sorteo nuevo del organizador.
do $$
declare
  v_owner uuid;
  v_buyer uuid;
  v_admin uuid;
  v_raffle uuid;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin') order by created_at limit 1;

  select id into v_buyer from public.profiles
   where id <> coalesce(v_owner, '00000000-0000-0000-0000-000000000000'::uuid)
   order by created_at limit 1;

  select id into v_admin from public.profiles
   where role = 'superadmin' order by created_at limit 1;

  if v_owner is null or v_buyer is null then
    perform pg_temp.anota('1 AVISO    hacen falta dos cuentas para probar');
    return;
  end if;

  insert into public.raffles (title, draw_date, price_per_number, status, created_by)
  values ('v101 verificador', now() + interval '5 days', 100, 'active', v_owner)
  returning id into v_raffle;

  perform set_config('test.v101.owner', v_owner::text, true);
  perform set_config('test.v101.buyer', v_buyer::text, true);
  perform set_config('test.v101.admin', coalesce(v_admin::text, ''), true);
  perform set_config('test.v101.raffle', v_raffle::text, true);
end $$;

-- 1) Columnas
do $$
declare
  v_faltan text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['title', 'message', 'audience']) as c
   where not exists (
     select 1 from pg_attribute
      where attrelid = 'public.notifications'::regclass
        and attname = c and not attisdropped
   );

  perform pg_temp.anota('1 ' || case when v_faltan is null
    then 'OK       columnas title, message y audience presentes'
    else 'CRÍTICO  faltan columnas: ' || v_faltan end);
end $$;

-- 2) Tipos nuevos y viejos en el check
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check';

  perform pg_temp.anota('2 ' || case
    when v_def like '%buyer_won%' and v_def like '%super_kyc%'
         and v_def like '%reservation_pending%'
      then 'OK       el check acepta tipos nuevos y conserva los viejos'
    else 'CRÍTICO  el check no incluye los tipos nuevos' end);
end $$;

-- 3) Políticas
do $$
declare
  v_sel boolean;
  v_upd boolean;
  v_ins boolean;
begin
  select exists (select 1 from pg_policies
                  where schemaname='public' and tablename='notifications'
                    and policyname='notifications_select_own') into v_sel;

  select exists (select 1 from pg_policies
                  where schemaname='public' and tablename='notifications'
                    and policyname='notifications_update_own') into v_upd;

  select exists (select 1 from pg_policies
                  where schemaname='public' and tablename='notifications'
                    and cmd='INSERT') into v_ins;

  perform pg_temp.anota('3 ' || case
    when v_sel and v_upd and not v_ins
      then 'OK       lectura/actualización propias y sin INSERT de cliente'
    else 'CRÍTICO  sel=' || v_sel || ' upd=' || v_upd || ' insert=' || v_ins end);
end $$;

-- 4) El helper inserta con título, mensaje y audiencia
do $$
declare
  v_owner uuid := nullif(current_setting('test.v101.owner', true), '')::uuid;
  v_id uuid;
begin
  if v_owner is null then return; end if;

  perform public.notificar_usuario(
    v_owner, 'organizer_question', 'Título de prueba', 'Mensaje de prueba',
    'organizer', null, null, '{}'::jsonb
  );

  select id into v_id
    from public.notifications
   where user_id = v_owner
     and title = 'Título de prueba'
     and message = 'Mensaje de prueba'
     and audience = 'organizer'
   order by created_at desc limit 1;

  perform pg_temp.anota('4 ' || case when v_id is not null
    then 'OK       notificar_usuario crea la fila con texto y audiencia'
    else 'CRÍTICO  no se creó la notificación' end);
end $$;

-- 5) El cliente no puede ejecutar el helper
do $$
declare
  v_puede boolean;
begin
  select has_function_privilege(
    'authenticated',
    'public.notificar_usuario(uuid, text, text, text, text, uuid, uuid, jsonb, text)',
    'execute'
  ) into v_puede;

  perform pg_temp.anota('5 ' || case when not v_puede
    then 'OK       authenticated no puede ejecutar notificar_usuario'
    else 'CRÍTICO  authenticated puede insertar notificaciones' end);
end $$;

-- 6) Reseña → organizador
do $$
declare
  v_owner uuid := nullif(current_setting('test.v101.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v101.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v101.raffle', true), '')::uuid;
begin
  if v_owner is null or v_raffle is null then return; end if;

  insert into public.reviews (organizer_id, user_id, raffle_id, user_name, rating, comment)
  values (v_owner, v_buyer, v_raffle, 'Comprador', 5, 'Muy buena atención');

  perform pg_temp.anota('6 ' || case when exists (
    select 1 from public.notifications
     where user_id = v_owner and type = 'organizer_review'
       and raffle_id = v_raffle)
    then 'OK       la reseña avisó al organizador'
    else 'CRÍTICO  la reseña no generó notificación' end);
end $$;

-- 7) Pregunta → organizador
do $$
declare
  v_owner uuid := nullif(current_setting('test.v101.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v101.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v101.raffle', true), '')::uuid;
begin
  if v_owner is null or v_raffle is null then return; end if;

  insert into public.raffle_questions (raffle_id, user_id, question)
  values (v_raffle, v_buyer, '¿Cuándo se sortea?');

  perform pg_temp.anota('7 ' || case when exists (
    select 1 from public.notifications
     where user_id = v_owner and type = 'organizer_question'
       and raffle_id = v_raffle)
    then 'OK       la pregunta avisó al organizador'
    else 'CRÍTICO  la pregunta no generó notificación' end);
end $$;

-- 8) Denuncia → superadmin
do $$
declare
  v_admin uuid := nullif(current_setting('test.v101.admin', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v101.buyer', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v101.raffle', true), '')::uuid;
begin
  if v_raffle is null then return; end if;

  if v_admin is null then
    perform pg_temp.anota('8 AVISO    no hay superadmin para probar la denuncia');
    return;
  end if;

  insert into public.raffle_reports (raffle_id, reporter_id, reason)
  values (v_raffle, v_buyer, 'fraude');

  perform pg_temp.anota('8 ' || case when exists (
    select 1 from public.notifications
     where user_id = v_admin and type = 'super_report'
       and raffle_id = v_raffle)
    then 'OK       la denuncia avisó al superadmin'
    else 'CRÍTICO  la denuncia no generó notificación' end);
end $$;

-- 9) KYC pendiente → superadmin
do $$
declare
  v_admin uuid := nullif(current_setting('test.v101.admin', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v101.buyer', true), '')::uuid;
begin
  if v_admin is null then
    perform pg_temp.anota('9 AVISO    no hay superadmin para probar el KYC');
    return;
  end if;

  -- Todo perfil nace en 'pending'; la subida de documentos es la que avisa.
  update public.profiles
     set verification_status = 'pending',
         dni_front_url = 'verificador/kyc-' || extract(epoch from now())::text || '.jpg'
   where id = v_buyer;

  perform pg_temp.anota('9 ' || case when exists (
    select 1 from public.notifications
     where user_id = v_admin and type = 'super_kyc')
    then 'OK       el KYC pendiente avisó al superadmin'
    else 'CRÍTICO  el KYC no generó notificación' end);
end $$;

-- 10) Realtime
do $$
begin
  perform pg_temp.anota('10 ' || case when exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications')
    then 'OK       notifications está en la publicación de Realtime'
    else 'CRÍTICO  sin publicación no hay toasts' end);
end $$;

-- 11) RLS: el jugador ve solo lo suyo
do $$
declare
  v_owner uuid := nullif(current_setting('test.v101.owner', true), '')::uuid;
  v_buyer uuid := nullif(current_setting('test.v101.buyer', true), '')::uuid;
  v_visibles int;
  v_ajenas int;
begin
  if v_owner is null or v_buyer is null then return; end if;

  perform public.notificar_usuario(v_owner, 'organizer_question', 'solo dueño', 'x', 'organizer');
  perform public.notificar_usuario(v_buyer, 'buyer_won', 'solo comprador', 'x', 'buyer');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_visibles from public.notifications;
  select count(*) into v_ajenas
    from public.notifications where user_id = v_owner;

  reset role;

  perform pg_temp.anota('11 ' || case
    when v_visibles > 0 and v_ajenas = 0
      then 'OK       el jugador no ve notificaciones ajenas'
    else 'CRÍTICO  visibles=' || v_visibles || ' ajenas=' || v_ajenas end);
end $$;

select current_setting('test.v101', true) as resultado;

rollback;

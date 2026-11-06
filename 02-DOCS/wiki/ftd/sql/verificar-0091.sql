-- =====================================================================
-- Verificación de la migración 0091 — fotos de premios entregados
-- =====================================================================
-- Sólo lectura en la PARTE A. La PARTE B crea un escenario temporal y termina
-- en ROLLBACK: no queda nada en la base.
--
-- Pegá todo junto. Al final tiene que decir ROLLBACK.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PARTE A — ¿está todo en su lugar?
-- ---------------------------------------------------------------------

-- A1) La tabla y sus columnas (esperado: 10 filas)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'raffle_delivery_photos'
order by ordinal_position;

-- A2) RLS activa (esperado: rowsecurity = true)
select relname, relrowsecurity as rls_activa
from pg_class
where relname = 'raffle_delivery_photos';

-- A3) Permisos de tabla (esperado: true, true, true)
select
  has_table_privilege('anon', 'public.raffle_delivery_photos', 'SELECT')          as anon_lee,
  has_table_privilege('authenticated', 'public.raffle_delivery_photos', 'INSERT') as auth_inserta,
  has_table_privilege('authenticated', 'public.raffle_delivery_photos', 'SELECT') as auth_lee;

-- A4) Las cuatro políticas (esperado: 4 filas)
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'raffle_delivery_photos'
order by policyname;

-- A5) Los dos triggers (esperado: 2 filas)
select tgname
from pg_trigger
where tgrelid = 'public.raffle_delivery_photos'::regclass
  and not tgisinternal
order by tgname;

-- A6) Ledger (esperado: una fila con 0091)
select version, note
from public._applied_migrations
where version = '0091';


-- ---------------------------------------------------------------------
-- PARTE B — ¿la regla funciona de verdad?
-- Se fabrica un sorteo sorteado con un ganador, y se prueban los tres roles.
-- ---------------------------------------------------------------------

-- B0) Escenario temporal: organizador = perfil más viejo, ganador = más nuevo,
--     tercero = otro cualquiera.
create temp table _v91 on commit drop as
select
  gen_random_uuid() as raffle_id,
  (select id from public.profiles order by created_at asc limit 1)   as organizador,
  (select id from public.profiles order by created_at desc limit 1)  as ganador,
  (select id from public.profiles order by created_at desc offset 1 limit 1) as tercero;

insert into public.raffles
  (id, title, draw_date, price_per_number, status, is_listed,
   whatsapp_contact, transfer_alias, created_by,
   winner_number, winner_name, draw_seed, draw_commitment)
select raffle_id, 'TEST 0091 — BORRAR', now(), 1, 'drawn', false,
       '0000000000', 'prueba', organizador,
       1, 'Ganador de prueba', repeat('a', 64), repeat('b', 64)
from _v91;

insert into public.raffle_numbers (raffle_id, number, status, sold_to)
select raffle_id, 1, 'sold', ganador from _v91;

-- Los ids viajan por settings para que los pueda leer el rol `authenticated`
-- (la tabla temporal no la puede leer).
select
  set_config('v91.raffle', (select raffle_id::text from _v91), true),
  set_config('v91.org',    (select organizador::text from _v91), true),
  set_config('v91.gan',    (select ganador::text from _v91), true),
  set_config('v91.ter',    (select tercero::text from _v91), true);

-- B1) Como ORGANIZADOR: debe publicarse solo (approved)
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v91.org'), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.raffle_delivery_photos (raffle_id, uploaded_by, url)
values (current_setting('v91.raffle')::uuid, current_setting('v91.org')::uuid, 'https://ejemplo/organizador.jpg');

reset role;

select 'B1 organizador' as caso, status, (approved_by is not null) as sello
from public.raffle_delivery_photos where url like '%organizador.jpg';

-- B2) Como GANADOR: debe quedar pendiente (pending)
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v91.gan'), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.raffle_delivery_photos (raffle_id, uploaded_by, url)
values (current_setting('v91.raffle')::uuid, current_setting('v91.gan')::uuid, 'https://ejemplo/ganador.jpg');

-- B3) El ganador NO puede aprobarse solo (lo intenta y tiene que fallar)
do $$
declare v_id uuid;
begin
  select id into v_id from public.raffle_delivery_photos where url like '%ganador.jpg';
  update public.raffle_delivery_photos set status = 'approved' where id = v_id;
  raise notice 'B3 FALLA: el ganador pudo aprobar su propia foto';
exception when others then
  raise notice 'B3 OK: el ganador no puede aprobar (%): %', sqlstate, sqlerrm;
end $$;

reset role;

select 'B2 ganador' as caso, status, (approved_by is null) as sin_sello
from public.raffle_delivery_photos where url like '%ganador.jpg';

-- B4) Como TERCERO (ni dueño ni ganador): debe ser rechazado
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v91.ter'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  insert into public.raffle_delivery_photos (raffle_id, uploaded_by, url)
  values (current_setting('v91.raffle')::uuid, current_setting('v91.ter')::uuid, 'https://ejemplo/tercero.jpg');
  raise notice 'B4 FALLA: un tercero pudo publicar';
exception when others then
  raise notice 'B4 OK: tercero rechazado (%): %', sqlstate, sqlerrm;
end $$;

reset role;

-- B5) Como ORGANIZADOR: aprueba la del ganador
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v91.org'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_id uuid;
begin
  select id into v_id from public.raffle_delivery_photos where url like '%ganador.jpg';
  update public.raffle_delivery_photos set status = 'approved' where id = v_id;
  raise notice 'B5 OK: el organizador aprobó';
exception when others then
  raise notice 'B5 FALLA: el organizador no pudo aprobar (%): %', sqlstate, sqlerrm;
end $$;

reset role;

select 'B5 tras aprobar' as caso, status, (approved_by is not null) as sello, approved_at is not null as con_fecha
from public.raffle_delivery_photos where url like '%ganador.jpg';

-- B6) Un visitante anónimo ve sólo las aprobadas
set local role anon;
select 'B6 anonimo ve' as caso, count(*) as fotos_visibles
from public.raffle_delivery_photos
where raffle_id = current_setting('v91.raffle')::uuid;
reset role;

-- Nada de esto queda: el escenario, las fotos y el sorteo desaparecen.
rollback;

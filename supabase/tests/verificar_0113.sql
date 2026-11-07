-- =====================================================================
-- Verificador 0113 — bases legales por sorteo
-- =====================================================================
-- 1 columnas terms_accepted_by_organizer y player_terms_text
-- 2 el default del flag es false y es NOT NULL
-- 3 se puede guardar el texto y aceptar las bases
-- 4 el texto admite un documento largo (hasta 8000)
-- 5 un sorteo existente puede quedar sin texto (compatibilidad)
-- 6 ledger 0113
-- Transacción con ROLLBACK.
-- =====================================================================

begin;

do $$ begin perform set_config('test.v113', '', true); end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v113',
    coalesce(current_setting('test.v113', true), '') || p_linea || E'\n', true);
end $$;

do $$
declare
  v_owner uuid;
  v_raffle uuid;
begin
  select id into v_owner from public.profiles
   where role in ('admin', 'superadmin') order by created_at limit 1;

  if v_owner is null then
    perform pg_temp.anota('1 AVISO    hace falta un organizador');
    return;
  end if;

  perform set_config('test.v113.owner', v_owner::text, true);
  perform set_config('request.jwt.claims', '', true);

  insert into public.raffles (title, draw_date, price_per_number, status,
                              created_by, payment_type)
  values ('v113 terminos', now() + interval '5 days', 100, 'closed',
          v_owner, 'transferencia')
  returning id into v_raffle;

  perform set_config('test.v113.raffle', v_raffle::text, true);
end $$;

-- 1) Columnas
do $$
declare v_faltan text;
begin
  select string_agg(c, ', ') into v_faltan
    from unnest(array['terms_accepted_by_organizer', 'player_terms_text']) as c
   where not exists (
     select 1 from pg_attribute
      where attrelid = 'public.raffles'::regclass
        and attname = c and not attisdropped
   );

  perform pg_temp.anota('1 ' || case when v_faltan is null
    then 'OK       raffles tiene las dos columnas de bases legales'
    else 'CRÍTICO  faltan columnas: ' || v_faltan end);
end $$;

-- 2) Default y NOT NULL del flag
do $$
declare v_default text; v_nullable text;
begin
  select column_default, is_nullable into v_default, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'raffles'
     and column_name = 'terms_accepted_by_organizer';

  perform pg_temp.anota('2 ' || case
    when v_default like '%false%' and v_nullable = 'NO'
      then 'OK       el flag arranca en false y no acepta NULL'
    else 'CRÍTICO  default=' || coalesce(v_default, 'null')
         || ' nullable=' || coalesce(v_nullable, 'null') end);
end $$;

-- 3) Se guardan texto y aceptación
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v113.raffle', true), '')::uuid;
  v_ok boolean;
begin
  if v_raffle is null then return; end if;

  update public.raffles
     set terms_accepted_by_organizer = true,
         player_terms_text = 'BASES LEGALES DEL SORTEO «v113» — Organizador: Nombre A. DNI 12345678.'
   where id = v_raffle;

  select (terms_accepted_by_organizer and player_terms_text like 'BASES LEGALES%')
    into v_ok
    from public.raffles where id = v_raffle;

  perform pg_temp.anota('3 ' || case when v_ok
    then 'OK       se guardan las bases y la aceptación del organizador'
    else 'CRÍTICO  no se guardaron las bases' end);
end $$;

-- 4) Documento largo
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v113.raffle', true), '')::uuid;
  v_largo text := repeat('Cláusula de prueba. ', 300);
  v_len int;
begin
  if v_raffle is null then return; end if;

  update public.raffles set player_terms_text = v_largo where id = v_raffle;
  select length(player_terms_text) into v_len
    from public.raffles where id = v_raffle;

  perform pg_temp.anota('4 ' || case when v_len = length(v_largo)
    then 'OK       el documento largo se guarda completo (' || v_len || ' caracteres)'
    else 'CRÍTICO  se truncó el texto' end);
end $$;

-- 5) Compatibilidad: puede quedar sin texto
do $$
declare
  v_raffle uuid := nullif(current_setting('test.v113.raffle', true), '')::uuid;
  v_ok boolean;
begin
  if v_raffle is null then return; end if;

  update public.raffles set player_terms_text = null where id = v_raffle;
  select player_terms_text is null into v_ok
    from public.raffles where id = v_raffle;

  perform pg_temp.anota('5 ' || case when v_ok
    then 'OK       un sorteo puede quedar sin texto (sorteos viejos)'
    else 'CRÍTICO  el texto no puede quedar NULL' end);
end $$;

-- 6) Ledger
do $$
begin
  perform pg_temp.anota('6 ' || case when exists (
    select 1 from public._applied_migrations where version = '0113')
    then 'OK       ledger registra 0113'
    else 'CRÍTICO  falta la fila 0113' end);
end $$;

select current_setting('test.v113', true) as resultado;
rollback;

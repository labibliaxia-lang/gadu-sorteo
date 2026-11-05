-- =====================================================================
-- Verificador 0078 — el compromiso se publica con la venta abierta
-- =====================================================================
-- Qué prueba:
--   1  la función exige sorteo activo y fecha futura
--   2  control: con la venta abierta y fecha futura, publica bien
--   3  ataque: con la fecha ya pasada, no deja publicar
--
-- Termina en ROLLBACK: no publica ningún compromiso real.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v78', '', true);
  perform set_config('test.v78.futuro', '', true);
  perform set_config('test.v78.pasado', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.v78',
    coalesce(current_setting('test.v78', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) Declaración
-- ---------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'commit_draw_seed';

  perform pg_temp.anota('1 ' || case
    when v_def is null then 'FALTA    commit_draw_seed no existe'
    when v_def ilike '%draw_date > now()%' and v_def ilike '%active%'
      then 'OK       exige sorteo activo y fecha futura'
    else 'FALTA    la función no tiene la ventana nueva -> aplicar 0078' end);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: dos sorteos del mismo dueño, sin compromiso todavía
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_futuro uuid;
  v_pasado uuid;
begin
  select created_by into v_owner
    from public.raffles
   where status = 'active'
   order by created_at desc
   limit 1;

  select r.id into v_futuro
    from public.raffles r
   where r.created_by = v_owner
     and r.status = 'active'
     and r.draw_date > now()
     and not exists (select 1 from public.raffle_draw_secrets s where s.raffle_id = r.id)
   order by r.draw_date asc
   limit 1;

  select r.id into v_pasado
    from public.raffles r
   where r.created_by = v_owner
     and r.status = 'active'
     and r.draw_date <= now()
     and not exists (select 1 from public.raffle_draw_secrets s where s.raffle_id = r.id)
   order by r.draw_date desc
   limit 1;

  perform set_config('test.v78.futuro', coalesce(v_futuro::text, ''), true);
  perform set_config('test.v78.pasado', coalesce(v_pasado::text, ''), true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  if v_owner is null or v_futuro is null then
    perform pg_temp.anota('2 AVISO    no hay un sorteo activo con fecha futura y sin compromiso');
  end if;

  if v_owner is null or v_pasado is null then
    perform pg_temp.anota('3 AVISO    no hay un sorteo activo con fecha pasada y sin compromiso');
  end if;
end $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- 2) Control: venta abierta y fecha futura
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v78.futuro', true), '')::uuid;
  v_hash text;
begin
  if v_id is null then return; end if;

  begin
    v_hash := public.commit_draw_seed(v_id);

    perform pg_temp.anota('2 ' || case when v_hash is not null and length(v_hash) = 64
      then 'OK       control: con la venta abierta el compromiso se publica'
      else 'CRÍTICO  control: devolvió un compromiso inválido' end);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  control: no pudo publicar con la venta abierta: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3) Ataque: la fecha ya pasó
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v78.pasado', true), '')::uuid;
begin
  if v_id is null then return; end if;

  begin
    perform public.commit_draw_seed(v_id);
    perform pg_temp.anota('3 CRÍTICO  publicó el compromiso con el sorteo ya vencido');
  exception when others then
    perform pg_temp.anota('3 ' || case
      when sqlerrm ilike '%antes de la fecha%'
        then 'OK       bloqueado por 0078: ' || sqlerrm
      when sqlerrm ilike '%ya fue publicado%'
        then 'AVISO    el sorteo elegido ya tenía compromiso'
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

reset role;

select current_setting('test.v78', true) as resultado;

rollback;

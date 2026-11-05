-- =====================================================================
-- Verificador 0077 — «Destacado» lo pone el superadmin
-- =====================================================================
-- Qué prueba:
--   1  los dos triggers están instalados
--   2  control: el camino privilegiado (SQL Editor) sí puede destacar
--   3  ataque: el organizador autenticado NO puede destacar su sorteo
--   4  control: el organizador sigue pudiendo editar otros campos
--
-- Termina en ROLLBACK: no destaca nada.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v77', '', true);
  perform set_config('test.v77.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.v77',
    coalesce(current_setting('test.v77', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 1) Triggers
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_trigger
   where not tgisinternal
     and tgrelid = 'public.raffles'::regclass
     and tgname in ('guard_featured_flag_on_insert', 'guard_featured_flag_on_update');

  perform pg_temp.anota('1 ' || case when v_n = 2
    then 'OK       los dos triggers de 0077 están instalados'
    else 'FALTA    triggers de 0077: ' || v_n || '/2 -> aplicar la migración' end);
end $$;

-- ---------------------------------------------------------------------
-- Preparación: un sorteo de un organizador
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid;
  v_owner uuid;
begin
  select r.id, r.created_by into v_id, v_owner
    from public.raffles r
    join public.profiles p on p.id = r.created_by
   where p.role in ('admin', 'superadmin')
   order by r.created_at desc
   limit 1;

  perform set_config('test.v77.raffle', coalesce(v_id::text, ''), true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  if v_id is null then
    perform pg_temp.anota('2 AVISO    no hay sorteos para probar');
    perform pg_temp.anota('3 AVISO    no hay sorteos para probar');
    perform pg_temp.anota('4 AVISO    no hay sorteos para probar');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Control: el camino privilegiado sí puede (corre como postgres)
-- ---------------------------------------------------------------------
do $$
declare
  v_id uuid := nullif(current_setting('test.v77.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set is_featured = true, featured_at = now() where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('2 ' || case when v_n = 1
      then 'OK       control: el camino privilegiado puede destacar'
      else 'AVISO    la actualización tocó ' || v_n || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('2 CRÍTICO  el camino privilegiado no pudo destacar: ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3-4) Como el organizador autenticado
-- ---------------------------------------------------------------------
set local role authenticated;

do $$
declare
  v_id uuid := nullif(current_setting('test.v77.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set is_featured = not coalesce(is_featured, false) where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('3 ' || case when v_n = 0
      then 'AVISO    0 filas: la prueba no llegó al trigger'
      else 'CRÍTICO  el organizador se destacó su propio sorteo' end);
  exception when others then
    perform pg_temp.anota('3 ' || case when sqlerrm ilike '%superadmin%'
      then 'OK       bloqueado por 0077: ' || sqlerrm
      when sqlerrm ilike any (array['%row-level%', '%permiso%'])
        then 'OK       bloqueado por RLS: ' || sqlerrm
      else 'OTRO     excepción inesperada: ' || sqlerrm end);
  end;
end $$;

do $$
declare
  v_id uuid := nullif(current_setting('test.v77.raffle', true), '')::uuid;
  v_n int;
begin
  if v_id is null then return; end if;

  begin
    update public.raffles set title = title where id = v_id;
    get diagnostics v_n = row_count;
    perform pg_temp.anota('4 ' || case when v_n = 1
      then 'OK       control: el organizador sigue editando su sorteo'
      else 'CRÍTICO  control: la edición legítima tocó ' || v_n || ' fila/s' end);
  exception when others then
    perform pg_temp.anota('4 CRÍTICO  control: falló una edición legítima: ' || sqlerrm);
  end;
end $$;

reset role;

select current_setting('test.v77', true) as resultado;

rollback;

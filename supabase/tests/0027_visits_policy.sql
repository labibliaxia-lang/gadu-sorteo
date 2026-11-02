-- =====================================================================
-- Prueba de 0027 — la política de visitas no se puede saltar
-- =====================================================================
-- Pegar todo en el SQL Editor y ejecutar. Termina en ROLLBACK: no deja nada.
--
-- Qué comprueba:
--   A) La política de INSERT menciona `raffles` (es la de 0027, no la vieja).
--   B) Un ANÓNIMO no puede insertar una visita para un sorteo no activo.
--   C) Un ANÓNIMO sí puede insertar para un sorteo activo (si se bloqueara
--      esto, se rompería el tracking legítimo).
--
-- Los ids se eligen ANTES de cambiar de rol: como anónimo, RLS puede impedir
-- ver sorteos no activos, y `set local role` no se puede usar dentro de un
-- bloque DO. Por eso los casos B y C corren entre `set local role anon` y
-- `reset role`, que van fuera.
-- =====================================================================

begin;

select set_config('test.report', '', true);

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config(
    'test.report',
    coalesce(current_setting('test.report', true), '') || p_linea || E'\n',
    true
  );
end $$;

-- ---------------------------------------------------------------------
-- 0) Elegir los sorteos de prueba (como el rol del editor, sin RLS)
-- ---------------------------------------------------------------------
do $$
declare
  v_active uuid;
  v_inactive uuid;
begin
  select id into v_active from public.raffles where status = 'active' limit 1;
  select id into v_inactive from public.raffles where status <> 'active' limit 1;

  perform set_config('test.active_id', coalesce(v_active::text, ''), true);
  perform set_config('test.inactive_id', coalesce(v_inactive::text, ''), true);
end $$;

-- ---------------------------------------------------------------------
-- A) ¿La política es la de 0027?
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'raffle_visits' and cmd = 'INSERT'
      and coalesce(with_check, '') ilike '%raffles%'
  ) then
    perform pg_temp.anota('A OK -> la política de INSERT exige un sorteo válido (0027)');
  else
    perform pg_temp.anota('A FALLO -> la política de INSERT no menciona raffles: sigue la de 0026');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- B y C) Como anónimo
-- ---------------------------------------------------------------------
set local role anon;

do $$
declare
  v_id uuid := nullif(current_setting('test.inactive_id', true), '')::uuid;
  v_rows int;
begin
  if v_id is null then
    perform pg_temp.anota('B SALTEADO -> no hay ningún sorteo no-activo para probar');
    return;
  end if;

  begin
    insert into public.raffle_visits (raffle_id) values (v_id);
    get diagnostics v_rows = row_count;
    perform pg_temp.anota('B FALLO -> el anónimo insertó una visita en un sorteo no activo');
  exception when others then
    if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%policy%' then
      perform pg_temp.anota('B OK -> bloqueado por RLS: ' || sqlerrm);
    else
      perform pg_temp.anota('B OTRO -> ' || sqlerrm);
    end if;
  end;
end $$;

do $$
declare
  v_id uuid := nullif(current_setting('test.active_id', true), '')::uuid;
  v_rows int;
begin
  if v_id is null then
    perform pg_temp.anota('C SALTEADO -> no hay sorteos activos para probar');
    return;
  end if;

  begin
    insert into public.raffle_visits (raffle_id) values (v_id);
    get diagnostics v_rows = row_count;
    if v_rows = 1 then
      perform pg_temp.anota('C OK -> el tracking legítimo sigue funcionando');
    else
      perform pg_temp.anota('C FALLO -> no se pudo insertar la visita legítima');
    end if;
  exception when others then
    perform pg_temp.anota('C FALLO -> se bloqueó el tracking legítimo: ' || sqlerrm);
  end;
end $$;

reset role;

select current_setting('test.report', true) as resultado;

rollback;

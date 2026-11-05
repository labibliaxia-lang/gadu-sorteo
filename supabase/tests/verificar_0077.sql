-- =====================================================================
-- Verificador 0077 — «Destacado» lo pone el superadmin
-- =====================================================================
-- Qué prueba:
--   1  los dos triggers están instalados
--   2  control: el camino privilegiado (SQL Editor) sí puede destacar
--   3  ataque: un organizador que NO es superadmin no puede destacar
--   4  control: ese organizador sigue editando el resto de su sorteo
--
-- OJO con la preparación: la versión anterior tomaba cualquier sorteo de un
-- organizador y, si el dueño era superadmin, `is_superadmin()` lo eximía y la
-- prueba pasaba en falso (CRÍTICO falso). Acá se fuerza a que el dueño de la
-- prueba sea `admin` —nunca superadmin— dentro de la transacción.
--
-- Termina en ROLLBACK: no cambia roles ni destaca nada.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v77', '', true);
  perform set_config('test.v77.raffle', '', true);
  perform set_config('test.v77.uid', '', true);
  perform set_config('test.v77.owner', '', true);
  perform set_config('test.v77.owner_role', '', true);
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
-- Preparación: sorteo + dueño de prueba que NO sea superadmin
-- ---------------------------------------------------------------------
do $$
declare
  v_raffle uuid;
  v_plain uuid;
  v_owner uuid;
  v_owner_role text;
begin
  select r.id, r.created_by into v_raffle, v_owner
    from public.raffles r
    join public.profiles p on p.id = r.created_by
   where p.role in ('admin', 'superadmin')
   order by r.created_at desc
   limit 1;

  -- Usuario con perfil que no sea superadmin: se promueve a 'admin' solo
  -- dentro de la transacción para que RLS deje editar su propio sorteo.
  select p.id into v_plain
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.role <> 'superadmin'
   order by p.created_at desc
   limit 1;

  if v_raffle is null or v_plain is null then
    perform pg_temp.anota('2 AVISO    faltan datos: hace falta un sorteo y un usuario común');
    perform pg_temp.anota('3 AVISO    faltan datos');
    perform pg_temp.anota('4 AVISO    faltan datos');
    return;
  end if;

  select role into v_owner_role from public.profiles where id = v_owner;

  perform set_config('test.v77.raffle', v_raffle::text, true);
  perform set_config('test.v77.uid', v_plain::text, true);
  perform set_config('test.v77.owner', v_owner::text, true);
  perform set_config('test.v77.owner_role', coalesce(v_owner_role, ''), true);

  -- El dueño de la prueba pasa a ser el usuario común, con rol admin.
  update public.profiles set role = 'admin' where id = v_plain;
  update public.raffles set created_by = v_plain where id = v_raffle;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_plain, 'role', 'authenticated')::text,
    true
  );
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
-- 3-4) Como el organizador (admin, no superadmin)
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
      then 'AVISO    0 filas: RLS cortó antes del trigger'
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

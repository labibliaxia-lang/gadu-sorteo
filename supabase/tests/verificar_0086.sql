-- =====================================================================
-- Verificador 0086 — baja de cuenta: esquema, validaciones y plata intacta
-- =====================================================================
-- Qué prueba:
--   1  la tabla de solicitudes existe y tiene RLS
--   2  una sola solicitud pendiente por usuario
--   3  payments.user_id es nullable y su FK es ON DELETE SET NULL
--   4  refunds.user_id es nullable y su FK es ON DELETE SET NULL
--   5  account_deletion_blockers detecta los cuatro motivos
--   6  borrar la cuenta conserva el pago (con user_id null)
--
-- Todo dentro de una transacción que termina en ROLLBACK.
-- =====================================================================

begin;

do $$
begin
  perform set_config('test.v82', '', true);
  perform set_config('test.v82.uid', '', true);
  perform set_config('test.v82.raffle', '', true);
end $$;

create or replace function pg_temp.anota(p_linea text)
returns void language plpgsql as $$
begin
  perform set_config('test.v82',
    coalesce(current_setting('test.v82', true), '') || p_linea || E'\n', true);
end $$;

-- 1) Tabla y RLS
do $$
begin
  perform pg_temp.anota('1 ' || case
    when to_regclass('public.account_deletion_requests') is null
      then 'FALTA    no existe account_deletion_requests -> aplicar 0086'
    when not (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass)
      then 'FALTA    la tabla no tiene RLS'
    else 'OK       tabla de solicitudes con RLS' end);
end $$;

-- 2) Una sola pendiente por usuario
do $$
begin
  perform pg_temp.anota('2 ' || case when exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and tablename = 'account_deletion_requests'
         and indexdef ilike '%unique%'
         and indexdef ilike '%status = ''pending''%'
    ) then 'OK       un solo pedido pendiente por usuario'
      else 'FALTA    falta el índice único de pendientes' end);
end $$;

-- 3-4) Cascadas convertidas en SET NULL
do $$
declare
  v_pay_nullable boolean;
  v_pay_del char;
  v_ref_nullable boolean;
  v_ref_del char;
begin
  select not attnotnull into v_pay_nullable
    from pg_attribute
   where attrelid = 'public.payments'::regclass and attname = 'user_id';

  select confdeltype into v_pay_del
    from pg_constraint
   where conrelid = 'public.payments'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.payments'::regclass and attname = 'user_id')];

  perform pg_temp.anota('3 ' || case
    when v_pay_nullable and v_pay_del = 'n'
      then 'OK       payments.user_id nullable y ON DELETE SET NULL'
    else 'FALTA    payments.user_id sigue cascada o NOT NULL' end);

  select not attnotnull into v_ref_nullable
    from pg_attribute
   where attrelid = 'public.refunds'::regclass and attname = 'user_id';

  select confdeltype into v_ref_del
    from pg_constraint
   where conrelid = 'public.refunds'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.refunds'::regclass and attname = 'user_id')];

  perform pg_temp.anota('4 ' || case
    when v_ref_nullable and v_ref_del = 'n'
      then 'OK       refunds.user_id nullable y ON DELETE SET NULL'
    else 'FALTA    refunds.user_id sigue cascada o NOT NULL' end);
end $$;

-- Preparación: un usuario con perfil y un sorteo activo
do $$
declare
  v_uid uuid;
  v_raffle uuid;
begin
  select p.id into v_uid
    from public.profiles p
    join auth.users u on u.id = p.id
   where not exists (
     select 1 from public.account_deletion_requests r
      where r.user_id = p.id and r.status = 'pending'
   )
   order by p.created_at
   limit 1;

  select id into v_raffle from public.raffles where status = 'active' order by created_at limit 1;

  perform set_config('test.v82.uid', coalesce(v_uid::text, ''), true);
  perform set_config('test.v82.raffle', coalesce(v_raffle::text, ''), true);
end $$;

-- 5) Los cuatro motivos
do $$
declare
  v_uid uuid := nullif(current_setting('test.v82.uid', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v82.raffle', true), '')::uuid;
  v_bloqueos text[];
begin
  if v_uid is null or v_raffle is null then
    perform pg_temp.anota('5 AVISO    faltan datos para probar las validaciones');
    return;
  end if;

  -- Sorteos abiertos: se le presta un sorteo activo.
  update public.raffles set created_by = v_uid
   where id = (select id from public.raffles where status = 'active' order by created_at desc limit 1);

  -- Pago en vuelo y devolución pendiente.
  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_uid, v_raffle, '{}', 10, 'pending');

  insert into public.refunds (raffle_id, user_id, amount, status)
  values (v_raffle, v_uid, 10, 'pending')
  on conflict (raffle_id, user_id) do update set status = 'pending';

  -- Número vendido en un sorteo abierto.
  update public.raffle_numbers
     set status = 'sold', sold_to = v_uid, sold_at = now(), payment_id = null,
         reserved_by = null, reserved_until = null
   where id = (
     select n.id from public.raffle_numbers n
      join public.raffles r on r.id = n.raffle_id
     where r.status = 'active' and n.status = 'available'
     limit 1
   );

  v_bloqueos := public.account_deletion_blockers(v_uid);

  perform pg_temp.anota('5 ' || case
    when v_bloqueos @> array['sorteos_abiertos', 'pagos_en_vuelo', 'devoluciones_pendientes', 'numeros_en_sorteos_abiertos']
      then 'OK       detecta los cuatro motivos: ' || array_to_string(v_bloqueos, ', ')
    else 'FALTA    motivos detectados: ' || coalesce(array_to_string(v_bloqueos, ', '), 'ninguno') end);

  -- Y una cuenta limpia no tiene bloqueos.
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 6) Borrar la cuenta no borra el pago
do $$
declare
  v_uid uuid := nullif(current_setting('test.v82.uid', true), '')::uuid;
  v_raffle uuid := nullif(current_setting('test.v82.raffle', true), '')::uuid;
  v_pago uuid;
  v_quedo int;
begin
  if v_uid is null or v_raffle is null then
    perform pg_temp.anota('6 AVISO    sin usuario para probar la conservación del pago');
    return;
  end if;

  insert into public.payments (user_id, raffle_id, numbers, amount, status)
  values (v_uid, v_raffle, '{}', 1234.56, 'approved')
  returning id into v_pago;

  delete from auth.users where id = v_uid;

  select count(*) into v_quedo
    from public.payments where id = v_pago and user_id is null;

  perform pg_temp.anota('6 ' || case when v_quedo = 1
    then 'OK       el pago sobrevive a la baja, sin dueño'
    else 'CRÍTICO  el pago se perdió al borrar la cuenta' end);
end $$;

select current_setting('test.v82', true) as resultado;

rollback;

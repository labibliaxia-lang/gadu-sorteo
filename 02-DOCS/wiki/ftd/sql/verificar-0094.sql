-- =====================================================================
-- Verificación de la 0094 — la devolución libera al pagarse
-- =====================================================================
-- Todo dentro de una transacción que termina en ROLLBACK: no queda nada.
-- No usa tablas temporales: los ids viajan por `set_config`, que sobrevive al
-- cambio de rol y a los commits intermedios del editor.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Escenario: sorteo activo con los números 3 y 9 vendidos al mismo comprador.
-- Se arma como postgres, antes de cambiar de rol.
-- ---------------------------------------------------------------------
select set_config('v94.raffle', gen_random_uuid()::text, true);
select set_config('v94.org',
  (select id::text from public.profiles order by created_at asc limit 1), true);
select set_config('v94.com',
  (select id::text from public.profiles order by created_at desc limit 1), true);

insert into public.raffles
  (id, title, draw_date, price_per_number, status, is_listed,
   whatsapp_contact, transfer_alias, created_by)
values (
  current_setting('v94.raffle')::uuid,
  'TEST 0094 — BORRAR',
  now() + interval '7 days',
  500, 'active', false, '0000000000', 'prueba',
  current_setting('v94.org')::uuid
);

insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
values
  (current_setting('v94.raffle')::uuid, 3, 'sold', current_setting('v94.com')::uuid, now()),
  (current_setting('v94.raffle')::uuid, 9, 'sold', current_setting('v94.com')::uuid, now());

-- El organizador necesita ser admin para pasar el control de la función.
update public.profiles set role = 'admin'
where id = current_setting('v94.org')::uuid;

-- ---------------------------------------------------------------------
-- 1) ANTES: los dos números vendidos
-- ---------------------------------------------------------------------
select '1-antes' as paso, status, count(*) as cuantos
from public.raffle_numbers
where raffle_id = current_setting('v94.raffle')::uuid and number in (3, 9)
group by status;

-- ---------------------------------------------------------------------
-- 2) Registrar la devolución como organizador
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v94.org'), 'role', 'authenticated')::text, true);
set local role authenticated;

select public.refund_and_release_numbers(
  current_setting('v94.raffle')::uuid,
  array[3, 9],
  'prueba de verificacion 0094'
) as numeros_cubiertos;

reset role;

-- ---------------------------------------------------------------------
-- 3) Los números TIENEN que seguir vendidos. Esta es la prueba del cambio.
-- ---------------------------------------------------------------------
select '3-tras-registrar' as paso, status, count(*) as cuantos
from public.raffle_numbers
where raffle_id = current_setting('v94.raffle')::uuid and number in (3, 9)
group by status;

-- 4) La devolución guardó sus números y quedó pendiente
select '4-refund' as paso, status, amount, numbers,
       (numbers @> array[3, 9]) as tiene_los_dos
from public.refunds
where raffle_id = current_setting('v94.raffle')::uuid;

-- ---------------------------------------------------------------------
-- 5) Marcar pagada (lo mismo que hace markRefundPaid)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v94.org'), 'role', 'authenticated')::text, true);
set local role authenticated;

update public.refunds
set status = 'paid', paid_at = now()
where raffle_id = current_setting('v94.raffle')::uuid;

reset role;

-- ---------------------------------------------------------------------
-- 6) AHORA sí: los números tienen que estar disponibles
-- ---------------------------------------------------------------------
select '6-tras-pagar' as paso, status, count(*) as cuantos
from public.raffle_numbers
where raffle_id = current_setting('v94.raffle')::uuid and number in (3, 9)
group by status;

-- 7) Quedó registrado en la auditoría
select '7-auditoria' as paso, action, numbers, reason
from public.raffle_audit
where raffle_id = current_setting('v94.raffle')::uuid
order by created_at;

-- Nada de esto queda.
rollback;

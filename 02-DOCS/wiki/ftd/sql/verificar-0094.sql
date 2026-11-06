-- =====================================================================
-- Verificación de la 0094 — la devolución libera al pagarse
-- =====================================================================
-- Todo dentro de una transacción que termina en ROLLBACK: no queda nada.
-- Necesita que 0091 y 0092 estén aplicadas (usa `refunds`, `raffle_audit`,
-- `payments`).
--
-- El escenario: un sorteo activo con 2 números vendidos al mismo comprador.
-- Se registra la devolución y se comprueba que los números SIGUEN vendidos.
-- Después se marca pagada y se comprueba que se liberan.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Escenario. Se arma como postgres antes de cambiar de rol.
-- ---------------------------------------------------------------------
create temp table _v94 on commit drop as
select
  gen_random_uuid() as raffle_id,
  (select id from public.profiles order by created_at asc limit 1)        as organizador,
  (select id from public.profiles order by created_at desc limit 1)       as comprador;

insert into public.raffles
  (id, title, draw_date, price_per_number, status, is_listed,
   whatsapp_contact, transfer_alias, created_by)
select raffle_id, 'TEST 0094 — BORRAR', now() + interval '7 days', 500,
       'active', false, '0000000000', 'prueba', organizador
from _v94;

insert into public.raffle_numbers (raffle_id, number, status, sold_to, sold_at)
select raffle_id, n, 'sold', comprador, now()
from _v94, unnest(array[3, 9]) as n;

select
  set_config('v94.raffle', (select raffle_id::text from _v94), true),
  set_config('v94.org',    (select organizador::text from _v94), true),
  set_config('v94.com',    (select comprador::text from _v94), true);

-- El organizador tiene que ser admin para pasar el control de la función.
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

-- 3) Los números TIENEN que seguir vendidos
select '3-tras-registrar' as paso, status, count(*) as cuantos
from public.raffle_numbers
where raffle_id = current_setting('v94.raffle')::uuid and number in (3, 9)
group by status;

-- 4) La devolución guardó sus números y quedó pendiente
select '4-refund' as paso, status, amount, numbers, (numbers @> array[3,9]) as tiene_los_dos
from public.refunds
where raffle_id = current_setting('v94.raffle')::uuid;

-- ---------------------------------------------------------------------
-- 5) Marcar pagada (como lo hace markRefundPaid)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('v94.org'), 'role', 'authenticated')::text, true);
set local role authenticated;

update public.refunds
set status = 'paid', paid_at = now()
where raffle_id = current_setting('v94.raffle')::uuid;

reset role;

-- 6) AHORA sí: los números tienen que estar disponibles
select '6-tras-pagar' as paso, status, count(*) as cuantos
from public.raffle_numbers
where raffle_id = current_setting('v94.raffle')::uuid and number in (3, 9)
group by status;

-- 7) Quedó registrado en la auditoría
select '7-auditoria' as paso, action, numbers, reason
from public.raffle_audit
where raffle_id = current_setting('v94.raffle')::uuid
order by created_at;

rollback;

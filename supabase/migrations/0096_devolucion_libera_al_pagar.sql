-- =====================================================================
-- 0094 — La devolución libera los números cuando se PAGA, no al registrarse
-- =====================================================================
-- QUÉ ESTABA MAL
-- `refund_and_release_numbers` (0091) hacía dos cosas en un mismo acto:
-- registraba la devolución Y devolvía los números a la venta. Consecuencia: el
-- organizador podía soltar un número sin haber transferido la plata y venderlo
-- otra vez. El comprador nuevo pagaba por un número que el anterior todavía
-- estaba esperando cobrar.
--
-- Decisión del dueño (2026-11-06): el número se libera al confirmar el pago.
--
-- POR QUÉ NO ALCANZA CON CAMBIAR UNA LÍNEA
-- `refunds` no guardaba qué números cubría cada devolución (0063). Si se saca la
-- liberación del registro, después no hay de dónde sacar qué liberar. Por eso:
--   1. se agrega `refunds.numbers`;
--   2. el registro guarda los números y NO libera;
--   3. un trigger libera cuando el estado pasa a 'paid'.
--
-- POR QUÉ UN TRIGGER Y NO CAMBIAR LA APP
-- `markRefundPaid` (actions.ts:800) sólo hace `update refunds set status='paid'`.
-- Con el trigger, esa acción sigue igual y la liberación ocurre sola, sin que
-- nadie tenga que acordarse de llamarla. Menos piezas que puedan desincronizarse.
--
-- LO QUE NO SE LIBERA
-- Si el sorteo ya está `drawn`, la plata se marca pagada igual (se debe), pero
-- los números NO se liberan: cambiar la lista de participantes después de
-- sortear sería peor que no liberar. Queda registrado en la auditoría con el
-- motivo.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La devolución recuerda sus números
-- ---------------------------------------------------------------------
alter table public.refunds
  add column if not exists numbers int[];

comment on column public.refunds.numbers is
  'Números que cubre la devolución. Se liberan recién al pasar a status paid (0094).';

-- ---------------------------------------------------------------------
-- 2) La auditoría acepta la acción nueva
--    Se repiten las cuatro de 0092 para no borrar lo que ya usaban.
-- ---------------------------------------------------------------------
alter table public.raffle_audit
  drop constraint if exists raffle_audit_action_check;

alter table public.raffle_audit
  add constraint raffle_audit_action_check check (action in (
    'release_reservation',
    'refund_numbers',
    'mark_sold',
    'register_payment',
    'refund_number_released'
  ));

-- ---------------------------------------------------------------------
-- 3) Registrar la devolución SIN liberar
--    Mismo nombre y misma firma que 0091, para no tocar la interfaz.
-- ---------------------------------------------------------------------
create or replace function public.refund_and_release_numbers(
  p_raffle_id uuid,
  p_numbers int[],
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado text;
  v_motivo text := btrim(coalesce(p_reason, ''));
  v_numeros int[];
  v_total numeric := 0;
  v_cubiertos int := 0;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not public.is_admin() or not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  select r.status into v_estado
  from public.raffles r
  where r.id = p_raffle_id
  for update;

  if v_estado is null then
    raise exception 'El sorteo no existe';
  end if;

  if v_estado not in ('active', 'closed') then
    raise exception 'El sorteo está %: no se pueden devolver números', v_estado;
  end if;

  if length(v_motivo) < 10 then
    raise exception 'Escribí un motivo de al menos 10 caracteres';
  end if;

  select array_agg(distinct n.number order by n.number)
  into v_numeros
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold'
    and n.number = any (coalesce(p_numbers, array[]::int[]));

  if v_numeros is null then
    return 0;
  end if;

  v_cubiertos := array_length(v_numeros, 1);

  -- Cada pago se reparte entre los números vendidos que cubre (criterio 0079).
  with pagos as (
    select n.payment_id, count(*)::numeric as numeros
    from public.raffle_numbers n
    where n.raffle_id = p_raffle_id
      and n.status = 'sold'
      and n.payment_id is not null
    group by n.payment_id
  ),
  items as (
    select
      n.number,
      n.sold_to,
      case
        when n.payment_id is null then r.price_per_number
        else coalesce(pay.amount, r.price_per_number) / pagos.numeros
      end as importe
    from public.raffle_numbers n
    join public.raffles r on r.id = n.raffle_id
    left join public.payments pay on pay.id = n.payment_id
    left join pagos on pagos.payment_id = n.payment_id
    where n.raffle_id = p_raffle_id
      and n.status = 'sold'
      and n.number = any (v_numeros)
      and n.sold_to is not null
  )
  select coalesce(round(sum(importe), 2), 0) into v_total from items;

  -- Se acumula: un comprador puede tener varias devoluciones parciales.
  with pagos as (
    select n.payment_id, count(*)::numeric as numeros
    from public.raffle_numbers n
    where n.raffle_id = p_raffle_id
      and n.status = 'sold'
      and n.payment_id is not null
    group by n.payment_id
  ),
  items as (
    select
      n.number,
      n.sold_to,
      case
        when n.payment_id is null then r.price_per_number
        else coalesce(pay.amount, r.price_per_number) / pagos.numeros
      end as importe
    from public.raffle_numbers n
    join public.raffles r on r.id = n.raffle_id
    left join public.payments pay on pay.id = n.payment_id
    left join pagos on pagos.payment_id = n.payment_id
    where n.raffle_id = p_raffle_id
      and n.status = 'sold'
      and n.number = any (v_numeros)
      and n.sold_to is not null
  )
  insert into public.refunds (raffle_id, user_id, amount, numbers)
  select
    p_raffle_id,
    sold_to,
    round(sum(importe), 2),
    array_agg(distinct number order by number)
  from items
  group by sold_to
  on conflict (raffle_id, user_id)
  do update set
    amount  = public.refunds.amount + excluded.amount,
    -- Puede haber repetidos si se devuelve dos veces el mismo número; al
    -- liberar se usa `number = any (numbers)`, así que el duplicado no molesta.
    numbers = coalesce(public.refunds.numbers, '{}') || coalesce(excluded.numbers, '{}');

  -- ACÁ NO SE LIBERA NADA. Los números siguen vendidos hasta que la devolución
  -- se marque pagada. Ese es el cambio de esta migración.

  insert into public.raffle_audit (raffle_id, actor_id, action, numbers, amount, reason)
  values (p_raffle_id, v_uid, 'refund_numbers', v_numeros, v_total, v_motivo);

  return v_cubiertos;
end;
$$;

revoke all on function public.refund_and_release_numbers(uuid, int[], text)
  from public, anon;
grant execute on function public.refund_and_release_numbers(uuid, int[], text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Al marcar pagada, liberar los números
-- ---------------------------------------------------------------------
create or replace function public.liberar_numeros_al_pagar_devolucion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_liberados int := 0;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  select status into v_estado from public.raffles where id = new.raffle_id;

  if coalesce(array_length(new.numbers, 1), 0) > 0 then
    if v_estado in ('active', 'closed') then
      update public.raffle_numbers
      set status = 'available',
          sold_to = null,
          sold_at = null,
          payment_id = null,
          reserved_by = null,
          reserved_until = null
      where raffle_id = new.raffle_id
        and number = any (new.numbers)
        and sold_to = new.user_id;

      get diagnostics v_liberados = row_count;
    end if;
  end if;

  insert into public.raffle_audit (raffle_id, actor_id, action, numbers, amount, reason)
  values (
    new.raffle_id,
    auth.uid(),
    'refund_number_released',
    coalesce(new.numbers, '{}'),
    new.amount,
    case
      when v_liberados > 0 then
        format('devolución pagada: %s número(s) liberados', v_liberados)
      when coalesce(array_length(new.numbers, 1), 0) = 0 then
        'devolución pagada sin números asociados: no había nada que liberar'
      else
        format('devolución pagada sin liberar: el sorteo está %s', coalesce(v_estado, 'sin estado'))
    end
  );

  return new;
end;
$$;

drop trigger if exists liberar_numeros_al_pagar_devolucion on public.refunds;
create trigger liberar_numeros_al_pagar_devolucion
  after update on public.refunds
  for each row execute procedure public.liberar_numeros_al_pagar_devolucion();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0096', 'la devolucion libera numeros al pagarse, no al registrarse')
    on conflict (version) do nothing;
  end if;
end;
$$;

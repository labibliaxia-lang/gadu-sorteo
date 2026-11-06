-- =====================================================================
-- 0083 — Un sorteo con participantes no se elimina
-- =====================================================================
-- Qué resuelve:
--   `raffles_delete_owner` (0041/0065) permite al dueño borrar su sorteo por
--   PostgREST en cualquier estado. `payments.raffle_id`, `raffle_numbers` y
--   `refunds` están `on delete cascade`, así que borrar un sorteo con ventas
--   **destruye los pagos** y deja a los compradores sin comprobante.
--   La Server Action `deleteRaffle` tampoco miraba el estado.
--
-- Qué hace:
--   Trigger BEFORE DELETE: aborta si el sorteo tiene cualquier número no
--   disponible (vendido o reservado), algún pago, alguna devolución o el
--   compromiso de semilla publicado.
--   `service_role` y el SQL Editor quedan exceptuados: son mantenimiento.
--
-- Por qué en la base y no solo en la acción:
--   el dueño puede llamar a PostgREST directamente. La política de DELETE ya
--   existe, así que el freno tiene que vivir en la tabla.
--
-- Idempotente.
-- =====================================================================

create or replace function public.guard_raffle_deletion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_user, '') in ('service_role', 'postgres', 'supabase_admin') then
    return old;
  end if;

  if old.draw_commitment is not null
     or exists (
       select 1 from public.raffle_numbers
        where raffle_id = old.id and status <> 'available'
     )
     or exists (
       select 1 from public.payments where raffle_id = old.id
     )
     or exists (
       select 1 from public.refunds where raffle_id = old.id
     ) then
    raise exception
      'No se puede eliminar un sorteo con participantes, pagos, devoluciones o compromiso publicado'
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

comment on function public.guard_raffle_deletion() is
  'Borra un sorteo solo si no tiene numeros vendidos/reservados, pagos, devoluciones ni compromiso.';

drop trigger if exists guard_raffle_deletion on public.raffles;
create trigger guard_raffle_deletion
  before delete on public.raffles
  for each row execute function public.guard_raffle_deletion();

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0083', 'un sorteo con participantes, pagos, devoluciones o compromiso no se puede eliminar')
    on conflict (version) do nothing;
  end if;
end;
$$;

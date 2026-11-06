-- =====================================================================
-- 0088 — Estados terminales congelados y la venta corta en la fecha
-- =====================================================================
-- Qué resuelve (razonamiento del 2026-11-06):
--   1. `cancelled` no tenía guarda: el dueño podía devolver un sorteo
--      cancelado a `active` por PostgREST (`raffles_update_owner`) y seguir
--      vendiendo números de un sorteo que ya generó devoluciones.
--      `drawn` ya estaba congelado por 0034; `cancelled` no.
--   2. `reserve_numbers` solo miraba `status = 'active'`: con la fecha ya
--      pasada se podían reservar números y entrar a un sorteo que la cuenta
--      regresiva mostraba como alcanzado.
--
-- Qué agrega:
--   · `guard_terminal_raffle_state`: BEFORE UPDATE OF status, aborta si el
--     sorteo estaba `drawn` o `cancelled` y se intenta mover a otro estado.
--   · `reserve_numbers` (cuerpo de 0076) rechaza si `draw_date <= now()`.
--
-- Excepción: `service_role`, `postgres` y `supabase_admin` (mantenimiento y
-- las RPC `security definer`, que corren como el dueño de la función).
--
-- Idempotente.
-- =====================================================================

create or replace function public.guard_terminal_raffle_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_user, '') in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if old.status in ('drawn', 'cancelled') and new.status is distinct from old.status then
    raise exception
      'El sorteo está %: su estado no se puede cambiar', old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_terminal_raffle_state() is
  'Los estados terminales (drawn, cancelled) no se pueden abandonar: un sorteo cancelado no se reabre.';

drop trigger if exists guard_terminal_raffle_state on public.raffles;
create trigger guard_terminal_raffle_state
  before update of status on public.raffles
  for each row execute function public.guard_terminal_raffle_state();

-- ---------------------------------------------------------------------
-- La venta corta en la fecha del sorteo
-- ---------------------------------------------------------------------
create or replace function public.reserve_numbers(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requested int[];
  v_reserved int[];
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
  end if;

  if not public.check_rate_limit('reserve:' || v_uid::text, 20, 3600) then
    raise exception 'Demasiadas reservas seguidas. Probá de nuevo en unos minutos.';
  end if;

  select coalesce(array_agg(distinct x order by x), array[]::int[])
    into v_requested
    from unnest(coalesce(p_numbers, array[]::int[])) as x;

  if array_length(v_requested, 1) is null then
    return array[]::int[];
  end if;

  if array_length(v_requested, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(v_requested) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  -- La fecha es una promesa: después de draw_date no se reserva más.
  if exists (
    select 1 from public.raffles
    where id = p_raffle_id and draw_date <= now()
  ) then
    raise exception 'El sorteo ya alcanzó su fecha: no se pueden reservar números';
  end if;

  update public.raffle_numbers
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and reserved_by = v_uid
     and reserved_until is not null
     and reserved_until < now();

  with nuevos as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = now() + interval '10 minutes'
     where raffle_id = p_raffle_id
       and number = any (v_requested)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number order by number), array[]::int[])
    into v_reserved
  from nuevos;

  return v_reserved;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0088', 'estados terminales congelados (drawn/cancelled) y reserve_numbers corta en draw_date')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- 0106 — El organizador no compra en su propio sorteo
-- =====================================================================
-- Hallazgo: comprar en el propio sorteo permite inflar el mínimo de venta y
-- hasta ganar el premio, que es justo lo que un comprador desconfía.
--
-- Regla (idéntica para admin, superadmin y user, sin excepciones):
--   si la raffle fue creada por auth.uid(), no se puede reservar.
-- Comprar en sorteos AJENOS sigue permitido: no se toca ninguna otra guarda.
--
-- Se recrean `reserve_numbers` y `reserve_numbers_prepaid` con el mismo cuerpo
-- de 0089 más el control. No se modifican pagos, métricas ni notificaciones.
--
-- Idempotente.
-- =====================================================================

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
  v_expira timestamptz;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  -- 0106: nadie compra en su propio sorteo.
  if exists (
    select 1 from public.raffles r
     where r.id = p_raffle_id and r.created_by = v_uid
  ) then
    raise exception 'No podés comprar números en tu propio sorteo';
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

  v_expira := now() + interval '10 minutes';

  with nuevos as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = v_expira
     where raffle_id = p_raffle_id
       and number = any (v_requested)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number order by number), array[]::int[])
    into v_reserved
  from nuevos;

  perform public.notificar_reserva(p_raffle_id, v_uid, v_reserved, v_expira);

  return v_reserved;
end;
$$;

revoke all on function public.reserve_numbers(uuid, int[]) from public, anon;
grant execute on function public.reserve_numbers(uuid, int[]) to authenticated, service_role;

create or replace function public.reserve_numbers_prepaid(
  p_raffle_id uuid,
  p_numbers int[],
  p_hold_hours integer default 48
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hold integer;
  v_reserved int[];
  v_expira timestamptz;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  -- 0106: nadie compra en su propio sorteo.
  if exists (
    select 1 from public.raffles r
     where r.id = p_raffle_id and r.created_by = v_uid
  ) then
    raise exception 'No podés comprar números en tu propio sorteo';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and is_banned) then
    raise exception 'Tu cuenta está suspendida. Contactá al soporte.';
  end if;

  if not public.check_rate_limit('reserve:' || v_uid::text, 20, 3600) then
    raise exception 'Demasiadas reservas seguidas. Probá de nuevo en unos minutos.';
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is null then
    raise exception 'Elegí al menos un número';
  end if;

  if array_length(p_numbers, 1) > 100 then
    raise exception 'Máximo 100 números por compra';
  end if;

  if exists (select 1 from unnest(p_numbers) as n where n < 1 or n > 10000) then
    raise exception 'Número inválido';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  v_hold := greatest(1, least(coalesce(p_hold_hours, 48), 72));

  update public.raffle_numbers
     set status = 'available',
         reserved_by = null,
         reserved_until = null
   where raffle_id = p_raffle_id
     and status = 'reserved'
     and reserved_by = v_uid
     and reserved_until is not null
     and reserved_until < now();

  v_expira := now() + make_interval(hours => v_hold);

  with updated as (
    update public.raffle_numbers
       set status = 'reserved',
           reserved_by = v_uid,
           reserved_until = v_expira
     where raffle_id = p_raffle_id
       and number = any (p_numbers)
       and status = 'available'
    returning number
  )
  select coalesce(array_agg(number), array[]::int[])
    into v_reserved
  from updated;

  perform public.notificar_reserva(p_raffle_id, v_uid, v_reserved, v_expira);

  return v_reserved;
end;
$$;

revoke all on function public.reserve_numbers_prepaid(uuid, int[], integer)
  from public, anon;
grant execute on function public.reserve_numbers_prepaid(uuid, int[], integer)
  to authenticated, service_role;

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0106', 'el organizador no puede comprar en su propio sorteo')
    on conflict (version) do nothing;
  end if;
end;
$$;

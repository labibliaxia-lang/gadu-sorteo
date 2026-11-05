-- =====================================================================
-- 0074 — No se confirma un pago prepago con el sorteo ya sorteado
-- =====================================================================
-- Qué resuelve: `organizer_mark_reserved_sold` (0029:139) nació antes de que
-- existiera la regla «no se vende después de sortear». La 0071 se la aplicó a
-- `sell_numbers` y a `organizer_mark_sold`, pero se olvidó de esta función, que
-- es la que usa el camino de prepago manual — hoy el único activo, porque
-- Mercado Pago está apagado.
--
-- Qué pasaba sin esto: el organizador marcaba un pago como recibido después del
-- sorteo. Esos números pasaban a `sold`, el listado vendido cambiaba, y
-- `numbers_hash` dejaba de reproducirse. El verificador público entonces
-- acusaba fraude en un sorteo que había sido limpio. Es exactamente el fallo que
-- la 0071 describe en su cabecera.
--
-- Cómo: mismo cuerpo que 0029, con el estado del sorteo como precondición, igual
-- que 0071:132-144. Se mantiene el «todo o nada»: si un número ya no estaba
-- reservado, el UPDATE entero se revierte.
--
-- Los grants no se tocan: `create or replace` conserva los de 0029
-- (revoke de public/anon, grant a authenticated).
-- =====================================================================

create or replace function public.organizer_mark_reserved_sold(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_expected int;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if p_numbers is null or array_length(p_numbers, 1) is null then
    raise exception 'Elegí al menos un número';
  end if;

  select status into v_status
  from public.raffles
  where id = p_raffle_id;

  if v_status is null then
    raise exception 'El sorteo no existe';
  end if;

  -- La precondición que faltaba: un sorteo sorteado no admite más ventas.
  -- Es un error visible, no un no-op: es una acción del panel, con alguien
  -- mirando la pantalla.
  if v_status = 'drawn' then
    raise exception
      'El sorteo ya fue sorteado: no se pueden confirmar pagos de reservas';
  end if;

  v_expected := array_length(p_numbers, 1);

  update public.raffle_numbers
  set status = 'sold',
      sold_to = reserved_by,
      sold_at = now(),
      payment_id = null,
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by is not null;

  get diagnostics v_count = row_count;

  -- Todo o nada: si un número ya no estaba reservado, el UPDATE se revierte
  -- y el organizador vuelve a cargar la lista, en vez de dejar una venta
  -- parcial sin comprador.
  if v_count <> v_expected then
    raise exception 'Algunos números ya no están reservados';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0074', 'prepago: no se confirma pago con el sorteo sorteado')
    on conflict (version) do nothing;
  end if;
end
$$;

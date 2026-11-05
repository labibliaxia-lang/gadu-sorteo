-- =====================================================================
-- 0071 — No se adelanta el sorteo ni se vende después de sortear
-- =====================================================================
-- Hallazgos (auditoría 2026-11-04, ALTA nº 5 y nº 6):
--
--   5) `enforce_draw_date` (0047:17-20) mira `new.draw_date > now()`. Como
--      evalúa el valor NUEVO, un solo UPDATE que ponga `status='drawn'` y baje
--      `draw_date` al pasado en la misma sentencia esquiva el freno: el
--      organizador puede sortear hoy un sorteo anunciado para dentro de un mes,
--      cuando todavía hay pocos números vendidos.
--
--   6) `sell_numbers` (0001:247) y `organizer_mark_sold` (0016:34) pasan
--      números a `sold` sin mirar el estado del sorteo. Un pago aprobado tarde
--      agrega números al listado DESPUÉS del sorteo, y el `numbers_hash`
--      publicado deja de reproducirse: el verificador acusa fraude en un
--      sorteo limpio.
--
-- Qué NO cambia: el motor del sorteo. No se toca ninguna función `draw_winner*`
-- ni la fórmula de los hashes. Solo se agregan frenos alrededor.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) No adelantar el sorteo bajando la fecha en el mismo UPDATE
-- ---------------------------------------------------------------------
create or replace function public.enforce_draw_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'drawn' and old.status is distinct from 'drawn' then
    -- La fecha ANTERIOR es la que el público vio anunciada: si estaba en el
    -- futuro, moverla en el mismo UPDATE no habilita el sorteo.
    if old.draw_date is not null and old.draw_date > now() then
      raise exception
        'El sorteo está programado para el %; todavía no se puede ejecutar',
        to_char(old.draw_date at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
    end if;

    -- Y la nueva tampoco puede quedar en el futuro.
    if new.draw_date is not null and new.draw_date > now() then
      raise exception
        'El sorteo está programado para el %; todavía no se puede ejecutar',
        to_char(new.draw_date at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_draw_date on public.raffles;
create trigger enforce_draw_date
  before update on public.raffles
  for each row execute procedure public.enforce_draw_date();

-- ---------------------------------------------------------------------
-- 2) Un sorteo ya sorteado no admite ventas nuevas
-- ---------------------------------------------------------------------
-- Mismo cuerpo que 0001:247 con un candado: si el sorteo está `drawn`, el
-- UPDATE no toca ninguna fila. Se prefiere devolver 0 antes que lanzar, porque
-- el webhook ya interpreta «vendí menos de lo cobrado» y lo registra para
-- conciliación; lanzar solo haría que Mercado Pago reintente en vano.
create or replace function public.sell_numbers(
  p_raffle_id uuid,
  p_user_id uuid,
  p_numbers int[],
  p_payment_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Serializa con el sorteo: `draw_winner_core` toma el mismo lock.
  perform 1 from public.raffles where id = p_raffle_id for update;

  update public.raffle_numbers
  set status = 'sold',
      sold_to = p_user_id,
      payment_id = p_payment_id,
      sold_at = now(),
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by = p_user_id
    and exists (
      select 1 from public.raffles r
      where r.id = p_raffle_id and r.status <> 'drawn'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) El organizador tampoco marca ventas en un sorteo ya sorteado
-- ---------------------------------------------------------------------
-- Mismo cuerpo que 0016:11 con el estado del sorteo como precondición.
create or replace function public.organizer_mark_sold(
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

  select status into v_status
  from public.raffles
  where id = p_raffle_id;

  if v_status is null then
    raise exception 'El sorteo no existe';
  end if;

  -- Acá conviene un error visible: es una acción del panel, no un webhook.
  if v_status = 'drawn' then
    raise exception
      'El sorteo ya fue sorteado: no se pueden marcar más números como vendidos';
  end if;

  update public.raffle_numbers
  set status = 'sold',
      sold_to = reserved_by,
      sold_at = now(),
      payment_id = null,
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status in ('available', 'reserved');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0071', 'no se adelanta el sorteo bajando draw_date ni se venden numeros con el sorteo sorteado')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba completa: supabase/tests/verificar_0071.sql)
-- =====================================================================
-- Rollback: volver a los cuerpos de 0047:11, 0001:247 y 0016:11.
-- =====================================================================

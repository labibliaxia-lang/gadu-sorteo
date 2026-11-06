-- =====================================================================
-- 0104 — Origen del número: venta o premio
-- =====================================================================
-- Los números que otorga "Invitá y ganá" quedaban como vendidos sin pago, y la
-- planilla de ventas los mostraba como "Sin pago registrado": ensuciaba las
-- métricas y parecía una deuda del comprador.
--
-- Ahora `raffle_numbers.origin` distingue:
--   · 'venta'  — se compró (con o sin pago registrado todavía).
--   · 'premio' — lo otorgó un referido o un sorteo promocional.
--
-- Cambios:
--   1. Columna `origin` con check y default 'venta'.
--   2. `reward_referral` marca el número como premio al otorgarlo.
--   3. RPC `raffle_prize_numbers` para que la planilla muestre los premios
--      aparte, sin tocar la función de ventas ya verificada (0091).
--
-- No modifica triggers de validación de referidos ni el flujo de aprobación.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columna de origen
-- ---------------------------------------------------------------------
alter table public.raffle_numbers
  add column if not exists origin text not null default 'venta';

alter table public.raffle_numbers
  drop constraint if exists raffle_numbers_origin_check;

alter table public.raffle_numbers
  add constraint raffle_numbers_origin_check
  check (origin in ('venta', 'premio'));

-- ---------------------------------------------------------------------
-- 2) reward_referral: mismo comportamiento + origen premio
-- ---------------------------------------------------------------------
create or replace function public.reward_referral(
  p_referral_id uuid,
  p_raffle_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_referred uuid;
  v_number int;
  v_enabled boolean;
  v_min int;
  v_max int;
  v_req_propio int;
  v_comprados int;
  v_propios int;
  v_otorgados int;
  v_titulo text;
begin
  -- Bloquea el vínculo: evita premios duplicados.
  select referrer_id, referred_id into v_referrer, v_referred
    from public.referrals
   where id = p_referral_id and rewarded = false
   for update;

  if v_referrer is null then
    return null;
  end if;

  select r.referral_enabled, r.referral_min_numbers, r.referral_max_per_user,
         r.referral_require_buyer_min, r.title
    into v_enabled, v_min, v_max, v_req_propio, v_titulo
    from public.raffles r
   where r.id = p_raffle_id;

  -- El organizador tiene que haber habilitado el beneficio en ese sorteo.
  if not coalesce(v_enabled, false) then
    return null;
  end if;

  -- El invitado tiene que haber comprado el mínimo que pidió el organizador.
  select count(*) into v_comprados
    from public.raffle_numbers
   where raffle_id = p_raffle_id
     and status = 'sold'
     and sold_to = v_referred;

  if v_comprados < greatest(1, coalesce(v_min, 1)) then
    return null;
  end if;

  -- Y el referente, si el organizador lo exige.
  if coalesce(v_req_propio, 0) > 0 then
    select count(*) into v_propios
      from public.raffle_numbers
     where raffle_id = p_raffle_id
       and status = 'sold'
       and sold_to = v_referrer;

    if v_propios < v_req_propio then
      return null;
    end if;
  end if;

  -- Tope por referente en este sorteo (0 = sin tope).
  if coalesce(v_max, 0) > 0 then
    select count(*) into v_otorgados
      from public.referrals
     where referrer_id = v_referrer
       and rewarded
       and rewarded_raffle_id = p_raffle_id;

    if v_otorgados >= v_max then
      return null;
    end if;
  end if;

  select number into v_number
    from public.raffle_numbers
   where raffle_id = p_raffle_id and status = 'available'
   order by random()
   limit 1;

  if v_number is null then
    return null;
  end if;

  -- 0104: el número nace como premio, no como venta.
  update public.raffle_numbers
     set status = 'sold',
         sold_to = v_referrer,
         sold_at = now(),
         reserved_by = null,
         reserved_until = null,
         origin = 'premio'
   where raffle_id = p_raffle_id
     and number = v_number
     and status = 'available';

  update public.referrals
     set rewarded = true,
         rewarded_raffle_id = p_raffle_id,
         rewarded_number = v_number
   where id = p_referral_id;

  -- El referente se entera: campana del jugador.
  perform public.notificar_usuario(
    v_referrer,
    'buyer_referral_reward',
    '🎁 Número gratis',
    format('Tu invitado compró en %s y ganaste el número %s.',
           coalesce(v_titulo, 'el sorteo'), v_number),
    'buyer',
    p_raffle_id,
    v_referred,
    jsonb_build_object('number', v_number)
  );

  return v_number;
end;
$$;

revoke execute on function public.reward_referral(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reward_referral(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3) RPC de premios por comprador (la planilla los muestra aparte)
-- ---------------------------------------------------------------------
create or replace function public.raffle_prize_numbers(p_raffle_id uuid)
returns table (buyer_id uuid, numbers int[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() or not public.owns_raffle(p_raffle_id) then
    raise exception 'No autorizado';
  end if;

  return query
    select n.sold_to, array_agg(n.number order by n.number)
      from public.raffle_numbers n
     where n.raffle_id = p_raffle_id
       and n.origin = 'premio'
       and n.sold_to is not null
     group by n.sold_to;
end;
$$;

revoke all on function public.raffle_prize_numbers(uuid) from public, anon;
grant execute on function public.raffle_prize_numbers(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0104', 'origen del numero: venta o premio, reward_referral marca premio y planilla los separa')
    on conflict (version) do nothing;
  end if;
end;
$$;

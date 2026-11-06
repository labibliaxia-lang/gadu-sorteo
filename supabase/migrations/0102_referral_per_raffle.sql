-- =====================================================================
-- 0102 — "Invitá y ganá": el organizador decide, con mínimos y topes
-- =====================================================================
-- Antes el referido era global: cualquier amigo que compraba un número
-- generaba un número gratis en el mismo sorteo, sin control del organizador.
-- Con prepago manual además nunca se disparaba (solo lo hacía el webhook de
-- Mercado Pago), así que el cartel prometía algo que no pasaba.
--
-- Ahora, por sorteo:
--   · `referral_enabled`            — participa o no (por defecto NO).
--   · `referral_min_numbers`        — números que debe comprar el invitado.
--   · `referral_require_buyer_min`  — números que debe haber comprado el referente.
--   · `referral_max_per_user`       — tope de números gratis por referente (0 = sin tope).
--
-- Al otorgar, se avisa al referente por la campana (0101).
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuración por sorteo
-- ---------------------------------------------------------------------
alter table public.raffles
  add column if not exists referral_enabled boolean not null default false;

alter table public.raffles
  add column if not exists referral_min_numbers integer not null default 1;

alter table public.raffles
  add column if not exists referral_require_buyer_min integer not null default 0;

alter table public.raffles
  add column if not exists referral_max_per_user integer not null default 0;

alter table public.raffles
  drop constraint if exists raffles_referral_checks;

alter table public.raffles
  add constraint raffles_referral_checks check (
    referral_min_numbers between 1 and 1000
    and referral_require_buyer_min between 0 and 1000
    and referral_max_per_user between 0 and 1000
  );

-- ---------------------------------------------------------------------
-- 2) Tipo de notificación del premio
-- ---------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'reservation_pending',
    'payment_approved',
    'reservation_expired',
    'refund_requested',
    'refund_confirmed',
    'winner_unreachable',
    'draw_ready',
    'report_pending',
    'organizer_review',
    'organizer_question',
    'buyer_reservation_approved',
    'buyer_reservation_released',
    'buyer_payment_approved',
    'buyer_won',
    'buyer_referral_reward',
    'super_report',
    'super_kyc'
  ));

-- ---------------------------------------------------------------------
-- 3) Otorgamiento con reglas del organizador
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

  update public.raffle_numbers
     set status = 'sold',
         sold_to = v_referrer,
         sold_at = now(),
         reserved_by = null,
         reserved_until = null
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
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0102', 'invita y gana por sorteo: opt-in del organizador, minimos, tope y aviso al referente')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- 0105 — Sorteo exclusivo para premios de referidos
-- =====================================================================
-- El organizador puede elegir dónde entregar el número gratis:
--   · en el mismo sorteo (comportamiento actual), o
--   · en un "sorteo exclusivo" (bonus_raffle_id), típicamente uno con
--     premios chicos creado para los referidos.
--
-- Cambios:
--   1. `raffles.bonus_raffle_id` (nullable, no puede apuntarse a sí mismo).
--   2. `referrals.rewarded_via_raffle_id`: el sorteo PRINCIPAL que disparó el
--      premio. Sirve para que el tope por referente siga contando por sorteo
--      aunque el número se entregue en otro.
--   3. `reward_referral` elige el sorteo destino, exige que sea del mismo
--      organizador y que esté activo/cerrado, y marca origin = 'premio'.
--
-- No toca el flujo de aprobación manual ni los triggers de referidos.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuración: sorteo destino del premio
-- ---------------------------------------------------------------------
alter table public.raffles
  add column if not exists bonus_raffle_id uuid
    references public.raffles (id) on delete set null;

alter table public.raffles
  drop constraint if exists raffles_bonus_distinto;

alter table public.raffles
  add constraint raffles_bonus_distinto check (
    bonus_raffle_id is null or bonus_raffle_id <> id
  );

-- ---------------------------------------------------------------------
-- 2) Trazabilidad del sorteo que originó el premio
-- ---------------------------------------------------------------------
alter table public.referrals
  add column if not exists rewarded_via_raffle_id uuid
    references public.raffles (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3) Otorgamiento con sorteo destino
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
  v_bonus uuid;
  v_owner uuid;
  v_min int;
  v_max int;
  v_req_propio int;
  v_comprados int;
  v_propios int;
  v_otorgados int;
  v_titulo text;
  v_destino uuid;
  v_destino_titulo text;
begin
  select referrer_id, referred_id into v_referrer, v_referred
    from public.referrals
   where id = p_referral_id and rewarded = false
   for update;

  if v_referrer is null then
    return null;
  end if;

  select r.referral_enabled, r.referral_min_numbers, r.referral_max_per_user,
         r.referral_require_buyer_min, r.title, r.bonus_raffle_id, r.created_by
    into v_enabled, v_min, v_max, v_req_propio, v_titulo, v_bonus, v_owner
    from public.raffles r
   where r.id = p_raffle_id;

  if not coalesce(v_enabled, false) then
    return null;
  end if;

  -- El invitado compró en el sorteo principal: ahí se validan los mínimos.
  select count(*) into v_comprados
    from public.raffle_numbers
   where raffle_id = p_raffle_id
     and status = 'sold'
     and sold_to = v_referred;

  if v_comprados < greatest(1, coalesce(v_min, 1)) then
    return null;
  end if;

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

  -- Tope por referente, contado por el sorteo que originó el premio.
  if coalesce(v_max, 0) > 0 then
    select count(*) into v_otorgados
      from public.referrals
     where referrer_id = v_referrer
       and rewarded
       and coalesce(rewarded_via_raffle_id, rewarded_raffle_id) = p_raffle_id;

    if v_otorgados >= v_max then
      return null;
    end if;
  end if;

  -- Sorteo destino: el bonus si está configurado, si no el principal.
  if v_bonus is not null then
    select r.id, r.title into v_destino, v_destino_titulo
      from public.raffles r
     where r.id = v_bonus
       and r.created_by = v_owner
       and r.status in ('active', 'closed');

    if v_destino is null then
      return null;
    end if;
  else
    v_destino := p_raffle_id;
    v_destino_titulo := v_titulo;
  end if;

  select number into v_number
    from public.raffle_numbers
   where raffle_id = v_destino and status = 'available'
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
         reserved_until = null,
         origin = 'premio'
   where raffle_id = v_destino
     and number = v_number
     and status = 'available';

  update public.referrals
     set rewarded = true,
         rewarded_raffle_id = v_destino,
         rewarded_number = v_number,
         rewarded_via_raffle_id = p_raffle_id
   where id = p_referral_id;

  perform public.notificar_usuario(
    v_referrer,
    'buyer_referral_reward',
    '🎁 Número gratis',
    format('Tu invitado compró en %s y ganaste el número %s en %s.',
           coalesce(v_titulo, 'el sorteo'), v_number,
           coalesce(v_destino_titulo, 'el sorteo')),
    'buyer',
    v_destino,
    v_referred,
    jsonb_build_object('number', v_number, 'raffle_id', v_destino)
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
    values ('0105', 'sorteo exclusivo para premios de referidos con trazabilidad del sorteo origen')
    on conflict (version) do nothing;
  end if;
end;
$$;

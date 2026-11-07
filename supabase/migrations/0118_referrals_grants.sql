-- ============================================================================
-- 0118 — Referidos: captura de vínculos (H1) y sorteo bonus (H2)
-- ============================================================================
-- H1: `ReferralCapture` inserta el vínculo desde el navegador, pero la tabla
--     `public.referrals` no tenía GRANT ni política para `authenticated`
--     (0041 cerró permisos y 0103 no los restauró). El POST devolvía 403
--     `42501 permission denied`, así que ningún usuario real podía generar un
--     referido.
--
-- H2: el sorteo elegido como bonus se quedaba en `paused` y `reward_referral`
--     exige destino `active`/`closed`, por lo que la aprobación nunca premiaba.
--     Además el bonus consumía cupo de sorteos activos del plan.
--
-- Idempotente: se puede volver a aplicar sin efectos secundarios.
-- No toca pagos, números ni sorteo: sólo permisos, la función de cupo y un
-- trigger que activa el bonus al quedar referenciado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) H1 — permisos y política de inserción de vínculos
-- ----------------------------------------------------------------------------
alter table public.referrals enable row level security;

grant insert, select on public.referrals to authenticated;

drop policy if exists "referrals_insert_propio" on public.referrals;
create policy "referrals_insert_propio"
  on public.referrals for insert
  to authenticated
  with check (
    -- Sólo puedo registrarme a mí mismo como invitado…
    referred_id = auth.uid()
    -- …y no puedo auto-referirme.
    and referrer_id <> auth.uid()
    -- El referente tiene que ser un perfil real.
    and exists (select 1 from public.profiles p where p.id = referrer_id)
  );

drop policy if exists "referrals_select_propio" on public.referrals;
create policy "referrals_select_propio"
  on public.referrals for select
  to authenticated
  using (referred_id = auth.uid() or referrer_id = auth.uid());

-- El duplicado exacto (mismo invitado, mismo referente) no debe explotar en la
-- UI: 0103 ya agregó el unique, pero puede faltar en bases viejas.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.referrals'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(referrer_id, referred_id)%'
  ) then
    alter table public.referrals
      add constraint referrals_unique unique (referrer_id, referred_id);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) H2 — el cupo del plan no cuenta los sorteos usados como bonus
-- ----------------------------------------------------------------------------
create or replace function public.enforce_plan_raffle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_plan text;
  v_limit integer;
  v_active integer;
begin
  if new.created_by is null then
    return new;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  -- Si este sorteo ya es el bonus de otro, no consume cupo: es una excepción
  -- explícita del plan, no una publicación nueva.
  if exists (select 1 from public.raffles p where p.bonus_raffle_id = new.id) then
    return new;
  end if;

  select role, plan into v_role, v_plan
  from public.profiles
  where id = new.created_by;

  if v_role = 'superadmin' then
    return new;
  end if;

  v_limit := public.plan_max_active_raffles(v_plan);

  select count(*) into v_active
  from public.raffles r
  where r.created_by = new.created_by
    and r.status = 'active'
    and r.id is distinct from new.id
    -- Los sorteos que otro sorteo usa como bonus no cuentan contra el cupo.
    and not exists (select 1 from public.raffles p where p.bonus_raffle_id = r.id);

  if v_active >= v_limit then
    raise exception
      'Tu plan permite hasta % sorteos activos. Mejorá tu plan para publicar más.',
      v_limit;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) H2 — elegir un sorteo como bonus lo activa (mismo organizador)
-- ----------------------------------------------------------------------------
create or replace function public.activar_sorteo_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bonus_raffle_id is null then
    return new;
  end if;

  -- Sólo se activa un sorteo del mismo organizador y sólo si estaba en borrador.
  update public.raffles
     set status = 'active'
   where id = new.bonus_raffle_id
     and created_by = new.created_by
     and status = 'paused';

  return new;
end;
$$;

drop trigger if exists trg_activar_sorteo_bonus on public.raffles;
create trigger trg_activar_sorteo_bonus
  after update of bonus_raffle_id on public.raffles
  for each row
  when (
    new.bonus_raffle_id is not null
    and new.bonus_raffle_id is distinct from old.bonus_raffle_id
  )
  execute function public.activar_sorteo_bonus();

-- ----------------------------------------------------------------------------
-- Ledger
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0118', 'referidos: grants y política de captura; bonus activo y fuera del cupo')
    on conflict (version) do nothing;
  end if;
end;
$$;

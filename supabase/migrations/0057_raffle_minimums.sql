-- =====================================================================
-- 0057 — Reglas de mínimo de venta y cantidad de premios (idempotente)
-- =====================================================================
-- raffles.min_tickets_required: mínimo de números vendidos para sortear.
-- raffles.if_not_met: qué hacer si no se alcanza (reprogramar / devolver).
-- raffles.winners_count: cantidad de premios (1..30), validada por plan:
--   organizador: hasta 3 · premium: hasta 30 · superadmin: 30.
--
-- El mínimo se controla antes de pasar a `drawn`; el sorteo real sigue
-- eligiendo un ganador hasta que se implemente el motor multi-premio.
-- =====================================================================

alter table public.raffles
  add column if not exists min_tickets_required integer not null default 0
    check (min_tickets_required >= 0),
  add column if not exists if_not_met text not null default 'extend_date'
    check (if_not_met in ('extend_date', 'cancel_and_refund')),
  add column if not exists winners_count integer not null default 1
    check (winners_count between 1 and 30);

create or replace function public.enforce_raffle_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_role text;
  v_max_prizes integer := 3;
begin
  if new.min_tickets_required is null or new.min_tickets_required < 0 then
    raise exception 'El mínimo de tickets no puede ser negativo';
  end if;

  if new.min_tickets_required > 10000 then
    raise exception 'El mínimo de tickets no puede superar 10.000';
  end if;

  if new.winners_count is null or new.winners_count < 1
     or new.winners_count > 30 then
    raise exception 'La cantidad de premios debe estar entre 1 y 30';
  end if;

  if new.created_by is not null then
    select p.plan, p.role into v_plan, v_role
    from public.profiles p
    where p.id = new.created_by;

    if v_role = 'superadmin' then
      v_max_prizes := 30;
    elsif v_plan = 'premium' then
      v_max_prizes := 30;
    else
      v_max_prizes := 3;
    end if;

    if new.winners_count > v_max_prizes then
      raise exception
        'Tu plan permite hasta % premio(s) por sorteo', v_max_prizes;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_raffle_rules on public.raffles;
create trigger enforce_raffle_rules
  before insert or update on public.raffles
  for each row execute procedure public.enforce_raffle_rules();

-- ---------------------------------------------------------------------
-- No se puede sortear si no se alcanzó el mínimo de venta
-- ---------------------------------------------------------------------
create or replace function public.enforce_min_tickets_before_draw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sold integer;
begin
  if new.status = 'drawn'
     and old.status is distinct from 'drawn'
     and new.min_tickets_required > 0 then
    select count(*) into v_sold
    from public.raffle_numbers n
    where n.raffle_id = new.id
      and n.status = 'sold';

    if v_sold < new.min_tickets_required then
      raise exception
        'Mínimo de venta no alcanzado: % de % números vendidos',
        v_sold, new.min_tickets_required;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_min_tickets_before_draw on public.raffles;
create trigger enforce_min_tickets_before_draw
  before update on public.raffles
  for each row execute procedure public.enforce_min_tickets_before_draw();

-- Las reglas no se pueden cambiar después de sortear.
create or replace function public.freeze_raffle_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'drawn' then
    if new.min_tickets_required is distinct from old.min_tickets_required
       or new.if_not_met is distinct from old.if_not_met
       or new.winners_count is distinct from old.winners_count then
      raise exception 'Las reglas del sorteo ya fueron sorteadas y no se pueden cambiar';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_raffle_rules on public.raffles;
create trigger freeze_raffle_rules
  before update on public.raffles
  for each row execute procedure public.freeze_raffle_rules();

insert into public._applied_migrations (version, note)
values ('0057', 'reglas de minimo de venta y premios por plan')
on conflict (version) do nothing;

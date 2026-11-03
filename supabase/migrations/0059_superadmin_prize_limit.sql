-- =====================================================================
-- 0059 — Superadmin puede configurar hasta 30 premios en cualquier sorteo
-- =====================================================================
-- La 0057 validaba el máximo contra el plan del dueño. Si un superadmin
-- editaba el sorteo de otro, quedaba limitado al plan del dueño. Se
-- exceptúa al superadmin, que puede llegar a 30.
-- =====================================================================

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

  if public.is_superadmin() then
    v_max_prizes := 30;
  elsif new.created_by is not null then
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
  end if;

  if new.winners_count > v_max_prizes then
    raise exception
      'Tu plan permite hasta % premio(s) por sorteo', v_max_prizes;
  end if;

  return new;
end;
$$;

insert into public._applied_migrations (version, note)
values ('0059', 'superadmin puede configurar hasta 30 premios')
on conflict (version) do nothing;

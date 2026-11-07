-- =====================================================================
-- 0110 — Plan Free como predeterminado para cuentas nuevas
-- =====================================================================
-- 1. `profiles.plan` pasa a tener default 'free'.
-- 2. `handle_new_user` asigna explícitamente 'free' al crear el perfil.
--
-- NO toca usuarios existentes: el ON CONFLICT no modifica `plan`.
-- No modifica límites, triggers de planes ni al Superadmin.
--
-- Idempotente.
-- =====================================================================

alter table public.profiles
  alter column plan set default 'free';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited boolean := false;
begin
  begin
    select exists (
      select 1 from public.organizer_invitations
      where lower(email) = lower(coalesce(new.email, ''))
        and status = 'pending'
    ) into v_invited;
  exception when others then
    v_invited := false;
  end;

  insert into public.profiles as p
    (id, full_name, phone, role, email, avatar_url, plan)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'email', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when v_invited then 'admin' else 'user' end,
    new.email,
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    'free'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(p.full_name, ''), excluded.full_name),
        avatar_url = coalesce(p.avatar_url, excluded.avatar_url),
        role = case when v_invited then 'admin' else p.role end;

  if v_invited then
    update public.organizer_invitations
    set status = 'accepted', accepted_at = now()
    where lower(email) = lower(coalesce(new.email, ''))
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0110', 'plan free por defecto para cuentas nuevas (sin tocar usuarios existentes)')
    on conflict (version) do nothing;
  end if;
end;
$$;

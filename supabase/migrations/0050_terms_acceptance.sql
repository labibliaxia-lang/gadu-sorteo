-- =====================================================================
-- 0050 — Aceptación de Términos y Privacidad con evidencia (idempotente)
-- =====================================================================
-- Cambios:
--   1) profiles.terms_version (text, default '1.0').
--   2) Se elimina el trigger que auto-aceptaba los términos al crear perfil.
--   3) handle_new_user:
--      - email/password: exige raw_user_meta_data.accepted_terms = true y
--        registra fecha + versión; si falta, aborta el alta.
--      - Google/OAuth: crea el perfil con terms_accepted_at = null; la app
--        muestra un modal obligatorio antes de navegar.
--
-- No toca pagos, reservas, sorteos ni el motor.
-- =====================================================================

alter table public.profiles
  add column if not exists terms_version text not null default '1.0';

update public.profiles
set terms_version = '1.0'
where terms_version is null or btrim(terms_version) = '';

-- El auto-aceptado de 0036 ya no aplica: la evidencia tiene que ser explícita.
drop trigger if exists set_initial_terms_acceptance on public.profiles;
drop function if exists public.set_initial_terms_acceptance();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited boolean := false;
  v_provider text;
  v_accepted boolean;
  v_version text;
begin
  -- Búsqueda de invitación: nunca debe romper el alta.
  begin
    select exists (
      select 1 from public.organizer_invitations
      where lower(email) = lower(coalesce(new.email, ''))
        and status = 'pending'
    ) into v_invited;
  exception when others then
    v_invited := false;
  end;

  v_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_accepted := lower(coalesce(new.raw_user_meta_data ->> 'accepted_terms', 'false'))
    in ('true', 't', '1', 'yes');
  v_version := coalesce(
    nullif(new.raw_user_meta_data ->> 'terms_version', ''),
    '1.0'
  );

  -- Alta por email/contraseña: sin aceptación explícita no hay perfil.
  if v_provider = 'email' and not v_accepted then
    raise exception 'Debes aceptar los Términos y Condiciones para registrarte';
  end if;

  insert into public.profiles as p (
    id, full_name, phone, role, email, avatar_url,
    terms_accepted_at, terms_version
  )
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
    case when v_accepted then now() else null end,
    v_version
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

insert into public._applied_migrations (version, note)
values ('0050', 'aceptacion de terminos con fecha, version y bloqueo en alta')
on conflict (version) do nothing;

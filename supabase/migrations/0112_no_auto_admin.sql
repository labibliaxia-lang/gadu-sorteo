-- =====================================================================
-- 0112 — Nadie es admin automáticamente
-- =====================================================================
-- Antes, una invitación creada por el Superadmin hacía que el usuario
-- entrara como `admin` al registrarse. Eso salteaba la solicitud manual y el
-- KYC.
--
-- Ahora TODO registro entra como role = 'user' y plan = 'free'. Las
-- invitaciones dejan de otorgar rol: quedan como registro histórico y no se
-- consumen solas; el camino es "Quiero ser Organizador" → aprobación manual
-- del Superadmin → KYC.
--
-- No toca usuarios existentes (un UPDATE de perfiles sería otra cosa; esto
-- solo cambia el trigger de alta).
-- Idempotente.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    'user',
    new.email,
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    'free'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(p.full_name, ''), excluded.full_name),
        avatar_url = coalesce(p.avatar_url, excluded.avatar_url);

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
    values ('0112', 'ningun usuario nuevo es admin automaticamente; todos entran user + free')
    on conflict (version) do nothing;
  end if;
end;
$$;

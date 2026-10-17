-- =====================================================================
-- 0002 — Trigger de perfil compatible con Google OAuth (idempotente)
-- =====================================================================
-- Actualiza handle_new_user para extraer el nombre desde Google OAuth,
-- que puede venir en raw_user_meta_data->>'full_name' o ->'name'.
-- Re-ejecutable: usa CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'email', ''),
      ''
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

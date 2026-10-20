-- =====================================================================
-- 0011 — Email y estado de solicitud de rol en profiles (idempotente)
-- =====================================================================

alter table public.profiles
  add column if not exists email text,
  add column if not exists role_request_status text;

-- Backfill de email para perfiles existentes.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- Actualiza el trigger para guardar el email en nuevos usuarios.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'email', ''),
      ''
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'user',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

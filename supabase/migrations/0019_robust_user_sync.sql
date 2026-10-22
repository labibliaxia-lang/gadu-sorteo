-- =====================================================================
-- 0019 — Sincronización robusta auth.users <-> profiles (idempotente)
-- =====================================================================
-- handle_new_user ahora hace UPSERT (on conflict do update) y extrae
-- nombre/email/avatar de Google. Además, un backfill crea el perfil de
-- cualquier auth.user que todavía no tenga fila en public.profiles.
-- =====================================================================

-- 1) Trigger de signup con UPSERT y metadatos de Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles as p (id, full_name, phone, role, email, avatar_url)
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
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
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

-- 2) Backfill: crea el perfil de cualquier auth.user que aún no lo tenga.
insert into public.profiles (id, full_name, phone, role, email, avatar_url)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'email', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    ''
  ),
  nullif(u.raw_user_meta_data ->> 'phone', ''),
  'user',
  u.email,
  nullif(u.raw_user_meta_data ->> 'avatar_url', '')
from auth.users u
on conflict (id) do nothing;

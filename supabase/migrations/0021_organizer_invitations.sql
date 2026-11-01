-- =====================================================================
-- 0021 — Invitaciones / pre-asignación de organizadores (idempotente)
-- =====================================================================
-- El superadmin puede invitar por email a alguien que todavía no tiene
-- cuenta. La invitación queda "pending" y, al registrarse esa persona
-- (login con Google), el trigger on_auth_user_created le asigna el rol
-- 'admin' automáticamente y marca la invitación como aceptada.
-- =====================================================================

create table if not exists public.organizer_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists organizer_invitations_email_key
  on public.organizer_invitations (lower(email));

alter table public.organizer_invitations enable row level security;

drop policy if exists "organizer_invitations_superadmin_all"
  on public.organizer_invitations;
create policy "organizer_invitations_superadmin_all"
  on public.organizer_invitations for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Permisos explícitos: el service_role (Server Actions) necesita acceso
-- total; el authenticated solo lee (RLS restringe a superadmin).
grant all on public.organizer_invitations to service_role;
grant select on public.organizer_invitations to authenticated;

-- Trigger de signup: crea el perfil y aplica invitaciones pendientes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited boolean := false;
begin
  -- La búsqueda de invitación NUNCA debe romper el alta de usuarios:
  -- si la tabla no existe todavía, se sigue como usuario normal.
  begin
    select exists (
      select 1 from public.organizer_invitations
      where lower(email) = lower(coalesce(new.email, ''))
        and status = 'pending'
    ) into v_invited;
  exception when others then
    v_invited := false;
  end;

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
    case when v_invited then 'admin' else 'user' end,
    new.email,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
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

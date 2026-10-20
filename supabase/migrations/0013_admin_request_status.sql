-- =====================================================================
-- 0013 — Estado canónico de solicitud de admin (idempotente)
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'admin_request_status'
  ) then
    alter table public.profiles
      add column admin_request_status text not null default 'none';

    alter table public.profiles
      add constraint profiles_admin_request_status_check
      check (admin_request_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
end;
$$;

-- Backfill único: solo filas que todavía están en 'none'.
update public.profiles
set admin_request_status =
  case
    when role_request_status in ('pending', 'approved', 'rejected')
      then role_request_status
    when role_requested then 'pending'
    else 'none'
  end
where admin_request_status = 'none';

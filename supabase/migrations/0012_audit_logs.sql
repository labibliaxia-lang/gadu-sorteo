-- =====================================================================
-- 0012 — Registro de actividad (auditoría) del superadmin (idempotente)
-- =====================================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id) on delete cascade,
  admin_email text,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- RLS: lectura SOLO para admins. La escritura la hace service_role
-- desde las Server Actions (omite RLS).
-- ---------------------------------------------------------------------
alter table public.admin_audit_logs enable row level security;

drop policy if exists "audit_logs_select_admin" on public.admin_audit_logs;
create policy "audit_logs_select_admin"
  on public.admin_audit_logs for select
  using (public.is_admin());

grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;

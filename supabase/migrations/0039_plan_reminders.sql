-- =====================================================================
-- 0039 — Recordatorios de vencimiento de plan (idempotente)
-- =====================================================================
-- Registra qué recordatorio (7, 3 o 1 día antes) ya se envió a cada usuario
-- para un vencimiento concreto. Evita duplicados si el cron corre más de una
-- vez al día o se reintenta.
--
-- Solo lo escribe el service_role desde el cron. Sin políticas RLS.
-- =====================================================================

create table if not exists public.plan_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  days_before integer not null check (days_before in (7, 3, 1)),
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  unique (user_id, days_before, expires_at)
);

create index if not exists plan_reminder_sends_user_idx
  on public.plan_reminder_sends (user_id, sent_at desc);

alter table public.plan_reminder_sends enable row level security;

revoke all on public.plan_reminder_sends from public, anon, authenticated;
grant all on public.plan_reminder_sends to service_role;

insert into public._applied_migrations (version, note)
values ('0039', 'recordatorios de vencimiento de plan con deduplicacion')
on conflict (version) do nothing;

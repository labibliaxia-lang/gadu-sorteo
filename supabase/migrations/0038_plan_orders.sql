-- =====================================================================
-- 0038 — Pagos manuales de plan (idempotente)
-- =====================================================================
-- Permite que el superadmin registre un pago por transferencia/efectivo y
-- extienda la vigencia del plan del usuario. Es el historial que faltaba:
-- hasta ahora el pago vivía sólo en WhatsApp.
--
-- No toca pagos de sorteos ni Mercado Pago.
-- =====================================================================

create table if not exists public.plan_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('organizador', 'premium')),
  amount_ars numeric(12, 2) not null default 0 check (amount_ars >= 0),
  days integer not null check (days > 0 and days <= 365),
  method text not null default 'transferencia'
    check (method in ('transferencia', 'efectivo', 'otro')),
  note text,
  status text not null default 'paid'
    check (status in ('paid', 'refunded', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz
);

create index if not exists plan_orders_user_created_idx
  on public.plan_orders (user_id, created_at desc);

alter table public.plan_orders enable row level security;

-- El superadmin ve todos los registros.
drop policy if exists plan_orders_superadmin_select on public.plan_orders;
create policy plan_orders_superadmin_select
  on public.plan_orders for select
  to authenticated
  using (public.is_superadmin());

-- Cada usuario ve sus propios pagos de plan.
drop policy if exists plan_orders_own_select on public.plan_orders;
create policy plan_orders_own_select
  on public.plan_orders for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.plan_orders from public, anon, authenticated;
grant select on public.plan_orders to authenticated;
grant all on public.plan_orders to service_role;

insert into public._applied_migrations (version, note)
values ('0038', 'pagos manuales de plan y extension de vigencia')
on conflict (version) do nothing;

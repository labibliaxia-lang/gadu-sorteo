-- =====================================================================
-- 0026 — Tracking de visitas a sorteos para analíticas (idempotente)
-- =====================================================================
-- Registra una visita por render de la página pública del sorteo.
-- No guarda datos personales: solo raffle_id + created_at.
-- Necesario para la métrica "conversión visitas → pago" del panel admin.
-- =====================================================================

create table if not exists public.raffle_visits (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists raffle_visits_raffle_created_idx
  on public.raffle_visits (raffle_id, created_at desc);

alter table public.raffle_visits enable row level security;

-- Cualquiera (incluido anónimo) puede registrar una visita.
drop policy if exists "raffle_visits_insert_public" on public.raffle_visits;
create policy "raffle_visits_insert_public"
  on public.raffle_visits for insert
  to anon, authenticated
  with check (true);

-- Solo el dueño del sorteo (o superadmin) puede leer sus visitas.
drop policy if exists "raffle_visits_select_owner" on public.raffle_visits;
create policy "raffle_visits_select_owner"
  on public.raffle_visits for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.raffles r
      where r.id = raffle_visits.raffle_id
        and r.created_by = auth.uid()
    )
  );

grant insert on public.raffle_visits to anon, authenticated;
grant select on public.raffle_visits to authenticated;
grant all on public.raffle_visits to service_role;

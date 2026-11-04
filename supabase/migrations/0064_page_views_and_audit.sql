-- =====================================================================
-- 0064 — Tráfico histórico (page_views) y auditoría del panel (idempotente)
-- =====================================================================
-- 1) page_views: una fila por visita registrada a la Home o a la página de un
--    sorteo. Guarda fecha (día de Argentina), ruta y usuario autenticado (si
--    lo hay). No guarda IP, user-agent ni ningún dato que identifique al
--    visitante anónimo: el objetivo es una serie diaria, no perfilar gente.
--
--    La escritura la hace SOLO el service role desde `/api/track-visit`.
--    A diferencia de `raffle_visits` (0026/0027), acá NO hay policy de INSERT
--    para anon/authenticated: aunque alguien llame a PostgREST directamente,
--    no puede inflar el contador. La API valida la ruta y aplica rate limit.
--
-- 2) La RPC `superadmin_daily_metrics` entrega la serie diaria del dashboard
--    (visitas, usuarios únicos, altas e ingresos estimados). Está limitada a
--    superadmin (guarda explícita) y a una ventana máxima de 365 días.
--
-- 3) `raffle_reports`: denuncias de sorteos. Una por usuario y sorteo (lo
--    impone el UNIQUE), solo sobre sorteos activos y ajenos (RLS). La
--    moderación es solo superadmin y queda auditada.
--
-- 4) Auditoría: NO se crea una tabla nueva. El panel ya escribe en
--    `public.admin_audit_logs` desde 0012 (admin_id, action, target_user_id,
--    created_at, ...) y todas las acciones existentes auditan ahí. Crear una
--    segunda tabla partiría el rastro de auditoría en dos, que es justo lo
--    que un log de auditoría no puede permitir. Esta migración refuerza la
--    existente (índice por acción + permisos de solo lectura para el panel) y
--    expone la vista `audit_logs` con el nombre del brief.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla de visitas
-- ---------------------------------------------------------------------
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  -- Día en hora de Argentina (UTC-3): el corte diario no depende de la zona
  -- del servidor (Vercel corre en UTC).
  date date not null default (
    (now() at time zone 'America/Argentina/Buenos_Aires')::date
  ),
  path text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Solo se aceptan rutas conocidas: la Home y la página pública de un sorteo.
-- Validado también en la API (`normalizeTrackedPath`), acá queda como última
-- barrera contra escrituras arbitrarias.
alter table public.page_views
  drop constraint if exists page_views_path_check;
alter table public.page_views
  add constraint page_views_path_check
  check (
    path = '/'
    or path ~ '^/sorteos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create index if not exists page_views_date_idx
  on public.page_views (date desc);

create index if not exists page_views_path_date_idx
  on public.page_views (path, date desc);

alter table public.page_views enable row level security;

-- Sin policy de INSERT: clientes anon/authenticated no pueden escribir.
-- La API escribe con service role, que omite RLS.
drop policy if exists "page_views_select_superadmin" on public.page_views;
create policy "page_views_select_superadmin"
  on public.page_views for select
  to authenticated
  using (public.is_superadmin());

revoke all on public.page_views from public, anon, authenticated;
grant select on public.page_views to authenticated;
grant all on public.page_views to service_role;

-- ---------------------------------------------------------------------
-- 2) Serie diaria completa del dashboard (tráfico + altas + ingresos)
-- ---------------------------------------------------------------------
-- Una sola RPC para el gráfico del panel: visitas, usuarios únicos, altas de
-- perfil e ingresos estimados de números vendidos, siempre por día de
-- Argentina. `security definer` + guarda explícita: la agregación cruza las
-- tablas de todo el sistema, así que corre como dueño pero solo la puede
-- invocar un superadmin.
create or replace function public.superadmin_daily_metrics(p_days integer default 30)
returns table (
  day date,
  views bigint,
  visitors bigint,
  new_users bigint,
  revenue numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_days integer;
  v_today date;
  v_start date;
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_today := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_start := v_today - (v_days - 1);

  return query
    with days as (
      select gs::date as day
      from generate_series(
        v_start::timestamp,
        v_today::timestamp,
        interval '1 day'
      ) as gs
    ),
    traffic as (
      select
        pv.date as day,
        count(*)::bigint as views_count,
        count(distinct pv.user_id)::bigint as visitors_count
      from public.page_views pv
      where pv.date >= v_start
      group by pv.date
    ),
    signups as (
      select
        (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
        count(*)::bigint as new_users_count
      from public.profiles p
      where (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_start
      group by 1
    ),
    sales as (
      -- Ingreso estimado = números vendidos × precio del sorteo. Es la misma
      -- definición que usa el panel (prepago manual + Mercado Pago), no una
      -- segunda contabilidad: no toca pagos ni webhooks.
      select
        (n.sold_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
        sum(coalesce(r.price_per_number, 0))::numeric as revenue_total
      from public.raffle_numbers n
      join public.raffles r on r.id = n.raffle_id
      where n.status = 'sold'
        and n.sold_at is not null
        and (n.sold_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_start
      group by 1
    )
    select
      d.day,
      coalesce(t.views_count, 0)::bigint,
      coalesce(t.visitors_count, 0)::bigint,
      coalesce(s.new_users_count, 0)::bigint,
      coalesce(rev.revenue_total, 0)::numeric
    from days d
    left join traffic t on t.day = d.day
    left join signups s on s.day = d.day
    left join sales rev on rev.day = d.day
    order by d.day asc;
end;
$$;

revoke all on function public.superadmin_daily_metrics(integer)
  from public, anon, authenticated;
grant execute on function public.superadmin_daily_metrics(integer) to authenticated;
grant execute on function public.superadmin_daily_metrics(integer) to service_role;

-- ---------------------------------------------------------------------
-- 3) Denuncias de sorteos (raffle_reports)
-- ---------------------------------------------------------------------
-- Un usuario autenticado puede denunciar un sorteo activo que no es suyo.
-- Una denuncia por usuario y sorteo: lo garantiza el UNIQUE, no solo la API
-- (así no hay carrera entre dos pestañas ni reintentos).
--
-- La escritura la hace el propio usuario con su cliente (RLS: reporter_id =
-- auth.uid()). La moderación (resolver, descartar, pausar, borrar) la hace
-- el superadmin con service role y queda auditada en admin_audit_logs.
create table if not exists public.raffle_reports (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (
    reason in ('fraude', 'premio_falso', 'contenido_inapropiado', 'spam', 'otro')
  ),
  comment text check (comment is null or char_length(comment) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  constraint raffle_reports_unique_reporter unique (raffle_id, reporter_id)
);

create index if not exists raffle_reports_status_created_idx
  on public.raffle_reports (status, created_at asc);

create index if not exists raffle_reports_raffle_idx
  on public.raffle_reports (raffle_id);

alter table public.raffle_reports enable row level security;

-- Alta: solo el propio usuario, solo sobre un sorteo activo y ajeno.
drop policy if exists "raffle_reports_insert_own" on public.raffle_reports;
create policy "raffle_reports_insert_own"
  on public.raffle_reports for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    -- El denunciante no elige estado ni fechas: una denuncia nueva siempre
    -- nace `pending` y con el timestamp del servidor. Sin esto, un cliente
    -- podía insertar status='resolved' y auto-ocultar su denuncia de la cola.
    and status = 'pending'
    and resolved_at is null
    and resolved_by is null
    and created_at = now()
    and exists (
      select 1
      from public.raffles r
      where r.id = raffle_reports.raffle_id
        and r.status = 'active'
        and r.created_by is distinct from auth.uid()
    )
  );

-- Lectura: solo superadmin. El resto del panel usa service role.
drop policy if exists "raffle_reports_select_superadmin" on public.raffle_reports;
create policy "raffle_reports_select_superadmin"
  on public.raffle_reports for select
  to authenticated
  using (public.is_superadmin());

revoke all on public.raffle_reports from public, anon, authenticated;
grant insert, select on public.raffle_reports to authenticated;
grant all on public.raffle_reports to service_role;

-- ---------------------------------------------------------------------
-- 4) Auditoría: reforzar `admin_audit_logs` (no duplicar)
-- ---------------------------------------------------------------------
create index if not exists admin_audit_logs_action_created_idx
  on public.admin_audit_logs (action, created_at desc);

comment on table public.admin_audit_logs is
  'Registro de auditoría del panel (audit_logs): quién (admin_id) hizo qué (action) sobre quién (target_user_id) y cuándo (created_at). Es la única fuente de auditoría; no crear una tabla paralela. Escribe service_role desde Server Actions; lectura restringida por la policy audit_logs_select_superadmin (0025).';

-- El cliente no puede escribir ni alterar la auditoría (solo leerla).
revoke insert, update, delete on public.admin_audit_logs
  from public, anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;

-- Alias de lectura con el nombre `audit_logs` que pide el brief del panel.
-- NO es una segunda tabla: es una vista sobre `admin_audit_logs`, la única
-- fuente de verdad (la escriben las Server Actions con service role). Si se
-- creara otra tabla, cada acción tendría que escribir en dos lados y el rastro
-- de auditoría se podría partir en dos. La columna pedida `timestamp` es
-- `created_at` con ese alias, para que la consulta se lea como pide el brief.
create or replace view public.audit_logs as
  select
    id,
    admin_id,
    admin_email,
    action,
    target_user_id,
    target_email,
    details,
    created_at as "timestamp"
  from public.admin_audit_logs;

comment on view public.audit_logs is
  'Alias de lectura de admin_audit_logs (audit_logs del brief). Una sola tabla de auditoría: no crear una paralela.';

-- Solo el service role (el panel) la lee: la vista corre con los permisos del
-- dueño, así que no se expone a anon/authenticated.
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to service_role;

insert into public._applied_migrations (version, note)
values ('0064', 'page_views de trafico + rpc page_views_daily + refuerzo de admin_audit_logs')
on conflict (version) do nothing;

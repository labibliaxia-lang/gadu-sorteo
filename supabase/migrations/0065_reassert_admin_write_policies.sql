-- =====================================================================
-- 0065 — Reparación: escritura del panel sobre raffles (idempotente)
-- =====================================================================
-- Síntoma que repara: al crear un sorteo desde /admin/sorteos/nuevo la base
-- responde:
--
--   new row violates row-level security policy for table "raffles"
--
-- Causa: en este proyecto las migraciones se aplican A MANO en el SQL Editor
-- (no hay `supabase db push`). Una migración a medias deja en la base una
-- función o una política distinta de la que declara el repositorio. Ya pasó
-- con 0025 (la función existía y el trigger no).
--
-- Consecuencia: una cuenta admin/superadmin pasa el portón del panel (que lee
-- `profiles.role` por RLS) pero la política de INSERT de `raffles` no la
-- reconoce, y el alta se rechaza con 42501.
--
-- Qué hace: vuelve a dejar la base como la declaran 0014, 0030 y 0041 para las
-- cuatro tablas de escritura del panel. No borra datos y se puede correr
-- varias veces.
--
-- Cómo aplicarla: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Verificación: correr supabase/tests/diagnostico_crear_sorteo.sql y buscar
-- los OK; después crear un sorteo de prueba desde el panel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funciones de rol (0014 + 0030)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.owns_raffle(p_raffle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.raffles r
    where r.id = p_raffle_id
      and (r.created_by = auth.uid() or public.is_superadmin())
  );
$$;

revoke execute on function public.owns_raffle(uuid) from public, anon;
grant execute on function public.owns_raffle(uuid) to authenticated;
grant execute on function public.owns_raffle(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2) RLS activo en las tablas del panel
-- ---------------------------------------------------------------------
alter table public.raffles enable row level security;
alter table public.raffle_numbers enable row level security;
alter table public.prizes enable row level security;
alter table public.payments enable row level security;

-- ---------------------------------------------------------------------
-- 3) Grants de tabla (0001 + 0041)
-- ---------------------------------------------------------------------
grant select on public.raffles to anon, authenticated;
grant insert, update, delete on public.raffles to authenticated;
grant select on public.raffle_numbers to anon, authenticated;
grant insert on public.raffle_numbers to authenticated;
revoke update, delete on public.raffle_numbers from authenticated;
grant select on public.prizes to anon, authenticated;
grant insert, update, delete on public.prizes to authenticated;
grant select, insert on public.payments to authenticated;

-- ---------------------------------------------------------------------
-- 4) Políticas: borrar TODAS y recrear las de 0041
-- ---------------------------------------------------------------------
-- El borrado es a propósito: una política vieja permisiva se suma con OR y
-- anula la regla nueva (fue el hallazgo de 0041).
do $$
declare
  r record;
  t text;
begin
  foreach t in array array['raffles', 'raffle_numbers', 'prizes', 'payments']
  loop
    for r in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end;
$$;

-- Raffles: lectura pública; escritura solo del dueño admin o del superadmin.
create policy "raffles_select_public"
  on public.raffles for select
  using (true);

create policy "raffles_insert_owner"
  on public.raffles for insert
  with check (public.is_admin() and created_by = auth.uid());

create policy "raffles_update_owner"
  on public.raffles for update
  using (
    public.is_superadmin()
    or (public.is_admin() and created_by = auth.uid())
  )
  with check (
    public.is_superadmin()
    or (public.is_admin() and created_by = auth.uid())
  );

create policy "raffles_delete_owner"
  on public.raffles for delete
  using (
    public.is_superadmin()
    or (public.is_admin() and created_by = auth.uid())
  );

-- Números: lectura pública; INSERT directo solo en sorteos propios. Sin
-- UPDATE/DELETE de cliente: las transiciones van por RPC SECURITY DEFINER.
create policy "raffle_numbers_select_public"
  on public.raffle_numbers for select
  using (true);

create policy "raffle_numbers_insert_owner"
  on public.raffle_numbers for insert
  with check (public.is_admin() and public.owns_raffle(raffle_id));

-- Premios: lectura pública; escritura del dueño del sorteo.
create policy "prizes_select_public"
  on public.prizes for select
  using (true);

create policy "prizes_insert_owner"
  on public.prizes for insert
  with check (public.is_admin() and public.owns_raffle(raffle_id));

create policy "prizes_update_owner"
  on public.prizes for update
  using (public.is_admin() and public.owns_raffle(raffle_id))
  with check (public.is_admin() and public.owns_raffle(raffle_id));

create policy "prizes_delete_owner"
  on public.prizes for delete
  using (public.is_admin() and public.owns_raffle(raffle_id));

-- Pagos: cada uno ve los suyos; el organizador ve los de sus sorteos.
create policy "payments_select_own_or_owner"
  on public.payments for select
  using (auth.uid() = user_id or public.owns_raffle(raffle_id));

create policy "payments_insert_own_pending"
  on public.payments for insert
  with check (auth.uid() = user_id and status = 'pending');

-- ---------------------------------------------------------------------
-- 5) Ledger
-- ---------------------------------------------------------------------
-- Si el proyecto no tiene el ledger (0028 sin aplicar), la reparación igual
-- vale: se aplica y sólo se omite la fila de registro.
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0065', 'reparacion de politicas y funciones de escritura del panel')
    on conflict (version) do nothing;
  end if;
end;
$$;

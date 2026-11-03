-- =====================================================================
-- 0041 — Cierre de RLS de sorteos, números, premios y pagos (idempotente)
-- =====================================================================
-- Hallazgo de la prueba de aislamiento: una segunda cuenta pudo editar el
-- sorteo de otra. Las políticas de `raffles` no estaban aplicando la regla de
-- dueño (quedó una política permisiva de versiones anteriores).
--
-- Esta migración NO parchea: borra TODAS las políticas de las cuatro tablas y
-- las vuelve a crear con una regla única y explícita. También garantiza que
-- RLS esté habilitado.
--
-- No toca pagos de sorteos ni el motor: los RPC siguen siendo SECURITY DEFINER.
-- =====================================================================

alter table public.raffles enable row level security;
alter table public.raffle_numbers enable row level security;
alter table public.prizes enable row level security;
alter table public.payments enable row level security;

-- Borra cualquier política previa (incluidas las permisivas viejas) para que
-- no queden reglas superpuestas que se sumen con OR.
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

-- ---------------------------------------------------------------------
-- Raffles: lectura pública; escritura solo del dueño o superadmin.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Números: lectura pública; el INSERT directo queda en sorteos propios.
-- Sin UPDATE/DELETE: las transiciones van por RPC SECURITY DEFINER.
-- ---------------------------------------------------------------------
create policy "raffle_numbers_select_public"
  on public.raffle_numbers for select
  using (true);

create policy "raffle_numbers_insert_owner"
  on public.raffle_numbers for insert
  with check (public.is_admin() and public.owns_raffle(raffle_id));

revoke update, delete on public.raffle_numbers from authenticated;

-- ---------------------------------------------------------------------
-- Premios: lectura pública; escritura del dueño del sorteo.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Pagos: cada uno ve los suyos; el organizador ve los de sus sorteos.
-- ---------------------------------------------------------------------
create policy "payments_select_own_or_owner"
  on public.payments for select
  using (auth.uid() = user_id or public.owns_raffle(raffle_id));

create policy "payments_insert_own_pending"
  on public.payments for insert
  with check (auth.uid() = user_id and status = 'pending');

insert into public._applied_migrations (version, note)
values ('0041', 'cierre de RLS en raffles, numeros, premios y pagos')
on conflict (version) do nothing;

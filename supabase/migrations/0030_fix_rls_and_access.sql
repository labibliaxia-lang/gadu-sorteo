-- =====================================================================
-- 0030 — Blindaje de acceso y aislamiento de datos (idempotente)
-- =====================================================================
-- Cierra los P0 de la auditoría sin borrar datos:
--
-- 1) public.owns_raffle(uuid): true si el sorteo es del usuario actual (o si
--    es superadmin). Base de todas las políticas nuevas.
-- 2) prizes y raffle_numbers: escritura solo con dueño del sorteo. Un
--    organizador ya no puede tocar premios ni inventar números ajenos.
--    Ojo: raffle_numbers conserva la regla de 0001 de no permitir UPDATE ni
--    DELETE desde el cliente; las transiciones siguen por RPC.
-- 3) payments: lectura acotada a los pagos propios o a los pagos de los
--    sorteos del organizador. El superadmin ve todo vía owns_raffle.
-- 4) profiles: se quita el SELECT público (anon) y la política que exponía
--    filas completas de organizadores. En su lugar queda la vista
--    public_organizers con solo id, full_name, avatar_url e is_verified.
--
-- Lo que NO toca: políticas de raffles (ya correctas), RPCs de negocio,
-- datos existentes. Todas las sentencias son repetibles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper de pertenencia
-- ---------------------------------------------------------------------
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
-- 2) Premios: escritura solo sobre sorteos propios
-- ---------------------------------------------------------------------
drop policy if exists "prizes_insert_admin" on public.prizes;
create policy "prizes_insert_admin"
  on public.prizes for insert
  with check (public.is_admin() and public.owns_raffle(raffle_id));

drop policy if exists "prizes_update_admin" on public.prizes;
create policy "prizes_update_admin"
  on public.prizes for update
  using (public.is_admin() and public.owns_raffle(raffle_id))
  with check (public.is_admin() and public.owns_raffle(raffle_id));

drop policy if exists "prizes_delete_admin" on public.prizes;
create policy "prizes_delete_admin"
  on public.prizes for delete
  using (public.is_admin() and public.owns_raffle(raffle_id));

-- ---------------------------------------------------------------------
-- 3) Números: el INSERT directo queda acotado al propio sorteo
-- ---------------------------------------------------------------------
-- Se mantiene a propósito sin políticas de UPDATE/DELETE: el estado de los
-- números se cambia solo por RPC (reserve/sell/release/organizer_*), nunca
-- por PostgREST. El tope de plan lo sigue aplicando create_raffle_numbers.
drop policy if exists "raffle_numbers_insert_admin" on public.raffle_numbers;
create policy "raffle_numbers_insert_admin"
  on public.raffle_numbers for insert
  with check (public.is_admin() and public.owns_raffle(raffle_id));

-- ---------------------------------------------------------------------
-- 4) Pagos: cada organizador ve los suyos y los de sus sorteos
-- ---------------------------------------------------------------------
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_owner"
  on public.payments for select
  using (auth.uid() = user_id or public.owns_raffle(raffle_id));

-- ---------------------------------------------------------------------
-- 5) Sorteo: solo el dueño (o el superadmin) puede sortear su sorteo
-- ---------------------------------------------------------------------
-- La política de UPDATE de raffles ya estaba bien y no se toca; lo que
-- faltaba era la función, que solo miraba `is_admin()` y permitía sortear
-- el sorteo de otro organizador.
create or replace function public.draw_winner(p_raffle_id uuid)
returns table (winning_number int, winner_user uuid, winner_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number int;
  v_user uuid;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if not public.is_superadmin() and not exists (
    select 1 from public.raffles r
    where r.id = p_raffle_id and r.created_by = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status in ('active', 'closed')
  ) then
    raise exception 'El sorteo no se puede sortear (estado inválido)';
  end if;

  select n.number, n.sold_to
  into v_number, v_user
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id and n.status = 'sold'
  order by random()
  limit 1;

  if v_number is null then
    raise exception 'No hay números vendidos para sortear';
  end if;

  select full_name into v_name
  from public.profiles
  where id = v_user;

  update public.raffles
  set status = 'drawn',
      winner_number = v_number,
      winner_user_id = v_user,
      winner_name = v_name,
      drawn_at = now()
  where id = p_raffle_id;

  return query select v_number, v_user, v_name;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Perfiles: fuera la lectura pública; vista mínima para compradores
-- ---------------------------------------------------------------------
-- La vista se crea antes de revocar para que la página pública siga
-- funcionando. Corre con los privilegios de su dueño (el rol de las
-- migraciones), así que puede leer profiles aunque anon ya no tenga SELECT;
-- expone únicamente columnas seguras de organizadores.
drop view if exists public.public_organizers;
create view public.public_organizers as
  select
    id,
    full_name,
    avatar_url,
    is_verified
  from public.profiles
  where role = 'admin';

revoke all on public.public_organizers from public, anon, authenticated;
grant select on public.public_organizers to anon, authenticated;
grant select on public.public_organizers to service_role;

revoke select on public.profiles from anon;
drop policy if exists "profiles_select_public_admin" on public.profiles;

-- Además del anon, se acota la lectura de un organizador: ve su propia fila,
-- la de los compradores de SUS sorteos (reservas y ventas, que es lo que
-- necesita el panel de prepago) y nada más. El superadmin conserva todo.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_select_superadmin" on public.profiles;
create policy "profiles_select_superadmin"
  on public.profiles for select
  using (public.is_superadmin());

drop policy if exists "profiles_select_own_raffle_buyers" on public.profiles;
create policy "profiles_select_own_raffle_buyers"
  on public.profiles for select
  using (
    public.is_admin()
    and exists (
      select 1
      from public.raffle_numbers n
      join public.raffles r on r.id = n.raffle_id
      where r.created_by = auth.uid()
        and (n.reserved_by = profiles.id or n.sold_to = profiles.id)
    )
  );

-- ---------------------------------------------------------------------
-- 7) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0030', 'blindaje P0: owns_raffle, RLS con dueño, PII y vista pública')
on conflict (version) do nothing;

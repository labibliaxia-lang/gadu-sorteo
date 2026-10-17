-- =====================================================================
-- Sorteo de Herramientas — Migración inicial
-- Tablas, RLS, funciones RPC, trigger de perfiles y bucket de Storage.
-- Re-ejecutable (idempotente): seguro correrla más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Perfil extendido de auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Sorteos / rifas
create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  draw_date timestamptz not null,
  price_per_number numeric(12, 2) not null check (price_per_number >= 0),
  cover_image_url text,
  status text not null default 'active' check (status in ('active', 'closed', 'drawn')),
  winner_number int,
  winner_user_id uuid references auth.users (id) on delete set null,
  winner_name text,
  drawn_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pagos (se crean en "pending" al iniciar el checkout)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  numbers int[] not null default '{}',
  amount numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  mp_preference_id text,
  mp_payment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Números del sorteo (1..10000)
create table if not exists public.raffle_numbers (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  number int not null check (number between 1 and 10000),
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  reserved_by uuid references auth.users (id) on delete set null,
  reserved_until timestamptz,
  sold_to uuid references auth.users (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  constraint raffle_numbers_raffle_number_unique unique (raffle_id, number)
);

-- Premios (máx. 10 por sorteo, posiciones 1..10)
create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  position int not null check (position between 1 and 10),
  title text not null,
  description text,
  image_url text,
  tool_number int,
  created_at timestamptz not null default now(),
  constraint prizes_raffle_position_unique unique (raffle_id, position)
);

-- ---------------------------------------------------------------------
-- 2. ÍNDICES
-- ---------------------------------------------------------------------
create index if not exists raffle_numbers_raffle_status_idx
  on public.raffle_numbers (raffle_id, status);
create index if not exists raffle_numbers_reserved_until_idx
  on public.raffle_numbers (reserved_until) where status = 'reserved';
create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists payments_raffle_idx on public.payments (raffle_id);
create index if not exists prizes_raffle_idx on public.prizes (raffle_id);

-- ---------------------------------------------------------------------
-- 2.5. GRANTS DE TABLA (mínimo privilegio)
-- ---------------------------------------------------------------------
-- Lectura pública (home, sorteo público y grid).
grant select on public.raffles to anon, authenticated;
grant select on public.raffle_numbers to anon, authenticated;
grant select on public.prizes to anon, authenticated;

-- Escritura de clientes autenticados (RLS restringe a admin/dueño).
grant insert, update, delete on public.raffles to authenticated;
grant insert, update, delete on public.prizes to authenticated;
grant insert on public.raffle_numbers to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.payments to authenticated;

-- Service role: acceso completo (SOLO servidor).
grant all on public.profiles, public.raffles, public.raffle_numbers,
  public.prizes, public.payments to service_role;

-- ---------------------------------------------------------------------
-- 3. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------

-- Mantiene updated_at al día
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists raffles_set_updated_at on public.raffles;
create trigger raffles_set_updated_at
  before update on public.raffles
  for each row execute procedure public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute procedure public.set_updated_at();

-- Crea automáticamente el perfil al registrarse un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Devuelve true si el usuario autenticado actual es admin.
-- SECURITY DEFINER evita recursión de RLS sobre profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 4. RPCs DE NEGOCIO
-- ---------------------------------------------------------------------

-- Genera los 10.000 números de un sorteo. Idempotente.
create or replace function public.create_raffle_numbers(p_raffle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  insert into public.raffle_numbers (raffle_id, number)
  select p_raffle_id, gs
  from generate_series(1, 10000) as gs
  on conflict (raffle_id, number) do nothing;
end;
$$;

-- Reserva números disponibles para el usuario autenticado (10 minutos).
-- Devuelve el array de números que efectivamente quedaron reservados.
create or replace function public.reserve_numbers(
  p_raffle_id uuid,
  p_numbers int[]
)
returns int[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reserved int[];
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'active'
  ) then
    raise exception 'El sorteo no está disponible';
  end if;

  update public.raffle_numbers
  set status = 'reserved',
      reserved_by = v_uid,
      reserved_until = now() + interval '10 minutes'
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'available';

  select coalesce(array_agg(number), array[]::int[])
  into v_reserved
  from public.raffle_numbers
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by = v_uid;

  return v_reserved;
end;
$$;

-- Marca como vendidos números que el usuario tenía reservados.
-- SOLO debe ejecutarse desde el servidor (service role).
create or replace function public.sell_numbers(
  p_raffle_id uuid,
  p_user_id uuid,
  p_numbers int[],
  p_payment_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.raffle_numbers
  set status = 'sold',
      sold_to = p_user_id,
      payment_id = p_payment_id,
      sold_at = now(),
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by = p_user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Libera números reservados específicos (p. ej. pago rechazado/vencido).
create or replace function public.release_numbers(
  p_raffle_id uuid,
  p_numbers int[],
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.raffle_numbers
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where raffle_id = p_raffle_id
    and number = any (p_numbers)
    and status = 'reserved'
    and reserved_by = p_user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Libera TODAS las reservas vencidas (lo invoca el cron).
create or replace function public.release_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.raffle_numbers
  set status = 'available',
      reserved_by = null,
      reserved_until = null
  where status = 'reserved'
    and reserved_until < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Sortea un ganador aleatorio entre los números vendidos y cierra el sorteo.
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
-- 5. PERMISOS DE EJECUCIÓN (principio de mínimo privilegio)
-- ---------------------------------------------------------------------

-- Usuarios autenticados pueden reservar y sortear (draw_winner valida admin).
revoke execute on function public.reserve_numbers(uuid, int[]) from public, anon;
grant execute on function public.reserve_numbers(uuid, int[]) to authenticated;

revoke execute on function public.create_raffle_numbers(uuid) from public, anon;
grant execute on function public.create_raffle_numbers(uuid) to authenticated;

revoke execute on function public.draw_winner(uuid) from public, anon;
grant execute on function public.draw_winner(uuid) to authenticated;

-- Vender / liberar / liberar vencidas SOLO con service role (servidor).
revoke execute on function public.sell_numbers(uuid, uuid, int[], uuid) from public, anon;
grant execute on function public.sell_numbers(uuid, uuid, int[], uuid) to service_role;

revoke execute on function public.release_numbers(uuid, int[], uuid) from public, anon;
grant execute on function public.release_numbers(uuid, int[], uuid) to service_role;

revoke execute on function public.release_expired_reservations() from public, anon;
grant execute on function public.release_expired_reservations() to service_role;

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.raffles enable row level security;
alter table public.raffle_numbers enable row level security;
alter table public.prizes enable row level security;
alter table public.payments enable row level security;

-- profiles: cada usuario ve/edita el suyo; admins ven todos.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- raffles: lectura pública; escritura solo admin.
drop policy if exists "raffles_select_public" on public.raffles;
create policy "raffles_select_public"
  on public.raffles for select
  using (true);

drop policy if exists "raffles_insert_admin" on public.raffles;
create policy "raffles_insert_admin"
  on public.raffles for insert
  with check (public.is_admin());

drop policy if exists "raffles_update_admin" on public.raffles;
create policy "raffles_update_admin"
  on public.raffles for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "raffles_delete_admin" on public.raffles;
create policy "raffles_delete_admin"
  on public.raffles for delete
  using (public.is_admin());

-- raffle_numbers: lectura pública para pintar el grid.
-- Sin política de UPDATE/DELETE => el cliente nunca puede modificar el estado.
-- Las transiciones de estado ocurren vía RPCs SECURITY DEFINER / service role.
drop policy if exists "raffle_numbers_select_public" on public.raffle_numbers;
create policy "raffle_numbers_select_public"
  on public.raffle_numbers for select
  using (true);

drop policy if exists "raffle_numbers_insert_admin" on public.raffle_numbers;
create policy "raffle_numbers_insert_admin"
  on public.raffle_numbers for insert
  with check (public.is_admin());

-- prizes: lectura pública; escritura solo admin.
drop policy if exists "prizes_select_public" on public.prizes;
create policy "prizes_select_public"
  on public.prizes for select
  using (true);

drop policy if exists "prizes_insert_admin" on public.prizes;
create policy "prizes_insert_admin"
  on public.prizes for insert
  with check (public.is_admin());

drop policy if exists "prizes_update_admin" on public.prizes;
create policy "prizes_update_admin"
  on public.prizes for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "prizes_delete_admin" on public.prizes;
create policy "prizes_delete_admin"
  on public.prizes for delete
  using (public.is_admin());

-- payments: cada usuario ve los suyos; admins ven todos.
-- Insert permitido al propietario SOLO en estado "pending" (evita que el
-- cliente se auto-marque como "approved"). El pago se aprueba desde el
-- webhook con service role.
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin"
  on public.payments for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "payments_insert_own_pending" on public.payments;
create policy "payments_insert_own_pending"
  on public.payments for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Sin UPDATE/DELETE para clientes: solo el servidor (service role) los toca.

-- ---------------------------------------------------------------------
-- 7. BUCKET DE STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('raffle-images', 'raffle-images', true)
on conflict (id) do nothing;

drop policy if exists "raffle_images_public_read" on storage.objects;
create policy "raffle_images_public_read"
  on storage.objects for select
  using (bucket_id = 'raffle-images');

drop policy if exists "raffle_images_auth_upload" on storage.objects;
create policy "raffle_images_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'raffle-images');

drop policy if exists "raffle_images_owner_update" on storage.objects;
create policy "raffle_images_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'raffle-images' and owner = auth.uid());

drop policy if exists "raffle_images_owner_delete" on storage.objects;
create policy "raffle_images_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'raffle-images' and owner = auth.uid());

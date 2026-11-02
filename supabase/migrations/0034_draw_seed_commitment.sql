-- =====================================================================
-- 0034 — Prueba de imprevisibilidad: semilla comprometida (commit-reveal)
-- =====================================================================
-- Qué agrega, sin cambiar la mecánica del sorteo:
--   1. raffle_draw_secrets: semilla secreta por sorteo. RLS activo SIN
--      políticas y GRANT revocado a anon/authenticated: solo la leen las
--      funciones SECURITY DEFINER y el service_role (server-side).
--   2. commit_draw_seed(): el organizador (dueño) o el superadmin publica el
--      COMPROMISO = SHA-256("gadu:v1|raffle:<id>|seed:<seed>"). La semilla se
--      genera en el servidor con gen_random_uuid() (dos UUID v4 = 256 bits):
--      el organizador nunca la ve antes del sorteo.
--   3. draw_winner: exige compromiso publicado; elige al ganador de forma
--      determinística con la semilla, el listado vendido ordenado y SHA-256;
--      revela la semilla y guarda las huellas de 0033. Todo o nada.
--   4. Trigger: el compromiso no cambia una vez publicado y el resultado
--      (incluida la semilla revelada) queda congelado cuando el sorteo
--      está drawn.
--
-- Fórmula pública (la misma que muestra la página del sorteo):
--   seed        = 64 caracteres hex (revelada al sortear)
--   commitment  = SHA-256 hex("gadu:v1|raffle:<id>|seed:<seed>")
--   numbers     = "n1,n2,...,nN" vendidos, ascendente, sin espacios
--   pick        = SHA-256 hex("gadu:v1|raffle:<id>|seed:<seed>|numbers:<numbers>")
--   index       = int(pick[0..15], 16) % N  (índice 0-based del listado ordenado)
--   ganador     = numbers[index]
--
-- Requiere PostgreSQL 14+ (sha256 integrada), igual que 0033.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Semilla secreta (sin acceso desde el cliente)
-- ---------------------------------------------------------------------
create table if not exists public.raffle_draw_secrets (
  raffle_id uuid primary key references public.raffles (id) on delete cascade,
  seed text not null,
  commitment text not null,
  committed_at timestamptz not null default now(),
  revealed_at timestamptz
);

alter table public.raffle_draw_secrets enable row level security;

revoke all on public.raffle_draw_secrets from public, anon, authenticated;
grant all on public.raffle_draw_secrets to service_role;

-- Sin políticas a propósito: el cliente no puede leer ni escribir la semilla.
-- Acceden las funciones SECURITY DEFINER (dueño de la tabla) y service_role.

-- ---------------------------------------------------------------------
-- 2) Columnas públicas del compromiso y la revelación
-- ---------------------------------------------------------------------
alter table public.raffles
  add column if not exists draw_commitment text;

alter table public.raffles
  add column if not exists draw_commitment_at timestamptz;

alter table public.raffles
  add column if not exists draw_seed text;

alter table public.raffles
  add column if not exists draw_seed_revealed_at timestamptz;

-- ---------------------------------------------------------------------
-- 3) Publicar el compromiso (dueño o superadmin, antes de sortear)
-- ---------------------------------------------------------------------
create or replace function public.commit_draw_seed(p_raffle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed text;
  v_commitment text;
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
    raise exception 'El sorteo no admite compromiso (ya fue sorteado o no existe)';
  end if;

  if exists (
    select 1 from public.raffle_draw_secrets
    where raffle_id = p_raffle_id
  ) then
    raise exception 'El compromiso de este sorteo ya fue publicado';
  end if;

  -- 256 bits de entropía: dos UUID v4 sin guiones.
  v_seed := replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', '');

  v_commitment := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|seed:' || v_seed,
        'UTF8'
      )
    ),
    'hex'
  );

  insert into public.raffle_draw_secrets (raffle_id, seed, commitment)
  values (p_raffle_id, v_seed, v_commitment);

  update public.raffles
  set draw_commitment = v_commitment,
      draw_commitment_at = now()
  where id = p_raffle_id;

  return v_commitment;
end;
$$;

revoke execute on function public.commit_draw_seed(uuid) from public, anon;
grant execute on function public.commit_draw_seed(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Sorteo con semilla comprometida (reemplaza la versión de 0033)
-- ---------------------------------------------------------------------
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
  v_numbers text;
  v_count int;
  v_seed text;
  v_pick text;
  v_index bigint;
  v_numbers_hash text;
  v_result_hash text;
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

  if exists (
    select 1 from public.raffles
    where id = p_raffle_id and status = 'drawn'
  ) then
    raise exception 'El sorteo ya fue sorteado';
  end if;

  if not exists (
    select 1 from public.raffles
    where id = p_raffle_id and status in ('active', 'closed')
  ) then
    raise exception 'El sorteo no se puede sortear (estado inválido)';
  end if;

  select s.seed into v_seed
  from public.raffle_draw_secrets s
  where s.raffle_id = p_raffle_id;

  if v_seed is null then
    raise exception 'El sorteo no tiene compromiso publicado: publicalo antes de sortear';
  end if;

  -- Listado canónico: solo números vendidos, ascendente, separados por coma.
  select string_agg(n.number::text, ',' order by n.number)
  into v_numbers
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold';

  if v_numbers is null then
    raise exception 'No hay números vendidos para sortear';
  end if;

  v_count := array_length(string_to_array(v_numbers, ','), 1);

  -- Selección determinística: 60 bits para quedar siempre positivo.
  v_pick := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text ||
          '|seed:' || v_seed ||
          '|numbers:' || v_numbers,
        'UTF8'
      )
    ),
    'hex'
  );

  v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint % v_count;

  select n.number, n.sold_to
  into v_number, v_user
  from (
    select
      rn.number,
      rn.sold_to,
      row_number() over (order by rn.number) - 1 as idx
    from public.raffle_numbers rn
    where rn.raffle_id = p_raffle_id
      and rn.status = 'sold'
  ) n
  where n.idx = v_index;

  if v_number is null then
    raise exception 'No se pudo resolver el ganador';
  end if;

  select full_name into v_name
  from public.profiles
  where id = v_user;

  v_numbers_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|numbers:' || v_numbers,
        'UTF8'
      )
    ),
    'hex'
  );

  v_result_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|winner:' ||
          v_number::text || '|numbers:' || v_numbers,
        'UTF8'
      )
    ),
    'hex'
  );

  update public.raffles
  set status = 'drawn',
      winner_number = v_number,
      winner_user_id = v_user,
      winner_name = v_name,
      drawn_at = now(),
      numbers_hash = v_numbers_hash,
      result_hash = v_result_hash,
      hashes_at = now(),
      draw_seed = v_seed,
      draw_seed_revealed_at = now()
  where id = p_raffle_id;

  update public.raffle_draw_secrets
  set revealed_at = now()
  where raffle_id = p_raffle_id;

  return query select v_number, v_user, v_name;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Congelamiento: compromiso inmutable y resultado congelado
-- ---------------------------------------------------------------------
create or replace function public.prevent_drawn_raffle_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- El compromiso, una vez publicado, no se puede cambiar ni borrar.
  if old.draw_commitment is not null then
    if new.draw_commitment is distinct from old.draw_commitment
       or new.draw_commitment_at is distinct from old.draw_commitment_at then
      raise exception
        'El compromiso del sorteo ya fue publicado y no se puede cambiar';
    end if;
  end if;

  -- Una vez sorteado, nada del resultado (ni la semilla revelada) se toca.
  if old.status = 'drawn' then
    if new.status is distinct from old.status
       or new.winner_number is distinct from old.winner_number
       or new.winner_user_id is distinct from old.winner_user_id
       or new.winner_name is distinct from old.winner_name
       or new.drawn_at is distinct from old.drawn_at
       or new.numbers_hash is distinct from old.numbers_hash
       or new.result_hash is distinct from old.result_hash
       or new.hashes_at is distinct from old.hashes_at
       or new.draw_seed is distinct from old.draw_seed
       or new.draw_seed_revealed_at is distinct from old.draw_seed_revealed_at then
      raise exception
        'El sorteo ya fue sorteado: el resultado no se puede cambiar ni reabrir';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_drawn_raffle_changes on public.raffles;
create trigger prevent_drawn_raffle_changes
  before update on public.raffles
  for each row execute procedure public.prevent_drawn_raffle_changes();

-- ---------------------------------------------------------------------
-- 6) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0034', 'semilla comprometida antes del sorteo (commit-reveal) e imprevisibilidad verificable')
on conflict (version) do nothing;

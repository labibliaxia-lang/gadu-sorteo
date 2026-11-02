-- =====================================================================
-- 0033 — Huellas verificables del sorteo (idempotente)
-- =====================================================================
-- Qué agrega: al ejecutar un sorteo, la base calcula y guarda dos huellas
-- SHA-256:
--   * numbers_hash: del listado de números vendidos, ordenado ascendente.
--   * result_hash : del mismo listado más el número ganador.
-- Con el listado vendido visible en la página pública, cualquiera puede
-- recalcular las huellas y comprobar que no se modificaron después.
--
-- Formato canónico (documentado en /como-funciona y en la página del sorteo):
--   numbers = "n1,n2,...,nN" (ascendente, sin espacios)
--   numbers_hash = SHA-256 hex( "gadu:v1|raffle:<id>|numbers:<numbers>" )
--   result_hash  = SHA-256 hex( "gadu:v1|raffle:<id>|winner:<n>|numbers:<numbers>" )
--
-- No cambia el resultado del sorteo ni su mecánica: solo agrega evidencia.
-- Requiere PostgreSQL 14+ (función sha256 integrada). Si no está, la
-- migración falla con un mensaje claro en vez de guardar basura.
-- =====================================================================

do $$
begin
  perform encode(sha256(convert_to('gadu', 'UTF8')), 'hex');
exception
  when undefined_function then
    raise exception 'Este PostgreSQL no expone sha256(); se requiere PostgreSQL 14 o superior para las huellas del sorteo.';
end;
$$;

-- ---------------------------------------------------------------------
-- 1) Columnas de evidencia (no se tocan datos existentes)
-- ---------------------------------------------------------------------
alter table public.raffles
  add column if not exists numbers_hash text;

alter table public.raffles
  add column if not exists result_hash text;

alter table public.raffles
  add column if not exists hashes_at timestamptz;

-- ---------------------------------------------------------------------
-- 2) draw_winner: calcula y guarda las huellas junto con el ganador
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

  -- Listado canónico: solo números vendidos, ascendente, separados por coma.
  select string_agg(n.number::text, ',' order by n.number)
  into v_numbers
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold';

  if v_numbers is null then
    raise exception 'No hay números vendidos para sortear';
  end if;

  select n.number, n.sold_to
  into v_number, v_user
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold'
  order by random()
  limit 1;

  if v_number is null then
    raise exception 'No hay números vendidos para sortear';
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
      hashes_at = now()
  where id = p_raffle_id;

  return query select v_number, v_user, v_name;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Trigger: congelar también las huellas cuando el sorteo está drawn
-- ---------------------------------------------------------------------
create or replace function public.prevent_drawn_raffle_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'drawn' then
    if new.status is distinct from old.status
       or new.winner_number is distinct from old.winner_number
       or new.winner_user_id is distinct from old.winner_user_id
       or new.winner_name is distinct from old.winner_name
       or new.drawn_at is distinct from old.drawn_at
       or new.numbers_hash is distinct from old.numbers_hash
       or new.result_hash is distinct from old.result_hash
       or new.hashes_at is distinct from old.hashes_at then
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
-- 4) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0033', 'huellas SHA-256 del listado vendido y del resultado del sorteo')
on conflict (version) do nothing;

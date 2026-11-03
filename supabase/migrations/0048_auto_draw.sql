-- =====================================================================
-- 0048 — Sorteo automático opt-in (cron + fallback) y núcleo compartido
-- =====================================================================
-- 1) Agrega raffles.auto_draw (apagado por defecto).
-- 2) Separa el algoritmo en draw_winner_core (sin permisos, con lock).
--    draw_winner conserva exactamente la autorización actual.
--    draw_winner_system queda solo para service_role (cron/fallback).
-- 3) Registra cada intento automático en auto_draw_runs.
--
-- No cambia el algoritmo, el compromiso de semilla ni los pagos.
-- =====================================================================

alter table public.raffles
  add column if not exists auto_draw boolean not null default false;

create table if not exists public.auto_draw_runs (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  source text not null check (source in ('cron', 'lazy', 'manual')),
  status text not null check (status in ('success', 'skipped', 'error')),
  message text,
  winning_number integer,
  created_at timestamptz not null default now()
);

create index if not exists auto_draw_runs_raffle_idx
  on public.auto_draw_runs (raffle_id, created_at desc);

alter table public.auto_draw_runs enable row level security;

drop policy if exists auto_draw_runs_select_owner on public.auto_draw_runs;
create policy auto_draw_runs_select_owner
  on public.auto_draw_runs for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.raffles r
      where r.id = auto_draw_runs.raffle_id
        and r.created_by = auth.uid()
    )
  );

revoke all on public.auto_draw_runs from public, anon, authenticated;
grant select on public.auto_draw_runs to authenticated;
grant all on public.auto_draw_runs to service_role;

-- ---------------------------------------------------------------------
-- Núcleo: mismo algoritmo de 0034, sin autorización y con lock de fila.
-- ---------------------------------------------------------------------
create or replace function public.draw_winner_core(p_raffle_id uuid)
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
  -- Serializa dos ejecuciones simultáneas (manual + automática).
  perform 1 from public.raffles where id = p_raffle_id for update;

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

  select string_agg(n.number::text, ',' order by n.number)
  into v_numbers
  from public.raffle_numbers n
  where n.raffle_id = p_raffle_id
    and n.status = 'sold';

  if v_numbers is null then
    raise exception 'No hay números vendidos para sortear';
  end if;

  v_count := array_length(string_to_array(v_numbers, ','), 1);

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

revoke all on function public.draw_winner_core(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Envoltorio para organizadores: misma autorización de siempre.
-- ---------------------------------------------------------------------
create or replace function public.draw_winner(p_raffle_id uuid)
returns table (winning_number int, winner_user uuid, winner_name text)
language plpgsql
security definer
set search_path = public
as $$
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

  return query select * from public.draw_winner_core(p_raffle_id);
end;
$$;

revoke execute on function public.draw_winner(uuid) from public, anon;
grant execute on function public.draw_winner(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ejecución de sistema (cron/fallback): solo service_role.
-- ---------------------------------------------------------------------
create or replace function public.draw_winner_system(p_raffle_id uuid)
returns table (winning_number int, winner_user uuid, winner_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.draw_winner_core(p_raffle_id);
end;
$$;

revoke all on function public.draw_winner_system(uuid)
  from public, anon, authenticated;
grant execute on function public.draw_winner_system(uuid) to service_role;

insert into public._applied_migrations (version, note)
values ('0048', 'sorteo automatico opt-in con nucleo compartido y log')
on conflict (version) do nothing;

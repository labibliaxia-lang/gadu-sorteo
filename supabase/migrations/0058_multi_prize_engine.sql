-- =====================================================================
-- 0058 — Motor multi-premio real (idempotente)
-- =====================================================================
-- Añade raffle_winners y un RPC nuevo que sólo se usa cuando
-- raffles.winners_count > 1. El sorteo de un ganador sigue usando
-- draw_winner_core, sin cambios.
--
-- Fórmula (misma que el sandbox):
--   premio 1 = selección actual sobre el listado completo;
--   premio i = SHA-256("...|prize:<i>|numbers:<restantes>") sin repetir.
--   Cada premio guarda su hash; results_hash cubre todos los ganadores.
-- =====================================================================

alter table public.raffles
  add column if not exists results_hash text;

create table if not exists public.raffle_winners (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  position integer not null check (position between 1 and 30),
  number integer not null,
  user_id uuid references auth.users (id) on delete set null,
  user_name text,
  prize_title text,
  winner_hash text not null,
  created_at timestamptz not null default now(),
  unique (raffle_id, position),
  unique (raffle_id, number)
);

create index if not exists raffle_winners_raffle_idx
  on public.raffle_winners (raffle_id, position);

alter table public.raffle_winners enable row level security;

drop policy if exists raffle_winners_select_public on public.raffle_winners;
create policy raffle_winners_select_public
  on public.raffle_winners for select
  using (true);

revoke all on public.raffle_winners from public, anon, authenticated;
grant select on public.raffle_winners to anon, authenticated;
grant all on public.raffle_winners to service_role;

-- Inmutables una vez creados.
create or replace function public.freeze_raffle_winners()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Los ganadores de un sorteo no se pueden modificar';
end;
$$;

drop trigger if exists freeze_raffle_winners on public.raffle_winners;
create trigger freeze_raffle_winners
  before update or delete on public.raffle_winners
  for each row execute procedure public.freeze_raffle_winners();

-- ---------------------------------------------------------------------
-- Backfill de sorteos viejos: un solo ganador, mismas huellas.
-- ---------------------------------------------------------------------
insert into public.raffle_winners (
  raffle_id, position, number, user_id, user_name, winner_hash, created_at
)
select
  r.id,
  1,
  r.winner_number,
  r.winner_user_id,
  r.winner_name,
  coalesce(r.result_hash, ''),
  coalesce(r.drawn_at, now())
from public.raffles r
where r.status = 'drawn'
  and r.winner_number is not null
  and not exists (
    select 1 from public.raffle_winners w where w.raffle_id = r.id
  )
on conflict do nothing;

update public.raffles
set results_hash = result_hash
where status = 'drawn' and results_hash is null;

-- ---------------------------------------------------------------------
-- Núcleo multi-premio
-- ---------------------------------------------------------------------
create or replace function public.draw_winner_multi_core(p_raffle_id uuid)
returns table (
  "position" integer,
  winning_number integer,
  winner_user uuid,
  winner_name text,
  winner_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raffle record;
  v_seed text;
  v_numbers text;
  v_remaining int[];
  v_remaining_text text;
  v_count integer;
  v_prizes integer;
  v_pick text;
  v_index bigint;
  v_winner integer;
  v_user uuid;
  v_name text;
  v_hash text;
  v_winners_csv text := '';
  v_results_hash text;
  v_pos integer;
  v_first integer;
  v_first_user uuid;
  v_first_name text;
  v_first_hash text;
  v_numbers_hash text;
begin
  perform 1 from public.raffles where id = p_raffle_id for update;

  select * into v_raffle
  from public.raffles r
  where r.id = p_raffle_id;

  if not found then
    raise exception 'El sorteo no existe';
  end if;

  if v_raffle.status = 'drawn' then
    raise exception 'El sorteo ya fue sorteado';
  end if;

  if v_raffle.status not in ('active', 'closed') then
    raise exception 'El sorteo no se puede sortear (estado inválido)';
  end if;

  if v_raffle.draw_date > now() then
    raise exception 'El sorteo todavía no llegó a su fecha programada';
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

  v_remaining := string_to_array(v_numbers, ',')::int[];
  v_count := array_length(v_remaining, 1);
  v_prizes := greatest(1, least(coalesce(v_raffle.winners_count, 1), v_count));

  for v_pos in 1..v_prizes loop
    v_remaining_text := array_to_string(v_remaining, ',');

    v_pick := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || p_raffle_id::text || '|seed:' || v_seed ||
            case
              when v_pos = 1 then '|numbers:' || v_numbers
              else '|prize:' || v_pos::text || '|numbers:' || v_remaining_text
            end,
          'UTF8'
        )
      ),
      'hex'
    );

    v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint
      % array_length(v_remaining, 1);
    v_winner := v_remaining[v_index + 1];

    select n.sold_to into v_user
    from public.raffle_numbers n
    where n.raffle_id = p_raffle_id
      and n.number = v_winner
      and n.status = 'sold';

    select full_name into v_name
    from public.profiles
    where id = v_user;

    v_hash := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || p_raffle_id::text ||
            case
              when v_pos = 1 then '|winner:' || v_winner::text || '|numbers:' || v_numbers
              else '|prize:' || v_pos::text || '|winner:' || v_winner::text ||
                '|numbers:' || v_remaining_text
            end,
          'UTF8'
        )
      ),
      'hex'
    );

    insert into public.raffle_winners (
      raffle_id, position, number, user_id, user_name, prize_title, winner_hash
    )
    values (
      p_raffle_id,
      v_pos,
      v_winner,
      v_user,
      v_name,
      (
        select pz.title from public.prizes pz
        where pz.raffle_id = p_raffle_id and pz.position = v_pos
        limit 1
      ),
      v_hash
    );

    if v_pos = 1 then
      v_first := v_winner;
      v_first_user := v_user;
      v_first_name := v_name;
      v_first_hash := v_hash;
    end if;

    v_winners_csv := case
      when v_pos = 1 then v_winner::text
      else v_winners_csv || ',' || v_winner::text
    end;

    v_remaining := array_remove(v_remaining, v_winner);
  end loop;

  v_numbers_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|numbers:' || v_numbers,
        'UTF8'
      )
    ),
    'hex'
  );

  v_results_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || p_raffle_id::text || '|seed:' || v_seed ||
          '|winners:' || v_winners_csv || '|numbers:' || v_numbers,
        'UTF8'
      )
    ),
    'hex'
  );

  update public.raffles
  set status = 'drawn',
      winner_number = v_first,
      winner_user_id = v_first_user,
      winner_name = v_first_name,
      drawn_at = now(),
      numbers_hash = v_numbers_hash,
      result_hash = v_first_hash,
      hashes_at = now(),
      results_hash = v_results_hash,
      draw_seed = v_seed,
      draw_seed_revealed_at = now()
  where id = p_raffle_id;

  update public.raffle_draw_secrets
  set revealed_at = now()
  where raffle_id = p_raffle_id;

  return query
  select w.position, w.number, w.user_id, w.user_name, w.winner_hash
  from public.raffle_winners w
  where w.raffle_id = p_raffle_id
  order by w.position;
end;
$$;

revoke all on function public.draw_winner_multi_core(uuid)
  from public, anon, authenticated;

create or replace function public.draw_winner_multi(p_raffle_id uuid)
returns table (
  "position" integer,
  winning_number integer,
  winner_user uuid,
  winner_name text,
  winner_hash text
)
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

  return query select * from public.draw_winner_multi_core(p_raffle_id);
end;
$$;

revoke execute on function public.draw_winner_multi(uuid) from public, anon;
grant execute on function public.draw_winner_multi(uuid) to authenticated;

create or replace function public.draw_winner_multi_system(p_raffle_id uuid)
returns table (
  "position" integer,
  winning_number integer,
  winner_user uuid,
  winner_name text,
  winner_hash text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.draw_winner_multi_core(p_raffle_id);
end;
$$;

revoke all on function public.draw_winner_multi_system(uuid)
  from public, anon, authenticated;
grant execute on function public.draw_winner_multi_system(uuid) to service_role;

insert into public._applied_migrations (version, note)
values ('0058', 'motor multi-premio real y ganadores inmutables')
on conflict (version) do nothing;

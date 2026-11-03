-- =====================================================================
-- 0051 — Simulador en dos fases, igual al flujo real (idempotente)
-- =====================================================================
-- El sorteo real tiene dos momentos:
--   1) commit_draw_seed: se publica el hash de una semilla sin revelarla.
--   2) draw_winner: se usa esa semilla + los números vendidos y se revela.
--
-- El simulador ahora replica ese flujo sobre 1..N números ficticios:
--   create_sandbox_commitment() -> execute_sandbox_draw(run_id)
-- Sigue aislado: no toca raffles, raffle_numbers ni pagos.
-- =====================================================================

alter table public.draw_sandbox_runs
  alter column winning_number drop not null,
  alter column numbers_hash drop not null,
  alter column result_hash drop not null;

alter table public.draw_sandbox_runs
  add column if not exists executed_at timestamptz;

-- ---------------------------------------------------------------------
-- Fase 1: crear el compromiso (la semilla NO se devuelve)
-- ---------------------------------------------------------------------
create or replace function public.create_sandbox_commitment(
  p_count integer default 100
)
returns table (
  run_id uuid,
  commitment text,
  numbers text,
  numbers_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_numbers_text text;
  v_seed text;
  v_commitment text;
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superadmin puede usar el simulador';
  end if;

  v_count := greatest(1, least(coalesce(p_count, 100), 1000));
  v_numbers_text := array_to_string(
    array(select generate_series(1, v_count)),
    ','
  );

  v_seed := replace(gen_random_uuid()::text, '-', '')
         || replace(gen_random_uuid()::text, '-', '');

  v_commitment := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || v_id::text || '|seed:' || v_seed,
        'UTF8'
      )
    ),
    'hex'
  );

  insert into public.draw_sandbox_runs (
    id, created_by, numbers_count, numbers, seed, commitment
  )
  values (
    v_id, auth.uid(), v_count, v_numbers_text, v_seed, v_commitment
  );

  return query
  select v_id, v_commitment, v_numbers_text, v_count, now();
end;
$$;

-- ---------------------------------------------------------------------
-- Fase 2: ejecutar con la semilla comprometida y revelarla
-- ---------------------------------------------------------------------
create or replace function public.execute_sandbox_draw(p_run_id uuid)
returns table (
  winning_number integer,
  seed text,
  commitment text,
  numbers_hash text,
  result_hash text,
  numbers_count integer,
  numbers text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.draw_sandbox_runs%rowtype;
  v_pick text;
  v_index bigint;
  v_winner integer;
  v_numbers_hash text;
  v_result_hash text;
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superadmin puede usar el simulador';
  end if;

  select * into v_row
  from public.draw_sandbox_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'La simulación no existe';
  end if;

  -- Idempotente: si ya se ejecutó, devuelve el mismo resultado.
  if v_row.executed_at is null then
    v_pick := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || v_row.id::text || '|seed:' || v_row.seed ||
            '|numbers:' || v_row.numbers,
          'UTF8'
        )
      ),
      'hex'
    );

    v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint
      % v_row.numbers_count;
    v_winner := (string_to_array(v_row.numbers, ','))[v_index + 1]::int;

    v_numbers_hash := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || v_row.id::text ||
            '|numbers:' || v_row.numbers,
          'UTF8'
        )
      ),
      'hex'
    );

    v_result_hash := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || v_row.id::text || '|winner:' ||
            v_winner::text || '|numbers:' || v_row.numbers,
          'UTF8'
        )
      ),
      'hex'
    );

    update public.draw_sandbox_runs
    set winning_number = v_winner,
        numbers_hash = v_numbers_hash,
        result_hash = v_result_hash,
        executed_at = now()
    where id = v_row.id;
  end if;

  return query
  select
    v_row.winning_number,
    v_row.seed,
    v_row.commitment,
    v_row.numbers_hash,
    v_row.result_hash,
    v_row.numbers_count,
    v_row.numbers
  from public.draw_sandbox_runs v_row
  where v_row.id = p_run_id;
end;
$$;

revoke all on function public.create_sandbox_commitment(integer)
  from public, anon, authenticated;
grant execute on function public.create_sandbox_commitment(integer)
  to authenticated;

revoke all on function public.execute_sandbox_draw(uuid)
  from public, anon, authenticated;
grant execute on function public.execute_sandbox_draw(uuid)
  to authenticated;

insert into public._applied_migrations (version, note)
values ('0051', 'simulador en dos fases igual al flujo real')
on conflict (version) do nothing;

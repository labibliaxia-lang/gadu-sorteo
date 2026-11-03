-- =====================================================================
-- 0043 — Simulador de sorteo para superadmin (idempotente)
-- =====================================================================
-- Escenario de prueba COMPLETAMENTE AISLADO: no toca raffles,
-- raffle_numbers, payments ni el motor real. Guarda cada simulación en una
-- tabla propia y usa la misma fórmula SHA-256 del motor (0034) sobre 100
-- números "vendidos" simulados (1..100).
--
-- Solo el superadmin puede ejecutarla y ver el historial.
-- =====================================================================

create table if not exists public.draw_sandbox_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  numbers_count integer not null check (numbers_count between 1 and 1000),
  numbers text not null,
  seed text not null,
  commitment text not null,
  numbers_hash text not null,
  result_hash text not null,
  winning_number integer not null,
  created_at timestamptz not null default now()
);

create index if not exists draw_sandbox_runs_created_idx
  on public.draw_sandbox_runs (created_at desc);

alter table public.draw_sandbox_runs enable row level security;

drop policy if exists draw_sandbox_runs_superadmin_select
  on public.draw_sandbox_runs;
create policy draw_sandbox_runs_superadmin_select
  on public.draw_sandbox_runs for select
  to authenticated
  using (public.is_superadmin());

revoke all on public.draw_sandbox_runs from public, anon, authenticated;
grant select on public.draw_sandbox_runs to authenticated;
grant all on public.draw_sandbox_runs to service_role;

-- ---------------------------------------------------------------------
-- Ejecuta una simulación con los mismos cálculos del motor real
-- ---------------------------------------------------------------------
create or replace function public.run_sandbox_draw(p_count integer default 100)
returns table (
  winning_number integer,
  seed text,
  commitment text,
  numbers_hash text,
  result_hash text,
  numbers_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_numbers int[];
  v_numbers_text text;
  v_seed text;
  v_commitment text;
  v_pick text;
  v_index bigint;
  v_winner integer;
  v_numbers_hash text;
  v_result_hash text;
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superadmin puede usar el simulador';
  end if;

  v_count := greatest(1, least(coalesce(p_count, 100), 1000));
  v_numbers := array(select generate_series(1, v_count));
  v_numbers_text := array_to_string(v_numbers, ',');

  -- Semilla con el mismo formato que el motor real: dos UUID v4 sin guiones
  -- (256 bits). Se evita pgcrypto para no depender de una extensión.
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

  v_pick := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || v_id::text || '|seed:' || v_seed ||
          '|numbers:' || v_numbers_text,
        'UTF8'
      )
    ),
    'hex'
  );

  v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint % v_count;
  v_winner := v_numbers[v_index + 1];

  v_numbers_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || v_id::text || '|numbers:' || v_numbers_text,
        'UTF8'
      )
    ),
    'hex'
  );

  v_result_hash := encode(
    sha256(
      convert_to(
        'gadu:v1|raffle:' || v_id::text || '|winner:' || v_winner::text ||
          '|numbers:' || v_numbers_text,
        'UTF8'
      )
    ),
    'hex'
  );

  insert into public.draw_sandbox_runs (
    id, created_by, numbers_count, numbers, seed, commitment,
    numbers_hash, result_hash, winning_number
  )
  values (
    v_id, auth.uid(), v_count, v_numbers_text, v_seed, v_commitment,
    v_numbers_hash, v_result_hash, v_winner
  );

  return query
  select v_winner, v_seed, v_commitment, v_numbers_hash, v_result_hash, v_count;
end;
$$;

revoke execute on function public.run_sandbox_draw(integer)
  from public, anon, authenticated;
grant execute on function public.run_sandbox_draw(integer)
  to authenticated;
grant execute on function public.run_sandbox_draw(integer)
  to service_role;

insert into public._applied_migrations (version, note)
values ('0043', 'simulador de sorteo aislado para superadmin')
on conflict (version) do nothing;

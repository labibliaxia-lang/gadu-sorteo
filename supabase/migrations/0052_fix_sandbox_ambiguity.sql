-- =====================================================================
-- 0052 — Corrige ambigüedad en execute_sandbox_draw
-- =====================================================================
-- Error reproducido: "column reference v_row.winning_number is ambiguous"
-- El RETURNS TABLE declara columnas con el mismo nombre que la fila y el
-- RETURN QUERY usaba un alias igual al record de PL/pgSQL.
--
-- Se calculan valores en variables escalares y se devuelven sin FROM, para
-- que no haya ambigüedad. La lógica y los hashes no cambian.
-- =====================================================================

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
  v_winning integer;
  v_seed text;
  v_commitment text;
  v_numbers_hash text;
  v_result_hash text;
  v_numbers_count integer;
  v_numbers text;
  v_pick text;
  v_index bigint;
  v_winner integer;
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

    update public.draw_sandbox_runs
    set winning_number = v_winner,
        numbers_hash = encode(
          sha256(
            convert_to(
              'gadu:v1|raffle:' || v_row.id::text ||
                '|numbers:' || v_row.numbers,
              'UTF8'
            )
          ),
          'hex'
        ),
        result_hash = encode(
          sha256(
            convert_to(
              'gadu:v1|raffle:' || v_row.id::text || '|winner:' ||
                v_winner::text || '|numbers:' || v_row.numbers,
              'UTF8'
            )
          ),
          'hex'
        ),
        executed_at = now()
    where id = v_row.id;
  end if;

  select
    r.winning_number,
    r.seed,
    r.commitment,
    r.numbers_hash,
    r.result_hash,
    r.numbers_count,
    r.numbers
  into
    v_winning,
    v_seed,
    v_commitment,
    v_numbers_hash,
    v_result_hash,
    v_numbers_count,
    v_numbers
  from public.draw_sandbox_runs r
  where r.id = p_run_id;

  return query
  select
    v_winning,
    v_seed,
    v_commitment,
    v_numbers_hash,
    v_result_hash,
    v_numbers_count,
    v_numbers;
end;
$$;

revoke all on function public.execute_sandbox_draw(uuid)
  from public, anon, authenticated;
grant execute on function public.execute_sandbox_draw(uuid)
  to authenticated;

insert into public._applied_migrations (version, note)
values ('0052', 'corrige ambiguedad de execute_sandbox_draw')
on conflict (version) do nothing;

-- =====================================================================
-- 0082 — Simulador público: el mismo motor del panel superadmin para todos
-- =====================================================================
-- Qué hace: quita la restricción `is_superadmin()` de las dos RPC del
-- simulador y las habilita para anon + authenticated, así cualquier persona
-- (sin registrarse) puede correr la demo completa: compromiso, sorteo
-- multi-premio, hashes por premio y results_hash.
--
-- Qué NO hace: no toca `raffles` ni `raffle_numbers`. Sigue escribiendo
-- únicamente en `draw_sandbox_runs` (entorno aislado de prueba). No hay
-- premios reales ni números en venta involucrados.
--
-- Nota: al quedar público, cualquier visitante puede crear filas de prueba
-- en `draw_sandbox_runs`. Es una tabla de sandbox; si crece demasiado,
-- conviene limpiarla con un cron (p. ej. borrar ejecuciones > 30 días).
-- =====================================================================

create or replace function public.create_sandbox_commitment_v2(
  p_count integer default 100,
  p_prizes integer default 1
)
returns table (
  run_id uuid,
  commitment text,
  numbers text,
  numbers_count integer,
  prizes_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_prizes integer;
  v_numbers_text text;
  v_seed text;
  v_commitment text;
begin
  v_count := greatest(1, least(coalesce(p_count, 100), 10000));
  v_prizes := greatest(1, least(coalesce(p_prizes, 1), 50));
  v_prizes := least(v_prizes, v_count);

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
    id, created_by, numbers_count, prizes_count, numbers, seed, commitment
  )
  values (
    v_id, auth.uid(), v_count, v_prizes, v_numbers_text, v_seed, v_commitment
  );

  return query
  select v_id, v_commitment, v_numbers_text, v_count, v_prizes, now();
end;
$$;

create or replace function public.execute_sandbox_draw_v2(p_run_id uuid)
returns table (
  winning_number integer,
  seed text,
  commitment text,
  numbers_hash text,
  result_hash text,
  numbers_count integer,
  numbers text,
  prizes_count integer,
  winners jsonb,
  results_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.draw_sandbox_runs%rowtype;
  v_winner integer;
  v_first_winner integer;
  v_first_hash text;
  v_numbers_hash text;
  v_results_hash text;
  v_remaining int[];
  v_remaining_text text;
  v_pick text;
  v_index bigint;
  v_winner_hash text;
  v_winners jsonb := '[]'::jsonb;
  v_winners_csv text := '';
  v_pos integer;
  v_prizes integer;
begin
  select * into v_row
  from public.draw_sandbox_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'La simulación no existe';
  end if;

  v_prizes := greatest(1, least(v_row.prizes_count, v_row.numbers_count));

  if v_row.executed_at is null then
    v_remaining := string_to_array(v_row.numbers, ',')::int[];

    for v_pos in 1..v_prizes loop
      v_remaining_text := array_to_string(v_remaining, ',');

      if v_pos = 1 then
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
      else
        v_pick := encode(
          sha256(
            convert_to(
              'gadu:v1|raffle:' || v_row.id::text || '|seed:' || v_row.seed ||
                '|prize:' || v_pos::text || '|numbers:' || v_remaining_text,
              'UTF8'
            )
          ),
          'hex'
        );
      end if;

      v_index := ('x' || substr(v_pick, 1, 15))::bit(60)::bigint
        % array_length(v_remaining, 1);
      v_winner := v_remaining[v_index + 1];

      if v_pos = 1 then
        v_winner_hash := encode(
          sha256(
            convert_to(
              'gadu:v1|raffle:' || v_row.id::text || '|winner:' ||
                v_winner::text || '|numbers:' || v_row.numbers,
              'UTF8'
            )
          ),
          'hex'
        );
        v_first_winner := v_winner;
        v_first_hash := v_winner_hash;
      else
        v_winner_hash := encode(
          sha256(
            convert_to(
              'gadu:v1|raffle:' || v_row.id::text || '|prize:' ||
                v_pos::text || '|winner:' || v_winner::text ||
                '|numbers:' || v_remaining_text,
              'UTF8'
            )
          ),
          'hex'
        );
      end if;

      v_winners := v_winners || jsonb_build_array(
        jsonb_build_object(
          'position', v_pos,
          'number', v_winner,
          'hash', v_winner_hash
        )
      );

      v_winners_csv := case
        when v_pos = 1 then v_winner::text
        else v_winners_csv || ',' || v_winner::text
      end;

      v_remaining := array_remove(v_remaining, v_winner);
    end loop;

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

    v_results_hash := encode(
      sha256(
        convert_to(
          'gadu:v1|raffle:' || v_row.id::text || '|seed:' || v_row.seed ||
            '|winners:' || v_winners_csv || '|numbers:' || v_row.numbers,
          'UTF8'
        )
      ),
      'hex'
    );

    update public.draw_sandbox_runs
    set winning_number = v_first_winner,
        numbers_hash = v_numbers_hash,
        result_hash = v_first_hash,
        winners = v_winners,
        results_hash = v_results_hash,
        executed_at = now()
    where id = v_row.id;
  end if;

  return query
  select
    r.winning_number,
    r.seed,
    r.commitment,
    r.numbers_hash,
    r.result_hash,
    r.numbers_count,
    r.numbers,
    r.prizes_count,
    r.winners,
    r.results_hash
  from public.draw_sandbox_runs r
  where r.id = p_run_id;
end;
$$;

revoke all on function public.create_sandbox_commitment_v2(integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_sandbox_commitment_v2(integer, integer)
  to anon, authenticated;

revoke all on function public.execute_sandbox_draw_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.execute_sandbox_draw_v2(uuid)
  to anon, authenticated;

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0082', 'simulador publico: mismo motor del superadmin para anon y authenticated')
    on conflict (version) do nothing;
  end if;
end
$$;

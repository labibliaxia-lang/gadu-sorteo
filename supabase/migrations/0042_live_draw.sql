-- =====================================================================
-- 0042 — Motor de sorteo en vivo (idempotente)
-- =====================================================================
-- El motor real ya existe: `draw_winner` (0034) hace commit-reveal, usa solo
-- números vendidos, calcula SHA-256 y congela el resultado. Esta migración:
--
--   1) Expone `execute_transparent_draw`, un wrapper ESTRICTO del motor
--      existente (no hay un segundo algoritmo que pueda divergir).
--   2) Devuelve el hash de verificación (el `result_hash` ya calculado).
--   3) Agrega `raffles` a la publicación de Realtime para que todos los
--      espectadores reciban el resultado.
--
-- No toca reservas prepago, pagos, premios ni el webhook.
-- =====================================================================

create or replace function public.execute_transparent_draw(p_raffle_id uuid)
returns table (
  winning_number int,
  winner_user uuid,
  winner_name text,
  verification_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
  v_hash text;
begin
  -- Autorización estricta (redundante con draw_winner: defensa en profundidad).
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
    select 1 from public.raffle_numbers n
    where n.raffle_id = p_raffle_id and n.status = 'sold'
  ) then
    raise exception 'No hay números vendidos para sortear';
  end if;

  -- Delega en el motor único. Él valida: ya sorteado, estado, compromiso
  -- publicado y selección entre los vendidos.
  select * into v_result from public.draw_winner(p_raffle_id);

  select r.result_hash into v_hash
  from public.raffles r
  where r.id = p_raffle_id;

  if v_result.winning_number is null or v_hash is null then
    raise exception 'No se pudo registrar el sorteo';
  end if;

  return query
  select
    v_result.winning_number,
    v_result.winner_user,
    v_result.winner_name,
    v_hash;
end;
$$;

revoke execute on function public.execute_transparent_draw(uuid)
  from public, anon, authenticated;
grant execute on function public.execute_transparent_draw(uuid)
  to authenticated;
grant execute on function public.execute_transparent_draw(uuid)
  to service_role;

-- Realtime: que la página en vivo reciba el UPDATE de raffles al sortear.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'raffles'
  ) then
    execute 'alter publication supabase_realtime add table public.raffles';
  end if;
end;
$$;

insert into public._applied_migrations (version, note)
values ('0042', 'motor de sorteo en vivo: wrapper execute_transparent_draw y realtime de raffles')
on conflict (version) do nothing;

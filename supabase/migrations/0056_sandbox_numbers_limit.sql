-- =====================================================================
-- 0056 — Amplía el límite de números del simulador a 10.000
-- =====================================================================
-- La tabla se creó en 0043 con numbers_count entre 1 y 1000. La 0055 subió
-- la UI a 10.000, pero el constraint seguía en 1000 y bloqueaba el insert.
--
-- Es exclusivo de draw_sandbox_runs: no toca raffle_numbers ni el sorteo real.
-- =====================================================================

alter table public.draw_sandbox_runs
  drop constraint if exists draw_sandbox_runs_numbers_count_check;

alter table public.draw_sandbox_runs
  add constraint draw_sandbox_runs_numbers_count_check
  check (numbers_count between 1 and 10000);

insert into public._applied_migrations (version, note)
values ('0056', 'limite de numeros del simulador a 10000')
on conflict (version) do nothing;

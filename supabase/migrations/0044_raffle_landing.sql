-- =====================================================================
-- 0044 — Landing promocional por sorteo (idempotente)
-- =====================================================================
-- Guarda bloques estructurados (JSON) para la página pública del sorteo.
-- No toca pagos, reservas ni el motor de sorteo.
--
-- Formato: array de bloques, validado en la Server Action con Zod antes de
-- escribir. Solo el dueño del sorteo (o superadmin) puede editar la columna.
-- =====================================================================

alter table public.raffles
  add column if not exists landing_content jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'raffles_landing_content_is_array'
  ) then
    alter table public.raffles
      add constraint raffles_landing_content_is_array
      check (jsonb_typeof(landing_content) = 'array');
  end if;
end;
$$;

insert into public._applied_migrations (version, note)
values ('0044', 'landing promocional por sorteo con bloques JSON')
on conflict (version) do nothing;

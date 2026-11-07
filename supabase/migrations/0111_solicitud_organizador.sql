-- =====================================================================
-- 0111 — Solicitud de organizador con datos de investigación
-- =====================================================================
-- El formulario ya pedía teléfono y mensaje; para investigar al candidato
-- faltan las herramientas que quiere sortear y sus redes.
--
-- No cambia roles ni RLS: la aprobación sigue siendo del Superadmin.
-- Idempotente.
-- =====================================================================

alter table public.profiles
  add column if not exists request_tools text;

alter table public.profiles
  add column if not exists request_social text;

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0111', 'solicitud de organizador con herramientas y redes sociales')
    on conflict (version) do nothing;
  end if;
end;
$$;

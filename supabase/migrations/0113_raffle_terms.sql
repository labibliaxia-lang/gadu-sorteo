-- =====================================================================
-- 0113 — Bases legales por sorteo
-- =====================================================================
-- 1. `raffles.terms_accepted_by_organizer`: el organizador declaró que
--    publica esas bases (checkbox obligatorio al crear).
-- 2. `raffles.player_terms_text`: texto generado con sus datos de KYC, que el
--    jugador debe aceptar antes de reservar.
--
-- No toca triggers, sorteo, reservas ni pagos: son columnas informativas.
-- Idempotente.
-- =====================================================================

alter table public.raffles
  add column if not exists terms_accepted_by_organizer boolean not null default false;

alter table public.raffles
  add column if not exists player_terms_text text;

do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0113', 'bases legales por sorteo: aceptacion del organizador y texto para el jugador')
    on conflict (version) do nothing;
  end if;
end;
$$;

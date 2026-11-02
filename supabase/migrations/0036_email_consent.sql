-- =====================================================================
-- 0036 — Consentimiento y preferencia de avisos por email (idempotente)
-- =====================================================================
-- Los emails transaccionales (reserva, pago, premio) ahora respetan:
--   * terms_accepted_at: cuándo la cuenta aceptó los Términos.
--   * email_opt_in: preferencia editable por el usuario.
--
-- Reglas:
--   - Al registrarse se considera aceptada la Términos (lo dicen los Términos
--     publicados): el trigger completa terms_accepted_at si viene nulo.
--   - El backfill marca a las cuentas existentes con su fecha de alta.
--   - El usuario puede desactivar los avisos desde /perfil (opt-out).
--   - Ningún email se envía si falta la aceptación o si email_opt_in = false.
--
-- No toca pagos, sorteos ni datos existentes más allá de esas dos columnas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles
  add column if not exists email_opt_in boolean not null default true;

-- Backfill: las cuentas existentes aceptaron al registrarse.
update public.profiles
set terms_accepted_at = created_at
where terms_accepted_at is null;

-- ---------------------------------------------------------------------
-- 2) Alta: registrar la aceptación al crear el perfil
-- ---------------------------------------------------------------------
create or replace function public.set_initial_terms_acceptance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.terms_accepted_at is null then
    new.terms_accepted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_initial_terms_acceptance on public.profiles;
create trigger set_initial_terms_acceptance
  before insert on public.profiles
  for each row execute procedure public.set_initial_terms_acceptance();

-- ---------------------------------------------------------------------
-- 3) Ledger (convención desde 0028)
-- ---------------------------------------------------------------------
insert into public._applied_migrations (version, note)
values ('0036', 'consentimiento de terminos y preferencia de avisos por email')
on conflict (version) do nothing;

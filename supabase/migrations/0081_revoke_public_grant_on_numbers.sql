-- =====================================================================
-- 0081 — El grant a PUBLIC dejaba a anon leyendo los UUID igual
-- =====================================================================
-- Qué pasó con 0080:
--   `revoke select ... from anon` no alcanzó. La tabla conserva un `grant
--   select ... to public` (0001), y anon es miembro de PUBLIC, así que hereda
--   el permiso de tabla completa. El verificador de 0080 dio 4 OK porque
--   preguntaba a `information_schema.column_privileges`, que muestra los
--   grants DIRECTOS y esconde los heredados de PUBLIC.
--
-- Qué hace:
--   1. Suelta el grant a PUBLIC (que es el que abría la puerta).
--   2. Reafirma el permiso pleno para `authenticated` y `service_role`, que sí
--      lo necesitan (grid con sesión, RPC y crons).
--   3. Deja a anon solo con las columnas públicas.
--
-- Verificación correcta: `supabase/tests/verificar_0081.sql` usa
-- `has_column_privilege(...)`, que responde por el privilegio EFECTIVO.
--
-- Rollback (una línea):
--   grant select on public.raffle_numbers to public;
--
-- Idempotente.
-- =====================================================================

revoke select on public.raffle_numbers from anon;
revoke select on public.raffle_numbers from public;

grant select on public.raffle_numbers to authenticated, service_role;

grant select (
  id,
  raffle_id,
  number,
  status,
  reserved_until,
  sold_at
) on public.raffle_numbers to anon;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0081', 'revoca el grant a PUBLIC: anon deja de ver reserved_by y sold_to')
    on conflict (version) do nothing;
  end if;
end;
$$;

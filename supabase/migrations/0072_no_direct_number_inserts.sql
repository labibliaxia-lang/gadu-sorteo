-- =====================================================================
-- 0072 — Nadie inserta números por PostgREST
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, ALTA — reclasificado desde MEDIA):
--   `0065:89` concedía `insert on public.raffle_numbers to authenticated` y la
--   política `raffle_numbers_insert_owner` (0065:151) solo validaba que el
--   sorteo fuera del organizador, sin mirar las columnas.
--
--   Con eso, un organizador podía insertar filas con `status='sold'` y
--   `sold_to` de cualquiera. `draw_winner_core` sortea sobre
--   `where status = 'sold'`: agregar números vendidos falsos CAMBIA el conjunto
--   del sorteo y el `numbers_hash` que después se publica. Es el mismo tipo de
--   fallo que el hallazgo #1 (resultado falsificable), por otra puerta.
--
--   Además inflaba el contador de vendidos que usan el panel y la analítica.
--
-- Por qué se puede revocar sin romper nada:
--   El grid de números NO se crea por PostgREST. Lo crea
--   `create_raffle_numbers` (0024:33), que es `security definer`: inserta como
--   dueño de la función, así que el permiso del rol `authenticated` no participa.
--   `grep` sobre `app/` y `components/`: ningún `.from("raffle_numbers").insert`.
--
-- Idempotente.
-- =====================================================================

revoke insert on public.raffle_numbers from authenticated;

-- La política queda sin privilegio que otorgar, pero se borra igual: una
-- política de INSERT viva es una invitación a que alguien vuelva a conceder el
-- grant "porque ya estaba".
drop policy if exists "raffle_numbers_insert_owner" on public.raffle_numbers;

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public._applied_migrations') is not null then
    insert into public._applied_migrations (version, note)
    values ('0072', 'revocado el insert directo en raffle_numbers: el grid lo crea create_raffle_numbers')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba completa: supabase/tests/verificar_0072.sql)
-- =====================================================================
--   select has_table_privilege('authenticated','public.raffle_numbers','insert')
--     as puede_insertar;  -- debe dar false
--
-- Rollback:
--   grant insert on public.raffle_numbers to authenticated;
-- =====================================================================

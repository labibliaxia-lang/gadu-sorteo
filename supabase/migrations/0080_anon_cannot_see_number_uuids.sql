-- =====================================================================
-- 0080 — El público anónimo no ve los UUID de reservadores y compradores
-- =====================================================================
-- Hallazgo (auditoría 2026-11-04, MEDIA nº 16):
--   `raffle_numbers` es de lectura pública y expone `reserved_by` y `sold_to`,
--   los UUID de quien reservó y de quien compró. Con la anon key cualquiera
--   puede listarlos por PostgREST y correlacionar la actividad de una misma
--   persona entre sorteos.
--
-- Por qué SOLO anon en esta migración:
--   el grid público selecciona esas columnas para marcar «tus números». Un
--   visitante sin sesión no puede tener números propios, así que no las
--   necesita; una cuenta autenticada sí (para marcar los suyos). Quitarle las
--   columnas a `authenticated` exige mover además las consultas de
--   `mis-numeros`, `mis-pagos`, reseñas y acciones a una RPC, y probar el
--   Realtime con navegador. Eso es una migración aparte.
--
-- ⚠️ NO APLICAR SIN EL PASO 2 DEL CÓDIGO.
--   El componente `NumbersGrid` todavía pide esas columnas en su primera
--   lectura. Si se aplica antes de desplegar el cambio, la grilla queda vacía
--   para los visitantes anónimos (el SELECT devuelve 42501).
--
-- Rollback (una línea):
--   grant select on public.raffle_numbers to anon;
--
-- Idempotente.
-- =====================================================================

revoke select on public.raffle_numbers from anon;

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
    values ('0080', 'anon deja de ver reserved_by y sold_to en raffle_numbers')
    on conflict (version) do nothing;
  end if;
end;
$$;

-- =====================================================================
-- Verificación (prueba: supabase/tests/verificar_0080.sql)
-- =====================================================================

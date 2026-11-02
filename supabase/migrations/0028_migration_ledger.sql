-- =====================================================================
-- 0028 — Ledger de migraciones (idempotente)
-- =====================================================================
-- Qué resuelve: el hallazgo #2 fue una migración aplicada a medias —la función
-- del trigger existía y el trigger no— sin ninguna forma de saberlo. Sin
-- registro de ejecución, «está en el repo» no prueba que esté en la base.
--
-- Qué registra: cada migración que se ejecuta, a partir de ésta. NO rellena el
-- pasado: las versiones 0001-0027 no tienen fila porque nadie las anotó cuando
-- corrieron. Inventarlas sería un ledger que miente, y un ledger que miente es
-- peor que no tenerlo. Para el pasado, la garantía es el verificador
-- (supabase/tests/verificar_esquema.sql), que comprueba objetos, no promesas.
--
-- Privacidad y permisos: el estado de las migraciones no es información del
-- producto. RLS activo sin políticas y grants revocados a anon/authenticated:
-- sólo el SQL Editor (dueño) y service_role lo ven. Supabase concede permisos
-- por defecto en `public`, así que el revoke es explícito.
-- =====================================================================

create table if not exists public._applied_migrations (
  version    text        primary key,
  applied_at timestamptz not null default now(),
  note       text
);

comment on table public._applied_migrations is
  'Registro de migraciones ejecutadas. Cada archivo desde 0028 inserta su versión al final. No se rellena el pasado.';

alter table public._applied_migrations enable row level security;

revoke all on public._applied_migrations from anon, authenticated;

-- Esta migración se registra a sí misma.
insert into public._applied_migrations (version, note)
values ('0028', 'crea el ledger; no rellena 0001-0027')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------
-- CONVENCIÓN para toda migración nueva:
--
--   insert into public._applied_migrations (version)
--   values ('00XX')
--   on conflict (version) do nothing;
--
-- como última sentencia del archivo, con su propio número.
-- `npm test` (lib/migrations.test.ts) falla si un archivo desde 0028 no lo
-- hace, así que no depende de que alguien se acuerde.
-- ---------------------------------------------------------------------

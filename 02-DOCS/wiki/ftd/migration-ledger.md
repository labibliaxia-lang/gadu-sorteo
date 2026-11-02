---
author: Gadu
branch: main
status: in-progress
---
# Ledger de migraciones: que se registre lo que corrió

## Intent

Último `AVISO` del verificador de esquema. El hallazgo #2 fue una migración aplicada a medias —la función
del trigger estaba y el trigger no— sin ninguna forma de saberlo, porque el proyecto no tenía registro de
ejecución (`supabase_migrations` no existe: se aplica a mano en el SQL Editor).

El ledger cierra eso para adelante. **No rellena el pasado**: las versiones 0001-0027 no tienen fila porque
nadie las anotó cuando corrieron, e inventarlas sería un ledger que miente — peor que no tenerlo. Para el
pasado la garantía es el verificador, que comprueba objetos en lugar de promesas.

## Scope

**In:** `0028_migration_ledger.sql` (tabla, RLS sin políticas, grants revocados a `anon`/`authenticated`,
registro de sí misma); un test en `lib/migrations.test.ts` que obliga a toda migración desde `0028` a
registrarse.

**Out:** backfill de 0001-0027; comparar el ledger con el repositorio desde SQL (el verificador no ve git);
migrar a `supabase db push`.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | La tabla no es visible para `anon` ni `authenticated` | RLS sin políticas + `revoke all` |
| 2 | `0028` se registra a sí misma | Leer el archivo |
| 3 | Una migración futura sin registro rompe `npm test` | Test mutado a propósito |
| 4 | El test no puede pasar por vacío | `expect(files.length).toBeGreaterThan(0)` |
| 5 | Gates verdes | typecheck, lint, 38 tests, build |

## Evidence

**1 — escrito, no ejecutado.** `alter table … enable row level security` + `revoke all … from anon,
authenticated`. Sin políticas, RLS bloquea todo salvo al dueño y a `service_role` (que tiene BYPASSRLS).

**2 — observed by reading.** `insert into public._applied_migrations (version, note) values ('0028', …)
on conflict (version) do nothing;`.

**3 — observed, y es lo importante.** Quité el `insert` de `0028` y el test falló nombrando el archivo:

```text
× toda migración desde 0028 se registra en el ledger
  → expected [ '0028_migration_ledger.sql' ] to deeply equal []
```

Restaurado el archivo: `Tests 6 passed`. El gate muerde en las dos direcciones.

**4 — observed by reading.** El test exige `files.length > 0` antes de comparar, así que un lector roto no
lo haría pasar por vacío.

**5 — observed.** `npm run typecheck` → 0 · `npm run lint` → sin warnings · `npm test` → 4 archivos, 38
tests · `npm run build` → exit 0.

**Lo que seguía sin observarse:** la migración no estaba aplicada. **Ya está** — `0028` corrió y el
verificador quedó limpio:

```text
OK      trigger prevent_role_self_update (0014)
OK      trigger prevent_sensitive_self_update (0025)
OK      prevent_sensitive_self_update controla el plan
OK      no depende del rol de conexión
OK      prevent_sensitive_self_update es SECURITY INVOKER
OK      tablas del dominio presentes
OK      RLS activo en todas las tablas presentes
OK      funciones clave presentes
OK      sell_numbers: sólo service_role
OK      auditoría legible sólo por superadmin
OK      sin política de auditoría para organizadores
OK      superadmin_metrics (0025)
OK      licencias: tabla y RPC presentes (0022)
OK      índices de métricas presentes (0025)
OK      columnas sensibles presentes (plan, KYC, solicitudes)
OK      ledger de migraciones presente (public._applied_migrations)
OK      visitas: sólo se aceptan de sorteos activos (0027)
```

17 `OK`, 0 `AVISO`. Es la primera corrida del verificador sin nada pendiente: el repositorio, la base y el
registro de lo que corrió coinciden.

## Next

Aplicar `0028` y correr `verificar_esquema.sql`: la comprobación 16 pasa a `OK` y quedan **17 `OK`, 0
`AVISO`**. Desde ahí, toda migración nueva termina con su `insert` — vigilado por `npm test` y por el CI.

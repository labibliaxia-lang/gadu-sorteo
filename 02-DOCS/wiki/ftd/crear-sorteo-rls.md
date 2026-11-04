---
author: Gadu
branch: main
status: in-progress
---
# Crear sorteo: "new row violates row-level security policy" (raffles)

## Intent

Al crear un sorteo desde `/admin/sorteos/nuevo`, la base rechaza el alta con:

```text
new row violates row-level security policy for table "raffles"
```

Hay que dejar de adivinar entre «falta la política», «el front no manda el dueño» y
«la cuenta no es organizadora»: el repositorio ya declara la política correcta y el
formulario ya manda `created_by`, así que la causa está en la base o en la sesión.

## Scope

**In:** diagnóstico de la base (`diagnostico_crear_sorteo.sql`), reparación
idempotente de las políticas/funciones de escritura del panel (0065), mensaje de
error accionable en el formulario, comprobación de la migración en
`estado_migraciones.sql`.

**Out:** el algoritmo, pagos, sorteos en vivo, el modelo de roles y cualquier
política que no sea de `raffles`/`raffle_numbers`/`prizes`/`payments`.

## What the repo already declares

- `0041_rls_close.sql`: borra **todas** las políticas de las cuatro tablas y las
  recrea. La de alta es `raffles_insert_owner`:
  `with check (public.is_admin() and created_by = auth.uid())`.
- `0014_superadmin_role.sql`: `is_admin()` incluye `admin` y `superadmin`.
- `app/admin/sorteos/nuevo/page.tsx`: manda `created_by: user.id` desde el inicio
  del proyecto.
- `app/admin/layout.tsx`: solo deja entrar si `profiles.role` es `admin` o
  `superadmin`.

Con las cuatro piezas presentes, el alta de un organizador pasa. Si falla, alguna
no está en la base o la sesión cambió de cuenta.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El error crudo ya no se muestra: se traduce a una acción | Leer `onSubmit` en el formulario |
| 2 | Al enviar se revalida el rol de la sesión | Query a `profiles` antes del insert |
| 3 | Script de diagnóstico: políticas, `is_admin()`, grants, cuentas, ledger | Corrida real (2026-11-04) |
| 4 | Migración 0065 idempotente que deja la base como 0041 | Corrida real + diagnóstico en OK |
| 5 | Un sorteo de prueba se crea desde el panel | Alta real |
| 6 | `estado_migraciones.sql` avisa si la política de INSERT falta | Corrida real |

## Evidence

**1-2 — observed by reading.** `app/admin/sorteos/nuevo/page.tsx`: antes del
`insert` se lee `profiles.role` de la sesión actual; si no es `admin`/`superadmin`
el formulario explica qué hacer. Un error de RLS deja `userId`, `role` y el mensaje
crudo en `console.error`, y muestra una acción en vez de `42501`.

**3 — observed (2026-11-04).** Corrida real de `diagnostico_crear_sorteo.sql` en el
SQL Editor del proyecto:

```text
OK      RLS activo en public.raffles
OK      política(s) de INSERT: raffles_insert_owner
OK      la política de INSERT exige is_admin() y created_by = auth.uid()
CRÍTICO is_admin() sólo reconoce admin: un superadmin no puede crear sorteos (aplicá 0065)
OK      owns_raffle(uuid) presente
OK      authenticated puede INSERT en raffles (DELETE, INSERT, SELECT, UPDATE)
INFO    cuentas de panel: auja.costura@gmail.com = admin | cryptopintura@gmail.com = admin |
        23btc2140@gmail.com = superadmin | labibliaxia@gmail.com = superadmin
OK      0041 figura en el ledger (última: 0064)
```

**Causa confirmada.** En la base, `is_admin()` sigue siendo la versión de 0001
(sólo `role = 'admin'`); la actualización de 0014 nunca llegó. El dueño entra como
`superadmin`, así que pasa el portón del panel y falla en la política de INSERT.
Lo aplicado a medias fue 0014; 0041 sí está entero (política, grants y
`owns_raffle` en OK). El fix es sólo `is_admin()`/`is_superadmin()`.

**4 — observed (2026-11-04).** `0065` aplicada en el SQL Editor. El diagnóstico
volvió a correr con **todas las líneas en OK**, incluida
`OK is_admin() incluye superadmin (0014)`, y el ledger quedó en `última: 0065`.
Falta la prueba real de alta desde el panel (tarea 5).

**Contexto observado en vivo (2026-11-04, solo lectura con la anon key).** El
deploy de `gadu-sorteo-doci.vercel.app` usa el proyecto `mjgcoeikcyzwojbqtuah` y la
publishable key (misma base que `.env.local`). `public.raffles` responde con 7
sorteos, todos de `aabe1854-…`, y `public_organizers` lista 4 cuentas con
`role='admin'`. O sea: la lectura pública funciona y el rol del panel existe; lo que
no se puede leer sin SQL es `pg_policies`.

**La deriva ya ocurrió en este proyecto.** `02-DOCS/wiki/ftd/profiles-trigger-role-independent.md`
documenta que 0025 se aplicó a medias (la función existía, el trigger no). Las
migraciones se aplican a mano en el SQL Editor, así que una política ausente o
vieja es un modo de falla conocido, no una hipótesis exótica.

## Next

1. Correr `diagnostico_crear_sorteo.sql` en el SQL Editor y mirar si hay CRÍTICO.
2. Si hay CRÍTICO: aplicar `0065_reassert_admin_write_policies.sql`, volver a correr
   el diagnóstico y crear un sorteo de prueba.
3. Si todo da OK: el problema es la cuenta/sesión con la que se entra; comprobar el
   email en la línea 7 del diagnóstico.
4. Si se confirma, cerrar este artículo con la corrida real y el alta de prueba.

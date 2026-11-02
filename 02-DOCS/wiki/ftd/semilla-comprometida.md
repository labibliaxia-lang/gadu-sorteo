---
author: Gadu
branch: main
status: in-progress
---
# Prueba de imprevisibilidad: semilla comprometida (commit-reveal)

## Intent

Con las huellas de 0033 se podía probar que el resultado no se modificó después del sorteo, pero no
que el ganador no se hubiera elegido a dedo. Este cambio agrega el compromiso previo: el organizador
publica el hash de una semilla secreta generada por el servidor **antes** de sortear; al sortear se
revela la semilla y cualquiera puede recomputar el ganador. Sin compromiso, el sorteo falla cerrado.

## Scope

**In:**

- `supabase/migrations/0034_draw_seed_commitment.sql`:
  - `raffle_draw_secrets`: semilla secreta por sorteo, RLS sin políticas y grants revocados a
    anon/authenticated (solo funciones SECURITY DEFINER y service role).
  - `commit_draw_seed(uuid)`: genera la semilla en el servidor (dos UUID v4), guarda el compromiso
    SHA-256 y lo publica en `raffles.draw_commitment`. Solo dueño o superadmin, antes de sortear y
    una sola vez.
  - `draw_winner` re-creada: exige compromiso, elige al ganador de forma determinística a partir de
    la semilla y del listado vendido ordenado, revela la semilla y guarda las huellas de 0033.
  - Trigger: el compromiso no cambia una vez publicado; el resultado y la semilla revelada quedan
    congelados cuando el sorteo está `drawn`.
- `lib/types.ts`: columnas nuevas del compromiso y la semilla.
- `components/RaffleActions.tsx` + `app/admin/sorteos/[id]/actions.ts` +
  `app/admin/sorteos/[id]/page.tsx` y `app/admin/page.tsx`: botón «Publicar compromiso del sorteo» y
  el de sortear solo aparece cuando el compromiso existe.
- `app/sorteos/[id]/page.tsx`: compromiso visible antes del sorteo; después, compromiso + semilla
  revelada + huellas, con el instructivo completo de verificación.
- Textos: `/como-funciona` y el punto 5 de `/terminos` describen el compromiso y la revelación.

**Out:** cambios en el mecanismo de azar más allá del origen del número aleatorio; verificación
automática en el navegador (el instructivo es manual); y cualquier modificación al flujo de compras
prepago, pagos o Sentry.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Semilla secreta inaccesible para el cliente | Lectura de 0034 |
| 2 | Compromiso publicado antes del sorteo, único e inmutable | Lectura de 0034 + trigger |
| 3 | Sorteo determinístico desde semilla + listado vendido | Lectura de `draw_winner` |
| 4 | Sin compromiso no se puede sortear | Lectura de `draw_winner` + UI |
| 5 | Página pública muestra compromiso, semilla e instructivo | Lectura + build |
| 6 | Textos coherentes con el mecanismo | Lectura de /como-funciona y /terminos |
| 7 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado en el código.** `raffle_draw_secrets` tiene RLS activo sin políticas y
`revoke all ... from public, anon, authenticated`; solo `service_role` tiene grant. La leen
`commit_draw_seed` y `draw_winner`, que son SECURITY DEFINER.

**2 — observado.** `commit_draw_seed` exige rol, dueño (o superadmin), estado `active|closed`, y que
no exista compromiso previo; genera la semilla con `gen_random_uuid()` (dos UUID v4 = 256 bits) y
publica `sha256("gadu:v1|raffle:<id>|seed:<seed>")` en `raffles.draw_commitment`. El trigger rechaza
cambiar el compromiso una vez publicado.

**3 — observado.** `draw_winner` lee la semilla, arma el listado canónico de vendidos, calcula
`pick = sha256("gadu:v1|raffle:<id>|seed:<seed>|numbers:<lista>")`, toma los primeros 15 hex como
entero (60 bits, siempre positivo), aplica `% N` y elige esa posición del listado ordenado. Guarda la
semilla revelada y las huellas `numbers_hash`/`result_hash`.

**4 — observado.** Si no hay compromiso, `draw_winner` lanza «El sorteo no tiene compromiso
publicado»; la UI muestra «Publicar compromiso del sorteo» y recién después el botón de sortear.

**5 — observado.** La página pública muestra el compromiso antes del sorteo y, después, compromiso +
semilla + huellas + instructivo (verificar el compromiso, recomputar el ganador con la semilla,
verificar las dos huellas).

**6 — observado.** `/como-funciona` explica el compromiso previo y la revelación; el punto 5 de
Términos lo describe como parte del motor.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente de observación real.** Aplicar `0034` en Supabase. A partir de ahí, los sorteos activos
necesitan publicar el compromiso antes de sortear; los ya sorteados no cambian.

## Next

Aplicar `0034`, publicar el compromiso de un sorteo de prueba, sortear y verificar el ganador a mano
con la semilla revelada. Después queda la verificación automática en la página (pegar la semilla o el
listado y recalcular en el navegador) para que no haga falta usar una terminal.

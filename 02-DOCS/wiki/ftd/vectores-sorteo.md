---
author: Gadu
branch: main
status: in-progress
---
# Vectores fijos de la fórmula del sorteo

## Intent

Detectar que el motor real, el simulador o el verificador se separen con el tiempo. Un seed y un
listado fijos producen hashes y ganador conocidos: si alguien cambia el dominio, el orden del listado
o el índice, los tests fallan.

## Scope

**In:**

- `lib/draw-verify.ts`: fórmula pública extraída a una función pura (`computeDrawVerification`), con
  `sha256Hex`, lista canónica y parseo de números.
- `components/DrawVerifier.tsx`: ahora usa esa función; el test cubre el mismo código que corre en el
  navegador.
- `lib/draw-verify.test.ts`: 5 tests con vectores fijos, orden/deduplicado, cambio de un número,
  lista vacía y parseo.
- `supabase/tests/draw_vectors.sql`: el mismo vector ejecutado en Postgres para comprobar la fórmula
  de la base.

**Out:** motor `draw_winner`, simulador, datos y UI. No se cambió ningún cálculo.

## Vectores

- raffle: `11111111-1111-4111-8111-111111111111`
- seed: `0123456789abcdef` × 4
- números: `1,2,3,5,8,13,21,34,55,89`
- commitment: `7ccb8442…f6861eca`
- numbers_hash: `ddc1ff15…33610561`
- índice: `4` · ganador: `8`
- result_hash: `ed4a7e96…dccfe53`

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Test de vectores en Vitest | 5 tests nuevos |
| 2 | Mismo código que el verificador real | `DrawVerifier` importa la lib |
| 3 | Vector equivalente para Postgres | `supabase/tests/draw_vectors.sql` |
| 4 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** `npm test` pasa **43 tests** (antes 38). El test compara compromiso, ambas
huellas, índice y ganador; también verifica que cambiar un número cambia las huellas y que una lista
vacía no devuelve ganador.

**3 — observado.** El script SQL calcula los mismos valores con `sha256` de Postgres y lanza excepción
si alguno difiere; termina con `OK` cuando coinciden.

**4 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 43/43. `npm run build` → 0.

**Pendiente.** Correr el script SQL en Supabase; no forma parte de los gates automáticos.

## Next

Ejecutar `supabase/tests/draw_vectors.sql`, usar el simulador en dos fases y, para el motor real,
probar en staging con un sorteo de 1–2 números.

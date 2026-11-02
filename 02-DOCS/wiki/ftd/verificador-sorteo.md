---
author: Gadu
branch: main
status: in-progress
---
# Verificador del sorteo en el navegador

## Intent

La prueba de imprevisibilidad existía, pero para comprobarla había que usar Node o una terminal. Eso
la dejaba fuera del alcance de un comprador. Este cambio agrega un verificador en la página de cada
sorteo finalizado: toma lo publicado (semilla revelada, compromiso, huellas, ganador) y el listado
vendido, y recomputa todo con Web Crypto en el navegador, sin consultar la base.

## Scope

**In:**

- `components/DrawVerifier.tsx`: componente cliente. Prellena el listado vendido, permite editarlo o
  pegar otro, y al comprobar calcula SHA-256 del compromiso, del listado, del resultado y del
  ganador; muestra un check por cada comparación y los valores calculados.
- `app/sorteos/[id]/page.tsx`: carga el listado vendido (solo números, público por RLS) y monta el
  verificador dentro de la sección de huellas de un sorteo `drawn` con semilla y compromiso.
- `app/como-funciona/page.tsx`: menciona el verificador automático.

**Out:** cambios en la migración, en el motor de sorteo o en el panel. No se toca Sentry.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Recomprobar el compromiso con la semilla revelada | Lectura del componente |
| 2 | Recomprobar el ganador con la fórmula de 0034 | Lectura del componente |
| 3 | Recomprobar `numbers_hash` y `result_hash` | Lectura del componente |
| 4 | Permitir pegar otro listado para detectar manipulación | Estado del textarea |
| 5 | No perder precisión en el índice de 60 bits | Uso de `BigInt` |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2, 3 — observado.** El componente calcula:
`sha256("gadu:v1|raffle:<id>|seed:<seed>")`, `sha256(...|numbers:<lista>)`,
`sha256(...|winner:<n>|numbers:<lista>)` y `sha256(...|seed:<seed>|numbers:<lista>)`; el índice es
`BigInt("0x" + pick.slice(0,15)) % N` y el ganador es la posición del listado ordenado. Compara los
cuatro resultados con lo publicado y muestra check por check.

**4 — observado.** El listado está en un textarea editable: cambiar o quitar un número hace fallar las
huellas y/o el ganador, que es exactamente la demostración de manipulación. El botón «Restaurar
listado oficial» vuelve a los números que trae la página.

**5 — observado.** El índice se calcula con `BigInt`, no con `parseInt`: la base usa 60 bits y
supera el entero seguro de JS (2^53), así que `parseInt` habría producido falsos negativos.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0; `/sorteos/[id]` 7.64 kB.

**Límite conocido.** `crypto.subtle` existe solo en contextos seguros (https o localhost); en un
entorno http la verificación muestra el mensaje de error correspondiente.

## Next

Probar el verificador en un sorteo real ya sorteado con semilla (posterior a 0034). Si se quiere ir
más lejos: un botón para copiar el listado y un enlace permanente a un verificador externo.

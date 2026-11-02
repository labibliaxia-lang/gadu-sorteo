---
author: Gadu
branch: main
status: in-progress
---
# Huellas verificables del sorteo

## Intent

La página «Cómo funciona» y los Términos prometían transparencia verificable, pero el motor no
publicaba ninguna evidencia: el ganador se elegía al azar y el resultado quedaba congelado por un
trigger, sin nada que un tercero pudiera recomprobar. Este cambio agrega huellas SHA-256 del listado
vendido y del resultado, las congela con el sorteo y las muestra en la página pública con el paso a
paso para verificarlas.

## Scope

**In:**

- `supabase/migrations/0033_draw_hashes.sql`: columnas `numbers_hash`, `result_hash` y `hashes_at`;
  `draw_winner` calcula las huellas al sortear; el trigger de congelamiento también las protege.
  Falla con mensaje claro si el PostgreSQL no expone `sha256()` (14+).
- `lib/types.ts`: los tres campos nuevos en `Raffle`.
- `app/sorteos/[id]/page.tsx`: sección «Huellas del sorteo (verificable)» con las dos huellas, la
  fecha y el instructivo de recomputación.
- Textos: `/como-funciona` deja de decir «en camino» y explica la verificación real; el punto 5 de
  `/terminos` describe las huellas publicadas.

**Out:** commit-reveal con semilla previa (prueba de imprevisibilidad, no solo de inmutabilidad),
verificador interactivo en el navegador, y cualquier cambio en la mecánica del azar: el ganador se
sigue eligiendo con `order by random()` entre los vendidos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El sorteo guarda huellas del listado y del resultado | Lectura de 0033 |
| 2 | El resultado y las huellas quedan congelados | Trigger de 0033 |
| 3 | La página pública muestra las huellas y cómo verificar | Lectura de la página + build |
| 4 | Textos legales y de ayuda coherentes con lo implementado | Lectura de /como-funciona y /terminos |
| 5 | Sin migración, la página sigue funcionando (no muestra la sección) | Condición `raffle.numbers_hash` |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2 — observado en el código.** `draw_winner` arma el listado canónico
(`string_agg(number::text, ',' order by number)` de los `sold`), calcula
`numbers_hash = SHA-256("gadu:v1|raffle:<id>|numbers:<lista>")` y
`result_hash = SHA-256("gadu:v1|raffle:<id>|winner:<n>|numbers:<lista>")`, y los guarda junto al
ganador. El trigger `prevent_drawn_raffle_changes` ahora rechaza cambios de `numbers_hash`,
`result_hash` y `hashes_at` cuando el sorteo está `drawn`.

**3 — observado.** `app/sorteos/[id]/page.tsx` muestra una sección solo cuando el sorteo está
`drawn` y tiene ambas huellas: fecha de cálculo, id del sorteo, las dos huellas con `break-all` y un
desplegable «Cómo verificarlo» con el formato exacto y los pasos.

**4 — observado.** `/como-funciona` cambió «Verificación con hashes: en camino» por la explicación
real (qué se hashea, dónde verlo, qué prueba y qué no); el punto 5 de Términos dice que se publican
las huellas y cualquiera puede recalcularlas.

**5 — observado.** La sección está condicionada a `raffle.numbers_hash && raffle.result_hash`: si la
migración no está aplicada, los sorteos nuevos no las tienen y la página no muestra nada. No rompe el
flujo de sorteo existente (la firma de `draw_winner` no cambió).

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0; `/sorteos/[id]` 6.92 kB.

**Pendiente de observación real.** Aplicar `0033` en Supabase y sortear un sorteo de prueba: la
página del sorteo debe mostrar las huellas, y recalcularlas con el listado vendido debe coincidir. La
prueba fuerte (impredictibilidad) requiere el commit-reveal con semilla, que queda para otra iteración.

## Next

Aplicar `0033`, sortear un sorteo de prueba y verificar la huella con el listado. Después: commit-reveal
con semilla comprometida antes del cierre del sorteo, para probar además que el ganador no se pudo
elegir.

---
author: Gadu
branch: main
status: in-progress
---
# Fase 2b — Detalle del sorteo y grid de números

## Intent

Cerrar la Fase 2 con una jerarquía clara en el detalle (premio → confianza → números → pago) y un
grid más legible y táctil, manteniendo intactas las reservas y el prepago.

## Scope

**In:**

- `app/sorteos/[id]/page.tsx`:
  - Portada con radio mayor, borde, sombra y overlay; badges de estado y modo de sorteo sobre la
    imagen, más sello «Resultado verificable».
  - Columna derecha con eyebrow, título display, descripción, caja de fecha/precio, explicación del
    modo manual/automático y **barra de progreso real** (vendidos/total).
  - CTA principal «Elegir mis números» que ancla al grid cuando el sorteo está activo; «Verificar
    resultado» y «Sala en vivo» según estado.
  - Bloque de ganador con trofeo y número en monoespaciada.
- `components/NumbersGrid.tsx`:
  - Encabezado «Tocá un número…» y contador de disponibles sobre el total.
  - Leyenda de estados en una tarjeta con borde, no suelta.
  - Grid con borde/sombra de sistema, hover ámbar y contador de selección con `aria-live`.
  - Se mantiene el tamaño táctil de 44 px, la virtualización y la barra sticky.

**Out:** lógica de reservas, prepago, pagos, sorteo y datos. No se agregaron dependencias.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Jerarquía del detalle clara | Portada + info + CTA + progreso |
| 2 | Modo de sorteo visible | Badge sobre la portada |
| 3 | Progreso real | Conteos `head: true` |
| 4 | Grid más legible | Encabezado, leyenda y contador |
| 5 | Accesibilidad de selección | `aria-live` + etiquetas existentes |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2, 3 — observado.** La portada muestra estado y modo; la caja de fecha/precio y la barra de
progreso usan los conteos vendidos/total. El CTA apunta a `#elegir-numeros`, que ya existe en la
sección del grid.

**4, 5 — observado.** El grid muestra disponibles/total, una leyenda con borde y el resumen de
selección con `aria-live="polite"`. Los botones conservan `aria-label` por número y 44 px de alto en
móvil.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Ver el detalle en 375/768/1280 después del deploy y confirmar que el CTA ancla bien
con el navbar sticky.

## Next

Fase 3: tablas y paneles de admin con el patrón tabla→tarjetas.

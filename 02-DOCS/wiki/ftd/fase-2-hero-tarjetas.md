---
author: Gadu
branch: main
status: in-progress
---
# Fase 2 — Hero, tarjetas públicas y muro de ganadores

## Intent

Que la home venda en los primeros segundos y que cada tarjeta pública muestre lo importante de un
sorteo (premio, fecha, precio, progreso y estado) con la identidad de la Fase 1.

## Scope

**In:**

- `app/page.tsx`:
  - Hero nuevo en dos columnas: mensaje con eyebrow de transparencia y CTA principal único.
  - Tablero visual con un **sorteo real destacado** (portada, título, fecha, precio, progreso y modo
    manual/automático). En móvil se muestra una versión compacta.
  - Progreso real por sorteo: vendidos y total generado, calculado en el servidor (máx. 24 sorteos).
  - Fila de prueba social con los mismos números reales de antes.
- `components/RafflesList.tsx`:
  - Tarjetas con portada 4:3, overlay, estado, modo de sorteo, precio, barra de progreso
    («X de Y vendidos · %») y CTA contextual.
  - Filtros con el amarillo de marca y estado vacío reutilizable.
- `app/ganadores/page.tsx`:
  - Encabezado con la identidad nueva, tarjetas con overlay, badge «Verificado» cuando hay hash y
    número ganador en monoespaciada.
  - Dos acciones: ver el sorteo y verificar el resultado. Estado vacío reutilizable.

**Out:** lógica de reservas, pagos, sorteo y datos. El detalle del sorteo y el grid conservan su
funcionamiento; su pulido fino queda para 2b.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Hero vende con un sorteo real | Featured con datos de la base |
| 2 | Progreso real en hero y tarjetas | Consultas `rafle_numbers` |
| 3 | Tarjetas con estado/precio/progreso | `RafflesList` |
| 4 | Ganadores con verificación visible | Badge + link a `/verificar` |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** El hero toma el primer sorteo activo (o el primero disponible) y muestra su
portada, fecha, precio, vendidos/total y el modo de sorteo. Si no hay ninguno, muestra un estado
«próximamente». El progreso se calcula con conteos `head: true`, sin traer todos los números.

**3 — observado.** Las tarjetas muestran barra y porcentaje cuando hay estadísticas; si un sorteo no
tiene números generados, simplemente omiten la barra. El CTA cambia según estado: Participar / Ver
detalles / Ver resultado.

**4 — observado.** El muro trae `numbers_hash` y muestra «Verificado» solo cuando existe; el link a
`/verificar` está junto al del sorteo.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Ver la home en 375/768/1280 después del deploy y ajustar el hero si el sorteo
destacado no tiene portada.

## Next

Pulir el detalle del sorteo y el grid (2b) o pasar a la Fase 3 (tablas y paneles de admin).

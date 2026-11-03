---
author: Gadu
branch: main
status: in-progress
---
# Comparativa de conversión entre sorteos

## Intent

Que el organizador pueda comparar sus sorteos por conversión y ventas, no solo por recaudación, y
corregir de paso la fuente de datos: la analítica global calculaba sobre `payments`, que en prepago
manual queda vacía.

## Scope

**In:**

- `app/api/admin/analytics/route.ts`: la fuente de ventas pasa a ser `raffle_numbers` en estado
  `sold`; visitas desde `raffle_visits`; reservados desde `raffle_numbers`. Incluye por sorteo:
  visitas, vendidos, reservados, conversión reserva→venta y conversión visita→venta; la serie diaria
  y la comparativa con el período anterior usan las mismas definiciones.
- `components/admin/AdvancedAnalytics.tsx`:
  - KPIs con etiquetas reales: «Ventas confirmadas», «Ticket promedio», «Conversión visitas→venta».
  - Embudo visitas → participaciones → ventas.
  - Gráfico «Ventas confirmadas por día».
  - Tabla «Comparativa de conversión por sorteo» con visitas, participaciones, ventas, conversión y
    recaudación.
  - Exportación CSV con las mismas columnas.

**Out:** pagos, reservas, motor, base de datos y permisos del endpoint (sigue Premium/superadmin con
RLS y scope por `created_by`).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Ventas desde números `sold`, no desde payments | Endpoint |
| 2 | Conversión por sorteo | Campos `conversion` y `visitConversion` |
| 3 | Tabla comparativa completa | Componente |
| 4 | Serie diaria coherente | `sold_at` agrupado por día BA |
| 5 | Comparativa contra período anterior | misma definición de ventas |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** El endpoint ya no lee `payments` para las métricas de venta; suma vendidos por
sorteo y calcula ingresos como `vendidos × precio`. Eso hace visibles las ventas por transferencia.

**2, 3 — observado.** `byRaffle` devuelve `visits`, `sold`, `reserved`, `conversion`
(ventas / participaciones) y `visitConversion` (ventas / visitas). La tabla los muestra con la
recaudación y ordena por ingresos.

**4, 5 — observado.** La serie diaria y la comparación previa usan `sold_at` y la misma tabla de
precios; las visitas previas salen de `raffle_visits`.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Límites honestos.** Las visitas son por pestaña/render (no personas únicas) y el tracking empezó
recién; la conversión de sorteos viejos será baja o nula hasta que acumulen visitas. La comparativa
previa no puede calcular reservas históricas (no se guarda `reserved_at`), por eso compara ventas y
visitas.

## Next

Probar con dos sorteos reales que tengan ventas; después, seguir con el backlog legal/operativo.

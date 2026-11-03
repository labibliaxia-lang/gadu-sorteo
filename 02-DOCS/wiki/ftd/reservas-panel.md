---
author: Gadu
branch: main
status: in-progress
---
# Panel de reservas del organizador

## Intent

Que confirmar comprobantes del prepago sea rápido y legible en el celular: resumen arriba, cada
comprador como tarjeta y la acción de marcar pagado sin ambigüedad.

## Scope

**In:**

- `components/ReservedNumbersPanel.tsx`:
  - Resumen de reservas, números reservados y total estimado.
  - Estado vacío reutilizable.
  - Tarjetas con nombre en tipografía de títulos, números en chips de marca, vencimiento de la
    reserva con ícono y borde verde cuando el comprobante ya está tildado.
  - Comprobante y nota interna agrupados en un bloque; botón «Marcar como pagado» con la variante
    verde y ancho completo en móvil.
  - Acción masiva «Marcar verificadas» alineada y en verde.

**Out:** Server Actions, auditoría, ventana de 10 minutos, cálculos y lógica de reservas. No se tocó
ningún flujo de pago.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Resumen de reservas | 3 métricas calculadas en cliente |
| 2 | Tarjetas legibles en móvil | Layout apilado |
| 3 | Números y vencimiento claros | Chips + ícono |
| 4 | Acción principal inequívoca | Botón verde full-width |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** Se calculan `totalNumbers` y `totalAmount` a partir de los grupos; se muestran en
tres tarjetas arriba del buscador.

**2, 3 — observado.** Cada reserva es una tarjeta con nombre, cantidad, total, vencimiento y chips de
números; el borde cambia a verde al tildar «Comprobante recibido».

**4 — observado.** El botón de marcar pagado usa la variante `success`, queda deshabilitado hasta
tildar el comprobante y ocupa todo el ancho en móvil. La acción masiva mantiene su confirmación.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Probar en 375 px con al menos dos reservas reales y verificar el undo de 10 minutos.

## Next

QA visual final de las pantallas públicas o ajustes de densidad del dashboard.

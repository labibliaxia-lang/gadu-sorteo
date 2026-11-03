---
author: Gadu
branch: main
status: in-progress
---
# Fase 3 — Analytics con el patrón tabla→tarjetas

## Intent

Aplicar el sistema de diseño y el patrón responsive a la analítica Premium: KPIs consistentes,
gráfico legible en móvil y comparativa por sorteo que no obligue a hacer scroll horizontal.

## Scope

**In:**

- `components/admin/AdvancedAnalytics.tsx`:
  - KPIs con íconos en chips del sistema (sin degradés distintos por tarjeta) y valores en
    `font-display`.
  - Gráfico de recaudación: en móvil muestra los **últimos 7 días**; en desktop, todo el período.
    Barras con el amarillo de marca.
  - Comparativa por sorteo migrada a `ResponsiveTable`: tabla en desktop, una tarjeta por fila en
    móvil, con estado vacío reutilizable.
  - Números y porcentajes en monoespaciada.

**Out:** endpoint de analytics, cálculos, planes y permisos. No se tocó la API ni la base.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | KPIs unificados | Chips de color del sistema |
| 2 | Gráfico legible en móvil | Últimos 7 días |
| 3 | Tabla→tarjetas en analytics | `ResponsiveTable` |
| 4 | Estado vacío | `EmptyState` |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** Los cuatro KPI usan chips `brand`, `emerald`, `steel` y `violet` en baja opacidad,
sin degradés; los valores usan la tipografía de títulos.

**2 — observado.** `mobileDaily` toma los últimos 7 puntos y se renderiza en un contenedor visible solo
bajo `sm`; el gráfico completo queda para desktop. Ambos usan la misma altura relativa.

**3, 4 — observado.** La tabla manual se reemplazó por `ResponsiveTable` con las mismas columnas
(Sorteo, Estado, Visitas, Particip., Ventas, Conv., Recaudación). En móvil cada fila es una tarjeta y
el vacío muestra un `EmptyState`.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Ver analytics en 375/768 con una cuenta Premium y confirmar que los 7 días móviles no
cortan etiquetas.

## Next

Fase 3 en superadmin: tablas de usuarios/auditoría a tarjetas en móvil y jerarquía de acciones.

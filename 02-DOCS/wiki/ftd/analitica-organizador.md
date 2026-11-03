---
author: Gadu
branch: main
status: in-progress
---
# Analítica por sorteo para el organizador

## Intent

Convertir el panel en herramienta de negocio: embudo visitas → participaciones → ventas, recaudación,
ticket promedio, ventas por día y distribución de números por sorteo. Además, activar el tracking de
visitas que existía en la base pero nunca se registraba.

## Scope

**In:**

- `components/RaffleVisitTracker.tsx` (nuevo): registra una visita por pestaña/sesión en
  `raffle_visits` (sin PII) desde la página pública del sorteo.
- `app/sorteos/[id]/page.tsx`: monta el tracker.
- `app/admin/sorteos/[id]/analitica/page.tsx` (nuevo): analítica del sorteo para el dueño o
  superadmin:
  - KPI: visitas, números vendidos, recaudación y compradores únicos.
  - Embudo: visitas → participaciones (reservas + ventas) → ventas, con tasas y ticket promedio.
  - Ventas por día de los últimos 14 días (gráfico CSS).
  - Distribución de ventas por bloque de 100 números y últimas ventas confirmadas.
- `app/admin/sorteos/[id]/page.tsx`: botón «Ver analítica».

**Out:** pagos, motor de sorteo, base de datos y el componente premium global de analíticas.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Las visitas se registran de verdad | Tracker + política de `raffle_visits` |
| 2 | Analítica por sorteo con embudo | Ruta `/admin/sorteos/[id]/analitica` en build |
| 3 | Solo dueño o superadmin | `owns_raffle` + `requireAdminSession` |
| 4 | Ventas por día y distribución | Cálculo en servidor |
| 5 | Enlace desde el panel | Botón «Ver analítica» |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** `RaffleVisitTracker` inserta en `raffle_visits` una vez por pestaña (sessionStorage);
la tabla y su política de insert anónimo ya existían en 0026, pero no había ningún punto de escritura
en la app, por eso las visitas del embudo siempre daban 0.

**2, 3 — observado.** La página valida sesión de admin, `owns_raffle` y devuelve 404 si no es dueño
(la función ya contempla superadmin). El build lista `/admin/sorteos/[id]/analitica`.

**4 — observado.** El servidor cuenta visitas, vendidos y reservados con `head: true`, trae los
vendidos con `sold_at` y calcula en JS días, compradores únicos, ticket promedio, tasas y bloques de
100.

**5 — observado.** El detalle del sorteo incorpora el botón «Ver analítica» en la fila de acciones.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Límite honesto.** Las visitas son por render/pestaña, no personas únicas: sirven para tendencia y
para comparar conversión, no como audiencia exacta. El tracking empieza desde este deploy, así que
los sorteos viejos mostrarán visitas desde ahora.

## Next

Wizard de creación de sorteos y, si se quiere, comparar conversión entre sorteos en el panel global.

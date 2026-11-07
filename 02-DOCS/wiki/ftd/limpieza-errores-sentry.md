---
author: Gadu
branch: main
status: done
---
# Limpieza de errores de Sentry (4 críticos)

## Intent

Dejar de ensuciar el proyecto de Sentry con los cuatro errores señalados después de la puesta en
producción de las fases de Live TV / Resultados, sin tocar la base ni la lógica de pagos.

## Hallazgos contra el código actual

El reporte original no estaba en el contexto de esta sesión. Antes de tocar nada se reconstruyó el
estado de cada punto contra el código y el historial de git.

| # | Reporte | Estado real | Acción |
|---|---|---|---|
| 1 | `NEXT_NOT_FOUND` en `/sorteos/[slug]/en-vivo` | El 404 por sorteo inexistente ya estaba (`if (!raffle) notFound()`). Faltaba cubrir sorteo cancelado/pausado y distinguir un error de lectura de un 404. | Guardas nuevas + filtro en Sentry. |
| 2 | Functions passed to Client Components en `/dev-chart` | La ruta `/dev-chart` no existe en el repo ni en el historial: era una página temporal de diagnóstico. El bug real de RSC (iconos de `lucide` pasados a `MetricBarChart`) ya se corrigió en `c8071c1`. Hoy ningún Server Component pasa funciones a un Client Component. | Verificado, sin cambio. |
| 3 | Async Client Component en `/como-funciona` | `/como-funciona` es un Server Component sincrónico. Un barrido de todo el repo no encontró ningún archivo con `"use client"` y `export default async function`. | Verificado, sin cambio. |
| 4 | Server Components render en `/admin/super` | El panel ya acumulaba errores de consulta en `issues`, pero no tenía red de contención para una excepción inesperada ni boundary de render. | `try/catch` en la página + `error.tsx`. |

## Cambios

- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`: `ignoreErrors` para
  `NEXT_NOT_FOUND`, `NEXT_REDIRECT` y `NEXT_HTTP_ERROR_FALLBACK`. Son control de flujo de Next, no
  fallos: el usuario recibe el 404/redirect correcto y Sentry deja de contarlos.
- `app/sorteos/[slug]/en-vivo/page.tsx`: parámetro vacío, sorteo inexistente, sorteo cancelado o
  pausado y error de lectura. La sala sigue viva para `active` y `closed`, que es donde se ejecuta y
  se mira el sorteo; 404 sólo para lo que nunca va a mostrar un resultado.
- `app/admin/super/page.tsx`: el cuerpo pasó a `SuperAdminPanel()`; el default export lo envuelve en
  `try/catch`, re-lanza los errores de control de Next y muestra un fallback legible si falla una
  consulta.
- `app/admin/super/error.tsx`: boundary de render con `reset()` y enlace de vuelta al panel.

## Fuera de alcance

Base de datos, migraciones, motor de sorteo, reservas y cualquier flujo de pago. No se tocaron.

## Evidencia

- `npm run typecheck` → 0.
- `npm run lint` → 0 warnings.
- `npm test` → 331/331.
- `npm run build` → 42/42 páginas, 0 errores. Se corrió con `distDir` aislado porque otra
  sesión estaba compilando sobre `.next` al mismo tiempo; el cambio de config se revirtió y el
  directorio temporal se borró.

## Nota

Los errores 2 y 3 no dejaron cambio de código porque ya estaban resueltos en el árbol actual; forzar
un parche ahí habría sido ruido. Lo que sí se corrigió es la causa del ruido de Sentry (errores de
control de Next) y la red de contención del panel.

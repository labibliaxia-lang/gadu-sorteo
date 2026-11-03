---
author: Gadu
branch: main
status: in-progress
---
# Sprint alto de UX (A1–A7)

## Intent

Reducir la fricción móvil y mejorar accesibilidad y percepción de confianza: compra siempre a mano,
temporizadores claros, modales accesibles, objetivos táctiles más grandes, contraste AA en estados y
prueba social con datos reales.

## Scope

**In:**

- **A1 · Barra sticky de compra** (`NumbersGrid`): al seleccionar números aparece una barra inferior
  fija con cantidad, total, contador y «Reservar» en móvil/tablet; el contenido suma padding para no
  quedar tapado.
- **A2 · Temporizadores claros**: el contador se etiqueta «Elegí en …» y el modal explica que ese
  tiempo es solo para elegir y que la reserva dura 48 h.
- **A3 · Modales accesibles**: `role="dialog"`, `aria-modal`, `aria-labelledby`, cierre con Escape y
  `max-h` con scroll en el resumen. (Foco atrapado completo queda pendiente.)
- **A4 · Contraste**: filtros activos con `amber-700` + blanco y badge de éxito con `green-700` +
  blanco.
- **A5 · Objetivos táctiles**: grid de 4 columnas en pantallas <480 px, botones de número de 44 px en
  móvil, botones `sm` de 40 px y navegación admin/menú móvil con más padding.
- **A6 · Prueba social honesta**: franja en la home con números vendidos, sorteos sorteados y
  organizadores, calculada en el servidor; enlaza a sorteos, ganadores y planes.
- **A7 · Checklist de publicación**: en el detalle del sorteo, cuatro pasos con estado
  (datos, números/premios, compromiso, sorteo).

**Out:** pagos, motor de sorteo, base de datos y el rediseño completo del wizard de creación.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Barra sticky móvil al seleccionar | `NumbersGrid` + build |
| 2 | Contador «Elegí en» y aclaración de 48 h | Lectura del grid y modal |
| 3 | Modales con rol/aria/Escape | Lectura de ambos overlays |
| 4 | Contraste de filtros y badges | `RafflesList`, `badge.tsx` |
| 5 | Tap targets 44 px en números y 40 px en botones sm | `button.tsx`, grid |
| 6 | Franja de prueba social en home | `app/page.tsx` |
| 7 | Checklist de 4 pasos en admin | Detalle del sorteo |
| 8 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1–5 — observado.** El build compila los cambios; el grid ahora usa 4 columnas bajo 480 px,
`h-11` en móvil y `estimateSize 52`; la barra fija aparece con `selected.size > 0` y la página suma
`pb-28` en móvil. Los modales suman atributos ARIA y cierre con Escape; el resumen tiene
`max-h-[90vh] overflow-y-auto`.

**4 — observado.** Filtro activo `bg-amber-700 text-white`; badge success `bg-green-700 text-white`.

**6, 7 — observado.** La home calcula contadores con `head: true` y muestra tres tarjetas con link;
el detalle admin muestra cuatro pasos con badge Listo/Pendiente y enlaces a números y premios.

**8 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** A8 (feedback de comprobante y deshacer en «Marcar como pagado»), foco atrapado en
diálogos y una pasada completa de contraste con herramienta. Probar en dispositivo real cuando Vercel
deploye.

## Next

A8 y accesibilidad fina; después wizard de creación real y analítica del organizador.

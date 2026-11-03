---
author: Gadu
branch: main
status: in-progress
---
# Accesibilidad: foco atrapado y contraste AA

## Intent

Cerrar los dos pendientes del sprint alto: que los diálogos se comporten como diálogos reales
(teclado y lectores de pantalla) y que los textos/estados más usados cumplan contraste AA en claro y
oscuro.

## Scope

**In:**

- `lib/use-focus-trap.ts` (nuevo): hook que atrapa el foco dentro del panel del diálogo, cicla con
  Tab/Shift+Tab, cierra con Escape, bloquea el scroll del body y devuelve el foco al elemento anterior.
- `components/NumbersGrid.tsx`: modales de login y de reserva usan el hook; se elimina el listener
  manual de Escape duplicado.
- `components/OrganizerOnboarding.tsx`: el tutorial usa el mismo hook y deja de manejar Escape a mano.
- Pasada de contraste: `text-amber-600` → `text-amber-800 dark:text-amber-300`,
  `text-emerald-600` → `text-emerald-700 dark:text-emerald-400`, botones
  `bg-emerald-600` → `bg-emerald-700` (`hover:bg-emerald-800`) y
  `bg-amber-500 text-white` → `bg-amber-700 text-white`.

**Out:** rediseño visual, cambios de lógica, pagos y motor.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El foco queda atrapado en el diálogo | Hook + refs en NumbersGrid/Onboarding |
| 2 | Escape cierra y devuelve el foco | Hook |
| 3 | Scroll del fondo bloqueado | Hook |
| 4 | Contraste de textos y botones principales | Clases reemplazadas |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1–3 — observado.** El hook registra un único listener; `Tab`/`Shift+Tab` ciclan entre los
focusables visibles, Escape llama al cierre y el cleanup restaura `overflow` y el foco previo. Los
modales de reserva/login y el onboarding pasan su panel como ref.

**4 — observado.** Reemplazo aplicado en 25 archivos de `app/` y `components/`; sin clases de dark
duplicadas (verificado con búsqueda). Quedan iconos decorativos y `text-amber-700` de enlaces con
subrayado, que no son texto crítico.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Verificación visual con herramienta de contraste en dispositivo real; el próximo paso
es analítica del organizador.

## Next

Analítica del organizador (embudo visita → reserva → pago, ventas por día, números más elegidos) y
después wizard de creación.

---
author: Gadu
branch: main
status: in-progress
---
# Home responsive: navbar y CTAs sin superposición

## Intent

Que los botones de la home no se pisen y que el header sea predecible con y sin sesión, en escritorio
y móvil.

## Scope

**In:**

- `components/Navbar.tsx`: en el área de cuenta, las etiquetas de texto y el nombre del usuario pasan
  de `xl:` a `2xl:`. Entre 1280 y 1535 px quedan sólo los íconos con `title`; en ≥1536 vuelven las
  etiquetas. Evita que el header con sesión iniciada se desborde y empuje el tema/menú.
- `app/page.tsx`:
  - Columna izquierda del hero con `min-w-0` y título con `break-words`.
  - CTAs en móvil a ancho completo y apilados; desde `sm` vuelven a fila.
  - Tarjeta destacada móvil a `w-full min-w-0`.

**Out:** lógica, datos y resto de componentes.

## Evidencia

Medido con Chrome real (DevTools Protocol) sobre el build de producción:

| Ancho | Scroll horizontal | Solapamientos entre botones/enlaces |
|---|---|---|
| 320 px | 320 (sin scroll) | 0 |
| 375 px | 375 | 0 |
| 414 px | 414 | 0 |
| 480–768 px | igual al viewport | 0 |
| 820–1366 px | ≤ viewport (scrollbar) | 0 |
| 1440–1920 px | ≤ viewport | 0 |

En 375 px los CTAs quedan uno debajo del otro a ancho completo, el theme y el menú hamburguesa son
visibles, y la tarjeta destacada no se recorta. En 1440 px los CTAs vuelven a fila y el featured card
mantiene su columna.

`npm run typecheck` → 0 · `npm run lint` → 0 warnings · `npm test` → 46/46 · `npm run build` → 0.

## Next

Verificar en producción después del deploy y, si aparece otro choque, medirlo con el mismo método
(no a ojo).

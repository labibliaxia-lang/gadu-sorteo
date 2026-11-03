---
author: Gadu
branch: main
status: in-progress
---
# Header responsive: el tema y el menú ya no se salen

## Intent

El botón de modo día/noche se iba fuera de pantalla en anchos intermedios. La causa: el header tenía
la navegación, el área de cuenta y los botones de tema/menú como hermanos en un `flex` sin wrap; entre
1024 y 1280 px el conjunto no entraba y empujaba los últimos botones fuera del contenedor.

## Scope

**In:**

- `components/Navbar.tsx`:
  - Navegación y área de cuenta pasan de `lg` a **`xl`** (≥1280 px). Entre 1024 y 1279 se usa el menú
    hamburguesa, que ya incluye navegación y cuenta.
  - El grupo **tema + menú** queda en un contenedor `flex shrink-0`, así nunca se comprime ni se va
    de pantalla.
  - El menú móvil usa `xl:hidden` para acompañar el mismo breakpoint; el `aria-label` cambia entre
    «Abrir menú» y «Cerrar menú».
- Auditoría de desbordes: revisadas las apariciones de `whitespace-nowrap`, `min-w-[...]` y anchos
  fijos. Todas quedaron dentro de tablas con `overflow-x-auto` o de contenedores con `flex-wrap`;
  no hay tablas sueltas.

**Out:** diseño general, lógica, pagos y motor.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El grupo tema/menú no se comprime | `shrink-0` en el contenedor |
| 2 | Navegación y cuenta no compiten en tablet | breakpoint `xl` |
| 3 | Menú móvil cubre tablet/notebook chica | `xl:hidden` |
| 4 | Sin tablas desbordadas | Revisión de wrappers |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1–3 — observado.** El header queda en tres zonas: logo, navegación centrada (solo `xl`), y acciones
con tema + menú en un contenedor que no se encoge. A 1024–1279 px el menú hamburguesa reemplaza la
navegación de escritorio, evitando la suma que desbordaba.

**4 — observado.** Búsqueda de `whitespace-nowrap`/anchos fijos: coincidencias solo en celdas de
tablas dentro de `overflow-x-auto` y en la barra flotante del superadmin (`max-w-[95vw]`).

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Verificación visual en 320, 375, 768, 1024 y 1280 px. Si algún título largo o email
rompe una tarjeta, el ajuste es `break-words`/`truncate` puntual.

## Next

Probar anchos reales y, si aparece otro desborde, corregirlo en el mismo patrón (contenedor
`min-w-0`, hijos `shrink-0`, tabla con scroll).

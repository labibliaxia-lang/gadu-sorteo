---
author: Gadu
branch: main
status: in-progress
---
# Fase 1 — Sistema de diseño y patrón tabla/tarjetas

## Intent

Pasar de “dashboard shadcn con ámbar encima” a una identidad consistente: amarillo seguridad, azul
profundo, acero y plano técnico, con tipografía propia y componentes base unificados. Sin tocar
lógica de pagos, reservas ni sorteos.

## Scope

**In:**

- `tailwind.config.ts`: tokens de marca (`brand`, `ink`, `steel`, `surface`), familias tipográficas,
  sombras suaves y animación `fade-up`.
- `app/globals.css`: variables de color claras/oscuras, foco ámbar, títulos con `font-display`,
  `blueprint-grid` y `text-balance`.
- `app/layout.tsx`: `next/font` con Space Grotesk (títulos), Inter (cuerpo) e IBM Plex Mono
  (números/hashes).
- `components/ui/button.tsx`: primario ámbar, variante `success`, outline con borde de sistema,
  tamaños y foco unificados.
- `components/ui/badge.tsx`: estados `success`, `warning`, `info`, `outline`.
- `components/ui/card.tsx`: radio de sistema, sombra suave, sin salto en hover.
- `components/ui/input.tsx` y `textarea.tsx`: borde/foco de sistema, fondo de tarjeta.
- `components/ui/empty-state.tsx`: estado vacío reutilizable.
- `components/ui/responsive-table.tsx`: tabla en desktop y una tarjeta por fila en móvil.
- `app/admin/design/page.tsx`: pantalla de comparación antes/después (solo admin), con muestras de
  botones, badges, tipografía, paleta, tabla/tarjetas y bloque de identidad.

**Out:** hero, tarjetas públicas, paneles y tablas de admin (Fases 2 y 3). No se cambió ningún flujo
ni dato.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tokens de marca claros y oscuros | `globals.css` + `tailwind.config.ts` |
| 2 | Tipografía propia | `next/font` en layout |
| 3 | Botones/badges/cards/inputs unificados | Componentes base |
| 4 | Patrón tabla→tarjetas | `ResponsiveTable` |
| 5 | Pantalla antes/después | `/admin/design` en build |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** La paleta define `brand` (#F5B301), `ink` (#071726), `steel` y `surface`; los
títulos usan Space Grotesk, el cuerpo Inter y los números IBM Plex Mono. El build resuelve las fuentes
sin fallos.

**3 — observado.** Botón primario ámbar con texto oscuro y variante verde para dinero; badges con
semántica de estado; cards con sombra suave y radio de sistema; inputs con foco ámbar.

**4 — observado.** `ResponsiveTable` oculta la tabla bajo `md` y muestra una tarjeta por fila con los
mismos campos; incluye estado vacío.

**5 — observado.** `/admin/design` requiere sesión de admin y muestra “Antes” (tarjeta/botón
genéricos) y “Después” (sistema nuevo) en la misma pantalla.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0 (`/admin/design`).

**Pendiente.** Ver la pantalla en el navegador y decidir ajustes de contraste; después, aplicar el
sistema al hero y las tarjetas públicas (Fase 2) y a las tablas de admin (Fase 3).

## Next

Abrir `/admin/design` y revisar el antes/después; si el rumbo gusta, seguir con la Fase 2.

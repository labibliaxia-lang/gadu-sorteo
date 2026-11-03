---
author: Gadu
branch: main
status: in-progress
---
# Constructor de landing promocional

## Intent

Que el organizador pueda armar contenido promocional (texto, imágenes y video) arriba del grid de
números, guardado como bloques JSON validados y renderizado con React, sin abrir la puerta a HTML
crudo.

## Scope

**In:**

- `supabase/migrations/0044_raffle_landing.sql`: columna `raffles.landing_content jsonb not null
  default '[]'` con constraint de tipo array.
- `lib/landing.ts`: esquemas Zod (`text`, `image`, `video`), parser tolerante para filas viejas,
  extracción/validación de YouTube y allowlist de imágenes del bucket `raffle-images`.
- `app/admin/sorteos/[id]/landing/actions.ts`: Server Action `saveLandingContent` con
  `requireAdminSession`, `owns_raffle`, Zod y validación de URLs de imagen.
- `app/admin/sorteos/[id]/landing/page.tsx` + `components/admin/LandingEditor.tsx`: editor con
  bloques de texto, imagen (subida a Storage) y video de YouTube; agregar, mover, borrar y guardar.
- `components/RaffleLanding.tsx`: render público con componentes React; CTA fijo «Participar y elegir
  mis números» que aparece mientras el grid no está a la vista y hace scroll a `#elegir-numeros`.
- `app/sorteos/[id]/page.tsx`: muestra los bloques antes del grid y ancla el grid.
- `app/admin/sorteos/[id]/page.tsx`: acceso «Landing» desde el detalle.

**Out:** motor de sorteos, webhook, pagos de prepago y flujo de reservas.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Columna JSONB con default array | Migración 0044 |
| 2 | Guardado seguro por Server Action | Zod + sesión + `owns_raffle` |
| 3 | Sin HTML crudo | Render React, sin `dangerouslySetInnerHTML` |
| 4 | Imágenes solo del bucket de Gadu | `isAllowedLandingImage` |
| 5 | Video solo con ID válido de YouTube | `youtubeId` |
| 6 | CTA que lleva al grid | Observer + `scrollIntoView` |
| 7 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** La migración agrega la columna y un CHECK `jsonb_typeof = 'array'`; es idempotente
y registra `0044`.

**2, 3, 4, 5 — observado.** La acción valida con `landingContentSchema`, exige sesión de admin y
`owns_raffle`, y rechaza imágenes que no estén bajo
`<SUPABASE_URL>/storage/v1/object/public/raffle-images/`. El texto se guarda como strings y se
renderiza con `<p>`/`<h2>` (whitespace-pre-line), nunca como HTML. El video se guarda solo como URL y
se valida contra los formatos de YouTube; el iframe usa `youtube.com/embed/<id>`.

**6 — observado.** `RaffleLanding` observa `#elegir-numeros` y muestra el CTA fijo mientras no está
visible; al tocarlo hace scroll suave al ancla. El CTA solo aparece si el sorteo está activo.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0 (`/admin/sorteos/[id]/landing`).

**Pendiente.** Aplicar `0044` y probar el flujo completo en producción.

## Next

Probar el editor con imagen y video reales; después, comparativa de conversión entre sorteos y el
resto del backlog legal/operativo.

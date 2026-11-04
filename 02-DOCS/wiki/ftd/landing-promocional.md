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
  validación de YouTube/Vimeo con host exacto y allowlist de imágenes del bucket `raffle-images`.
- `app/admin/sorteos/[id]/landing/actions.ts`: Server Action `saveLandingContent` con
  `requireAdminSession`, `owns_raffle`, Zod y validación de URLs de imagen.
- `app/admin/sorteos/[id]/landing/page.tsx` + `components/admin/LandingEditor.tsx`: editor con
  bloques de texto, imagen (subida a Storage) y video de YouTube/Vimeo; agregar, mover, borrar y
  guardar.
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
| 5 | Video YouTube/Vimeo con host exacto | `videoProvider` + `videoEmbedUrl` |
| 6 | CTA que lleva al grid | Observer + `scrollIntoView` |
| 7 | Gates verdes | typecheck/lint/test/build |
| 8 | Tests de URLs de video | `lib/landing.test.ts` |

## Evidence

**1 — observado.** La migración agrega la columna y un CHECK `jsonb_typeof = 'array'`; es idempotente
y registra `0044`.

**2, 3, 4, 5 — observado.** La acción valida con `landingContentSchema`, exige sesión de admin y
`owns_raffle`, y rechaza imágenes que no estén bajo
`<SUPABASE_URL>/storage/v1/object/public/raffle-images/`. Se comparan origin y pathname
decodificado, y se rechaza `..` para que un `raffle-images/../avatars/...` no pase la allowlist.
exactos de YouTube (`youtube.com`, `youtu.be`, `m.youtube.com`) y Vimeo (`vimeo.com`,
`player.vimeo.com`), con HTTPS e ID validado; el iframe usa una URL generada por
`videoEmbedUrl`, no la URL cruda.

**6 — observado.** `RaffleLanding` observa `#elegir-numeros` y muestra el CTA fijo mientras no está
visible; al tocarlo hace scroll suave al ancla. El CTA solo aparece si el sorteo está activo.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 66/66. `npm run build` → 0 (`/admin/sorteos/[id]/landing`).

**8 — observado.** `lib/landing.test.ts` cubre YouTube watch/youtu.be/shorts/embed, Vimeo y
player.vimeo.com, y rechaza HTTP, hosts falsos (`evil.com`, `youtube.com.evil.com`) y IDs inválidos.

**Nota de migración.** La columna ya existe en `0044_raffle_landing.sql`; `0032` está ocupada por
otra feature. No se creó una migración duplicada ni se renombró la existente.

**Pendiente.** Aplicar `0044` (si no está aplicada) y probar el flujo completo en producción.

## Next

Probar el editor con imagen y video reales; después, comparativa de conversión entre sorteos y el
resto del backlog legal/operativo.

---
author: Gadu
branch: main
status: in-progress
---
# Reseñas verificadas de organizadores

## Intent

Dar prueba social real: solo un comprador con números pagados en un sorteo ya sorteado puede calificar
al organizador (1–5 estrellas + comentario), y el organizador puede responder públicamente. El
promedio aparece en su perfil y en el sorteo.

## Scope

**In:**

- `supabase/migrations/0045_organizer_reviews.sql`: tabla `reviews` (organizer, user, raffle,
  `user_name` snapshot, rating 1–5, comment ≤500, reply ≤500, unique user+raffle), RLS:
  lectura pública; INSERT solo si el usuario tiene un número `sold` en ese sorteo `drawn` del
  organizador; UPDATE para el dueño de la reseña o el organizador; DELETE solo el dueño (o
  superadmin). Trigger que impide que el comprador escriba `reply` y que el organizador edite
  rating/comentario.
- `lib/reviews.ts`: Zod (rating 1–5, comentario 3–500, reply ≤500), tipos y promedio.
- `app/reviews/actions.ts`: `createReview` (verifica sorteo `drawn` y número vendido), `replyToReview`
  (solo el organizador dueño) y `deleteOwnReview`.
- `components/ReviewSection.tsx`: lista pública con promedio y respuestas; `ReviewFormDialog` para el
  comprador; `ReviewReplyForm` para el organizador.
- `app/organizador/[slug]/page.tsx`: promedio y sección de reseñas.
- `app/sorteos/[id]/page.tsx`: promedio del organizador junto a su tarjeta, con link al perfil.
- `app/mis-numeros/page.tsx`: botón «Calificar organizador» en sorteos finalizados, con modal.
- `app/admin/resenas/page.tsx` + navegación: el organizador ve y responde sus reseñas.

**Out:** motor de sorteo, prepago, pagos y webhook.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Solo compradores verificados | RLS INSERT + validación en la acción |
| 2 | Una reseña por sorteo | UNIQUE(user_id, raffle_id) |
| 3 | Dueño edita/borra; organizador responde | RLS + trigger |
| 4 | Promedio en perfil y sorteo | Consultas + UI |
| 5 | Respuesta del organizador | Página `/admin/resenas` |
| 6 | Sin HTML y longitudes acotadas | Zod + render React |
| 7 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** La acción comprueba `status = 'drawn'` y un número `sold` del usuario; la
política RLS repite la verificación; el UNIQUE evita duplicados y el error 23505 se traduce a un
mensaje claro.

**3 — observado.** El trigger `guard_review_update` bloquea cambios de relaciones, impide al
comprador escribir `reply` y al organizador editar rating/comentario; DELETE queda para el dueño de
la reseña (o superadmin).

**4, 5 — observado.** Perfil y sorteo muestran promedio/conteo; `/admin/resenas` lista las reseñas
del organizador con formulario de respuesta.

**6 — observado.** El comentario y la respuesta se renderizan como texto (whitespace-pre-line), sin
`dangerouslySetInnerHTML`; los límites de Zod coinciden con los CHECK de la base.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0 (`/admin/resenas`).

**Nota.** `reviews` tiene SELECT público por requisito, así que PostgREST expone `user_id` y
`organizer_id` (UUIDs). La UI solo muestra `user_name`, rating, comentario y respuesta; si se quiere
cerrar del todo, el siguiente paso es una vista pública sin IDs.

## Next

Aplicar 0045 y probar el circuito con un sorteo sorteado real; después, mostrar la calificación en
el listado de sorteos de la home.

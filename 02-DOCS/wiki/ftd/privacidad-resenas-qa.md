---
author: Gadu
branch: main
status: in-progress
---
# Privacidad de reseñas y Q&A: vistas públicas sin user_id

## Intent

Que un visitante anónimo no pueda leer `user_id` desde la API pública de reseñas o preguntas, sin
cambiar la UI ni la lógica de negocio.

## Scope

**In:**

- `supabase/migrations/0062_public_views_privacy.sql`:
  - vistas `public_reviews` y `public_questions` con solo columnas públicas,
  - `grant select` a `anon`/`authenticated`,
  - `revoke select` de `anon` sobre las tablas base.
- `app/sorteos/[id]/page.tsx`: promedio de reseñas y listado de preguntas desde las vistas; la
  pertenencia de una pregunta se calcula consultando solo los IDs propios del usuario logueado.
- `app/organizador/[slug]/page.tsx`: reseñas desde `public_reviews`.

**Out:** ocultar `user_id` a usuarios autenticados (siguen necesitando la tabla para sus propias
consultas y moderación), cambios de UI, pagos y motor.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Vistas sin user_id | Migración 0062 |
| 2 | Anon no lee tablas base | `revoke select ... from anon` |
| 3 | Páginas públicas usan vistas | Sorteo y perfil de organizador |
| 4 | `isMine` sigue funcionando | Consulta de IDs propios solo si hay sesión |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** Las vistas exponen reseñas (`id`, `organizer_id`, `raffle_id`, `user_name`,
`rating`, `comment`, `reply`, fechas) y preguntas (`id`, `raffle_id`, `question`, `answer`, fechas),
sin `user_id`. El rol `anon` pierde el SELECT directo sobre las tablas.

**3 — observado.** La página del sorteo consulta `public_reviews` para el promedio y
`public_questions` para el listado; el perfil público consulta `public_reviews`.

**4 — observado.** Con sesión, la página del sorteo consulta `raffle_questions.id` filtrando por
`user_id = viewer.id` y arma el set de preguntas propias; sin sesión no hace esa consulta.

**5 — observado.** `typecheck` 0 · `lint` 0 warnings · `test` 70/70 · `build` 0.

## Límites honestos

- Un usuario **autenticado** todavía puede consultar `user_id` en la tabla base. El objetivo era la
  API pública anónima; cerrar también eso requiere privilegios por columna o RPCs para todas las
  lecturas autenticadas.
- La migración **no se probó contra Supabase real**; falta aplicarla y verificar que PostgREST
  refresque las vistas.
- Las vistas son propiedad del rol de migración; si en el futuro se endurece la RLS de las tablas
  base, conviene revisar si las vistas deben usar `security_invoker`.

## Next

Aplicar 0062 y comprobar con la anon key que `GET /rest/v1/reviews` y
`/rest/v1/raffle_questions` devuelven 401/403, mientras las vistas siguen públicas.

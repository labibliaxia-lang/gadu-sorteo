---
author: Gadu
branch: main
status: in-progress
---
# Congelar sorteos, blindar el perfil y migrar premios

## Intent

Cerrar los tres pendientes que quedaron del blindaje P0: un sorteo sorteado se podía reabrir y volver
a sortear; el usuario podía auto-editar `email` e `is_verified` en su perfil; y las páginas de editar
sorteo y de premios seguían escribiendo datos desde el navegador (o sin validación de servidor). Con
esto, el resultado de un sorteo queda inmutable y toda escritura del panel pasa por una Server Action
con Zod, sesión y pertenencia.

## Scope

**In:**

- `supabase/migrations/0031_harden_draws_and_profiles.sql`: trigger que congela `status`,
  `winner_number`, `winner_user_id`, `winner_name` y `drawn_at` cuando el sorteo está `drawn`;
  `draw_winner` que falla explícitamente si ya se sorteó; y el trigger de perfiles ampliado con
  `email` e `is_verified`.
- `app/admin/sorteos/[id]/actions.ts`: Zod en `updateRaffle` (fechas y precios), pertenencia vía
  `owns_raffle()` y acciones nuevas `upsertPrize` y `deletePrize`.
- `app/admin/sorteos/[id]/editar/page.tsx` + `EditarSorteoForm.tsx`: la página pasa a Server
  Component (carga y pertenencia en servidor) y el formulario ya no crea cliente de Supabase para
  escribir: llama a `updateRaffle`.
- `app/admin/sorteos/[id]/premios/page.tsx`: crear, editar y borrar premios por Server Actions; se
  agrega la edición que faltaba (cargar un premio en el formulario y guardarlo con las dos fotos).

**Out:** flujo de compras prepago (`NumbersGrid`, checkout, webhook), vistas públicas, RLS (no se
tocan políticas), y la creación de sorteos de `nuevo/page.tsx` (sigue siendo escritura de cliente;
queda para otra iteración). No se cambia el esquema más allá de funciones y triggers.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Un sorteo `drawn` no puede cambiar ganador ni reabrirse | Lectura de 0031 |
| 2 | `draw_winner` falla si ya se sorteó y valida dueño | Lectura de 0031 |
| 3 | `email` e `is_verified` no se auto-editan | Lectura de 0031 |
| 4 | `updateRaffle` valida con Zod y usa `owns_raffle` | Lectura de las actions |
| 5 | Editar sorteo carga en servidor y escribe por Action | Lectura de la página y el form |
| 6 | Premios: crear, editar y borrar por Actions | Lectura de la página y `upsertPrize`/`deletePrize` |
| 7 | Las Actions llaman `requireAdminSession()` al inicio | Grep |
| 8 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** `0031` define `prevent_drawn_raffle_changes` y lo engancha a `raffles` con
`before update for each row`. Si `old.status = 'drawn'` y cambia `status`, `winner_number`,
`winner_user_id`, `winner_name` o `drawn_at`, lanza excepción: no hay re-sorteo ni reapertura por
UPDATE directo. Las políticas de `raffles` no se tocan.

**2 — observado.** `draw_winner` re-creada en `0031`: mantiene el chequeo de dueño de 0030 y agrega
un `if exists (... status = 'drawn') then raise exception 'El sorteo ya fue sorteado'` antes de
elegir número. La carrera entre dos llamadas concurrentes queda cubierta por el trigger (la segunda
UPDATE encuentra `old.status = 'drawn'`).

**3 — observado.** `prevent_sensitive_self_update` re-creada con las reglas de 0025 más:
`email` distinto → «El email no se puede cambiar desde el perfil»; `is_verified` distinto → «La
verificación de identidad la resuelve el superadmin». Siguen exentos el superadmin y el
service_role. `npm test` no detectó regresiones y el formulario de perfil no envía esos campos.

**4 — observado.** `app/admin/sorteos/[id]/actions.ts`: `updateRaffle` valida `raffleId` como UUID,
parsea `data` con `raffleUpdateSchema` (título 3–140, precio positivo con techo, `draw_date` como
fecha real, portada URL o null) y devuelve el primer mensaje de error. La pertenencia se resuelve con
`supabase.rpc("owns_raffle")`, la misma función que usan las políticas de 0030.

**5 — observado.** `editar/page.tsx` ya no es cliente: es un Server Component que exige
`requireAdminSession()`, carga el sorteo y devuelve 404 si no es del organizador. El formulario vive
en `EditarSorteoForm.tsx` (cliente, sin `createClient` para escribir) y llama a `updateRaffle`.

**6 — observado.** `premios/page.tsx` crea y edita con `upsertPrize` (Zod: posición 1–10, título,
descripción, `tool_number`, dos URLs de foto) y borra con `deletePrize`; ambas acciones verifican
sesión y pertenencia. Se agregó el modo edición que faltaba: «Editar» carga el premio en el
formulario y «Guardar cambios» lo actualiza por id. El choque de posición devuelve un mensaje claro
(23505).

**7 — observado.** Grep del archivo: `requireAdminSession()` al inicio de `deleteRaffle`,
`updateRaffle`, `upsertPrize`, `deletePrize`, `markReservationPaid` y `cloneRaffle`; `ownsRaffle()`
(que llama a `owns_raffle()`) en las seis.

**8 — observado.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or
errors`. `npm test` → 38/38. `npm run build` → exit 0, 25 páginas, 28 rutas.

**Pendiente de observación real.** Aplicar `0030` y después `0031` en Supabase. Sin `0030`,
`owns_raffle()` no existe y las acciones del panel responden «No autorizado» (falla cerrado). Hasta
aplicar `0031`, el re-sorteo y la auto-edición de email siguen permitidos en la base.

## Next

Aplicar `0031`, sortear un sorteo de prueba e intentar: re-sortear, reabrir por UPDATE, cambiar el
email propio y marcar `is_verified` desde el navegador. Los cuatro deben fallar. Después seguir con
la creación de sorteos desde `nuevo/page.tsx`, que todavía escribe desde el cliente.

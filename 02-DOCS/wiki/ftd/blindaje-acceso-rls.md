---
author: Gadu
branch: main
status: in-progress
---
# Blindaje de acceso y RLS (P0)

## Intent

La auditoría dejó tres agujeros que no se pueden dejar pasar antes de abrir el panel a los
organizadores: el portón del panel solo dejaba entrar al superadmin, la RLS no conocía el concepto de
dueño en premios, números y pagos, y los perfiles exponían PII (email, teléfono y rutas del KYC) a
cualquiera. Este cambio cierra esos tres y agrega una revalidación de sesión al inicio de cada Server
Action del panel.

## Scope

**In:**

- `middleware.ts`: la cookie maestra deja de exigirse para todo `/admin/*` y queda exclusiva de
  `/admin/super`. El resto del panel entra con sesión + rol.
- `app/admin/layout.tsx`: el botón «Bloquear panel» queda solo para superadmin (el organizador no
  tiene cookie que bloquear).
- `lib/auth.ts` (nuevo): `getAdminSession`, `requireAdminSession` y `requireSuperadminSession`.
- `supabase/migrations/0030_fix_rls_and_access.sql`: `owns_raffle()`, políticas con dueño para
  `prizes`, `raffle_numbers` (INSERT) y `payments` (SELECT), `draw_winner` con dueño, `profiles` sin
  lectura anónima ni lectura cruzada entre organizadores, vista `public_organizers`.
- `app/sorteos/[id]/page.tsx` + `components/OrganizerCard.tsx` + `components/OrganizerContact.tsx` +
  `lib/types.ts`: la página pública lee la vista y los componentes usan el tipo público.
- Server Actions del panel (`sorteos/[id]`, `numeros`, `verificacion`, `verify`, `super`) usando los
  helpers; guard de pertenencia en el detalle del sorteo.

**Out:** flujo de WhatsApp (`NumbersGrid`, `ReservedNumbersPanel`, checkout, webhook y simulador),
políticas de `raffles` (la instrucción lo prohíbe y ya estaban bien), datos existentes, y la
restricción de mover el sorteo a una Server Action (queda para la siguiente iteración).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Organizador entra a `/admin/sorteos` y `/admin/perfil` sin cookie | Lectura de middleware + layout |
| 2 | La cookie maestra solo protege `/admin/super` | Lectura de middleware |
| 3 | `owns_raffle()` y políticas con dueño en premios y números | Lectura de 0030 + `npm test` |
| 4 | Pagos legibles solo por su comprador o el dueño del sorteo | Lectura de 0030 |
| 5 | `draw_winner` valida dueño | Lectura de 0030 |
| 6 | `profiles` sin SELECT anónimo y sin lectura cruzada de PII | Lectura de 0030 |
| 7 | Vista `public_organizers` usada por la página del sorteo | Lectura de la página pública |
| 8 | Helpers usados en todas las Server Actions del panel | Grep de `requireAdminSession` |
| 9 | Superadmin conserva acceso total | Lectura de `owns_raffle` + políticas |
| 10 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** `middleware.ts:175-191`: la cookie solo se exige cuando el path es `/admin/super`
(o su subárbol). `/admin`, `/admin/sorteos`, `/admin/perfil` y `/admin/verificacion` pasan con sesión
y rol. `app/admin/layout.tsx:37` ya aceptaba `admin` y `superadmin` y se mantiene.

**2 — observado.** `SUPER_PREFIX` reemplaza a `ADMIN_PREFIX`; no quedan referencias al prefijo viejo
(grep sin resultados). El formulario «Bloquear panel» quedó dentro de
`profile?.role === "superadmin"` (`app/admin/layout.tsx`), porque un organizador no tiene cookie que
bloquear.

**3 — observado.** `0030` define `public.owns_raffle(uuid)` (SECURITY DEFINER, `search_path` fijo,
`is_superadmin()` incluido) y reescribe `prizes_insert_admin`/`update`/`delete` y
`raffle_numbers_insert_admin` con `public.is_admin() and public.owns_raffle(raffle_id)`.
`npm test` → 38/38, incluido el contrato código↔migraciones.

**4 — observado.** `payments_select_own_or_owner`:
`auth.uid() = user_id or public.owns_raffle(raffle_id)`. El INSERT pendiente y la ausencia de
UPDATE/DELETE no cambian.

**5 — observado.** `draw_winner` re-creada en `0030`: además de `is_admin()` exige
`is_superadmin() or created_by = auth.uid()`. Las políticas de `raffles` no se tocaron (como pedía la
instrucción).

**6 — observado.** `revoke select on public.profiles from anon`, se elimina
`profiles_select_public_admin` (0008) y se reemplaza `profiles_select_own_or_admin` por tres:
`profiles_select_own`, `profiles_select_superadmin` y `profiles_select_own_raffle_buyers` (compradores
con reserva o venta en sorteos del organizador). Un organizador ya no lee emails, teléfonos ni rutas
KYC de terceros.

**7 — observado.** `0030` crea `public.public_organizers` con `id, full_name, avatar_url,
is_verified` (filtrada a `role='admin'`) y grants a `anon`/`authenticated`.
`app/sorteos/[id]/page.tsx` lee de la vista; `OrganizerCard` usa `PublicOrganizer` y
`OrganizerContact` recibe solo datos de contacto del sorteo. Consecuencia buscada: el WhatsApp de
compra ya no cae al teléfono del perfil; sale de `raffle.whatsapp_contact`.

**8 — observado.** Grep: `requireAdminSession`/`requireSuperadminSession` al inicio de las 27
entradas de acción de `sorteos/[id]/actions.ts` (4), `numeros/actions.ts` (2), `super/actions.ts`
(13), `verificacion/actions.ts` (4) y `verify/actions.ts` (2). `app/admin/sorteos/[id]/page.tsx`
además corta con 404 si el sorteo no es del organizador.

**9 — observado.** `owns_raffle` devuelve true para superadmin, las políticas de escritura combinan
`is_admin()` (que incluye superadmin) con `owns_raffle`, el superadmin tiene política propia de
lectura de perfiles y conserva la cookie para `/admin/super`.

**10 — observado.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or
errors`. `npm test` → 38/38. `npm run build` → exit 0, 25 páginas, 28 rutas.

**Pendiente de observación real.** Aplicar `0030` en Supabase. Antes de aplicarla, la página pública
no encuentra el organizador en la vista (la tarjeta no se muestra) y las políticas nuevas no están
activas. El build prueba que compila, no el estado de la base.

## Next

Aplicar `0030`, entrar con dos cuentas de organizador y comprobar: (a) cada uno entra a su panel sin
cookie, (b) no ve sorteos ni premios del otro, (c) no puede marcar pagos ajenos, (d) la página
pública sigue mostrando la tarjeta del organizador. Queda pendiente mover el sorteo/cierre de sorteo
a Server Actions con auditoría y congelar el ganador.

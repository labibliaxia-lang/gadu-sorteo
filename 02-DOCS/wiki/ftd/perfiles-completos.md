---
author: Gadu
branch: main
status: in-progress
---
# Perfiles completos y dirección de entrega

## Intent

Que todos los perfiles tengan una dirección de recepción de premios obligatoria, que el organizador
solo vea la dirección del ganador de su sorteo, y que organizador/premium tengan una dirección de
entrega que coincida con la del DNI antes de aprobar el KYC.

## Scope

**In:**

- `supabase/migrations/0060_delivery_address.sql`:
  - `profiles.address_line`, `city`, `province`, `postal_code`, `country`, `dni_address`.
  - `enforce_organizer_kyc` amplía la exigencia para publicar: dirección de entrega y dirección del
    DNI completas, además de KYC aprobado, nombre, teléfono, ubicación y DNI.
- `lib/address.ts`: normalización y comparación de direcciones (mayúsculas, acentos, puntos, país
  opcional).
- `components/ProfileCompletionGate.tsx`: modal global que bloquea la navegación hasta cargar
  teléfono y dirección de entrega. Deja accesibles `/perfil`, `/admin/verificacion` y las páginas
  legales.
- `app/perfil/actions.ts`: `saveDeliveryAddress` y validación de coincidencia para organizadores.
- `components/ProfileEditor.tsx`: sección de dirección de recepción obligatoria.
- `app/admin/verificacion/actions.ts` y `page.tsx`: campo “Dirección que figura en tu DNI”, validación
  de coincidencia y bloqueo de subida de DNI/selfie si no coincide.
- `app/admin/sorteos/[id]/page.tsx`: el organizador dueño (o superadmin) ve la dirección de entrega
  de los ganadores de ese sorteo, con service role y validación previa de pertenencia. No se expone
  en páginas públicas.

**Out:** cálculo de envío, etiquetas, integración con correo y datos fiscales.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Campos de dirección en perfiles | Migración 0060 |
| 2 | Todos deben cargar dirección | Gate global + validación de acciones |
| 3 | KYC exige dirección y coincidencia con DNI | `dni_address` + `addressMatches` |
| 4 | Organizador ve solo direcciones de sus ganadores | Vista en detalle del sorteo |
| 5 | Dirección no pública | `public_organizers` sin campos nuevos |
| 6 | Tests de normalización | `lib/address.test.ts` |
| 7 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** 0060 agrega columnas y recrea el trigger de KYC con las nuevas exigencias.

**2 — observado.** El modal se monta desde el layout autenticado; si faltan teléfono o dirección,
bloquea salvo perfil, verificación y páginas legales. `updateProfile` y `saveDeliveryAddress`
validan los campos.

**3 — observado.** El KYC carga y guarda `dni_address`; `dataComplete` exige coincidencia; subir DNI
y selfie y aprobar la verificación fallan si no coincide.

**4 — observado.** El detalle del sorteo consulta `raffle_winners` y los perfiles con service role
solo después de validar que el actor es el dueño o superadmin. La lista muestra posición, número,
nombre y dirección; no muestra teléfono.

**5 — observado.** No se agregó ningún campo de dirección a `public_organizers`.

**6 — observado.** 53 tests pasan, incluidos los de acentos, formato y país opcional.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 53/53. `npm run build` → 0.

## Límites honestos

- **No se probó contra Supabase real todavía**: falta aplicar 0060 y crear un usuario de prueba.
- Los usuarios existentes sin dirección quedan bloqueados por el modal hasta completarla; es
  intencional, pero conviene avisar antes de desplegar.
- La coincidencia de direcciones es normalizada en la app; no hay validación contra el registro
  real del DNI, solo contra la dirección declarada.
- La dirección del ganador se muestra al organizador en el detalle del sorteo; no se envía por
  email ni aparece en la página pública.

## Next

Aplicar 0060, probar con un usuario comprador (gate), un organizador (KYC con dirección que no
coincide debe fallar) y un sorteo sorteado (dirección visible solo para el dueño).

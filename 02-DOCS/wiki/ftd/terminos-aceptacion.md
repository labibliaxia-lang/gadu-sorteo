---
author: Gadu
branch: main
status: in-progress
---
# Aceptación obligatoria de Términos con evidencia

## Intent

Que ninguna cuenta se cree sin aceptar Términos y Privacidad, guardar fecha y versión de la
aceptación, y bloquear a las cuentas que entran por Google hasta que acepten.

## Scope

**In:**

- `supabase/migrations/0050_terms_acceptance.sql`:
  - `profiles.terms_version text not null default '1.0'`.
  - Se elimina el trigger de 0036 que auto-aceptaba los términos.
  - `handle_new_user`: si el proveedor es email/password exige
    `raw_user_meta_data.accepted_terms = true` y aborta el alta si falta; guarda
    `terms_accepted_at` y `terms_version`. Para Google/OAuth crea el perfil con
    `terms_accepted_at = null` (la app lo bloquea).
- `lib/terms.ts`: versión vigente, rutas legales y cookie de consentimiento.
- `components/LoginForm.tsx` + `GoogleAuthButton`: checkbox obligatorio antes de
  «Continuar con Google»; sin tildar, el botón queda deshabilitado.
- `app/auth/callback/route.ts`: si el checkbox se tildó, guarda fecha/versión en el perfil al
  volver de Google.
- `components/TermsGate.tsx` montado en `app/layout.tsx`: modal bloqueante para cuentas OAuth sin
  aceptación; permite ver Términos/Privacidad antes de aceptar.
- `app/actions/terms.ts` (`acceptTerms`): validación de versión con Zod y actualización de la
  evidencia.
- `app/perfil/page.tsx`: muestra la versión aceptada, la fecha y la versión vigente, con enlaces a
  Términos y Privacidad.

**Out:** pagos, reservas, sorteos, motor y lógica de Google OAuth.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Checkbox obligatorio antes de registrarse | Botón deshabilitado sin tildar |
| 2 | Evidencia fecha + versión | Columnas y actualización |
| 3 | Backend rechaza alta email sin metadato | Trigger `handle_new_user` |
| 4 | Google bloqueado hasta aceptar | `TermsGate` + modal |
| 5 | Enlaces legales clicables | `target="_blank"` |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** `LoginForm` mantiene el checkbox y pasa `termsAccepted` a `GoogleAuthButton`;
sin tildar, el botón está `disabled` y muestra «Debés aceptar los términos para continuar».

**2 — observado.** La migración agrega `terms_version`; el callback y `acceptTerms` escriben
`terms_accepted_at` (now) y la versión vigente (`1.0`).

**3 — observado.** El trigger detecta el proveedor; para email/password lanza excepción si
`accepted_terms` no es true y solo inserta fecha cuando es true. Se eliminó el trigger que
auto-aceptaba.

**4 — observado.** El layout lee `terms_accepted_at`; si es null y hay sesión, monta un modal
`role="dialog"` que no deja navegar (salvo Términos, Privacidad y login). Al aceptar se actualiza el
perfil y el modal desaparece.

**5 — observado.** Los enlaces a `/terminos` y `/privacidad` abren en pestaña nueva con
`rel="noopener noreferrer"`.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**7 — observado.** `/perfil` lee `terms_version` y muestra «Términos aceptados · Versión 1.0 ·
fecha», junto a la versión vigente; si falta la aceptación lo indica en ámbar.

**8 — observado.** Si `terms_version` no coincide con `TERMS_VERSION`, el perfil muestra un aviso
ámbar con el botón «Aceptar versión X»; al aceptar se actualiza la fecha y la versión en el estado y
en la base.

**Nota de producto.** El registro actual es solo con Google (`/register` redirige a `/login`), por eso
el checkbox vive en el login, que es la puerta real de alta. El trigger de email queda listo para
cualquier alta por email/contraseña que se agregue después.

## Next

Aplicar 0050 y probar: cuenta existente, cuenta nueva con Google tildando el checkbox, y una cuenta
Google sin aceptación que debe quedar bloqueada por el modal.

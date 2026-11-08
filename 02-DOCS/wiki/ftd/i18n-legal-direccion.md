---
author: Gadu
branch: main
status: in-progress
---
# i18n legal y dirección de entrega

## Intent

Completar el flujo de compra internacional traduciendo las páginas legales
(Términos y Condiciones, Política de Privacidad) y el formulario de dirección de
entrega, sin tocar validaciones, pagos, base de datos, motor de sorteos ni los
componentes de demo/en vivo.

## Scope

Dentro:

- `app/[locale]/terminos/page.tsx` y `app/[locale]/privacidad/page.tsx` (movidos
  desde `app/` para que `/en/terminos` y `/en/privacidad` existan).
- `components/DeliveryAddressForm.tsx` (labels y mensajes; la validación sigue en
  `deliverySchema` y `direccionEntregaCompleta`).
- `components/TermsGate.tsx`: necesario para que el bloqueo legal no impida abrir
  `/en/terminos` y para que el consentimiento se lea en el idioma activo.
- `components/LoginForm.tsx`, `components/Footer.tsx` y `components/Navbar.tsx`:
  enlaces legales y selector en las rutas legales.
- `middleware.ts`: `/terminos` y `/privacidad` como rutas localizadas.
- `messages/{es,en,pt}.json`.

Fuera:

- Lógica de validación (Zod), pagos, checkout, RPCs, base de datos, motor de
  sorteos, `app/admin/`, `SandboxDraw`, `LiveDrawAnimation`.

## Checklist

- [x] MCP internalize de legales y dirección; evidencia guardada.
- [x] Legales movidos a `app/[locale]`; `/en/terminos` y `/en/privacidad` cargan
  en inglés y `/terminos` sigue funcionando.
- [x] Texto legal completo traducido a en/pt.
- [x] `DeliveryAddressForm` traducido, con errores conocidos del servidor mapeados.
- [x] `TermsGate` traducido y sin bloquear rutas legales localizadas.
- [x] Enlaces legales de footer/login/terms usan navegación localizada.
- [x] `typecheck`, `lint`, `test`, `build` verdes.
- [x] Smoke local.
- [x] Commit `6af547b`, push y producción verificada.

## Evidence

- MCP `next_intl_internalize` sobre términos, privacidad, `DeliveryAddressForm` y
  `TermsGate`: salidas en
  `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-legal/mcp/`. La heurística extrajo
  títulos y algunos items; el resto se tradujo a mano respetando el texto legal.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 687 claves, 69
  interpolaciones, 14 plurales, 29 textos enriquecidos, en los tres locales.
- `next_intl_sync_locales`: `inSync: true`, 687 claves, 0 faltantes/sobrantes.
- `npm run typecheck`, `npm run lint`, `npm test` (336 tests) y `npm run build`: OK.
- Smoke local en :3100:
  - `/en/terminos`: 200, inglés (“Terms and Conditions of Use”, “Nature of the
    Service”, “Refund Policy”).
  - `/en/privacidad`: 200, inglés (“Privacy Policy”, “Data We Collect”, “ARCO
    Rights”).
  - `/terminos`: 200, español; `/pt/terminos`: 200, portugués.
  - `/es/terminos`: 307 → `/terminos`.
  - Footer y login en inglés enlazan a `/en/terminos` y `/en/privacidad`.
  - `/en/login` y el grid del sorteo activo siguen en inglés.
- `DeliveryAddressForm`: labels y botón por `next-intl`; los errores conocidos de
  Zod se mapean a claves sin tocar `deliverySchema` ni `direccionEntregaCompleta`.
  Los errores desconocidos de Supabase muestran un mensaje genérico traducido.
- `TermsGate`: usa `usePathname` de `src/i18n/navigation`, así `/en/terminos` queda
  permitido aunque el pathname real tenga prefijo. Los enlaces legales usan
  `LocaleLink`.
- No se tocó lógica de pagos, checkout, RPCs, motor de sorteos, admin,
  `SandboxDraw` ni `LiveDrawAnimation`.
- Producción verificada después del push (`6af547b`):
  - `/en/terminos`: 200, inglés (“Terms and Conditions of Use”, “Nature of the
    Service”, “Refund Policy”).
  - `/en/privacidad`: 200, inglés (“Privacy Policy”, “Data We Collect”, “ARCO
    Rights”).
  - `/pt/terminos`: 200, portugués; `/terminos`: 200, español.
  - `/es/terminos`: 307 → `/terminos`.
  - Footer y login en inglés enlazan a `/en/terminos` y `/en/privacidad`.
  - `/en/login` y el grid del sorteo activo siguen en inglés.
- `DeliveryAddressForm` no se pudo abrir visualmente en producción (requiere
  sesión, sorteo activo y reserva); sus labels y errores están traducidos y
  cubiertos por typecheck/lint/build.

## Next

Commit y push. Verificar producción y registrar la evidencia.

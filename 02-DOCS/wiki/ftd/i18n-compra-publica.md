---
author: Gadu
branch: main
status: in-progress
---
# i18n del flujo de compra pública

## Intent

Traducir al inglés y portugués el flujo que el comprador usa para concretar una
compra —grid de números, modales de reserva/pago, aviso de términos y formularios de
login/registro— y adaptar fechas y precios al locale activo. No se toca la lógica de
carrito, precios, reservas ni pagos: solo la capa visual.

## Scope

Dentro:

- `components/NumbersGrid.tsx` (textos y formato; sin cambios de lógica).
- `app/[locale]/(auth)/login/page.tsx` y `app/[locale]/(auth)/register/page.tsx`
  (movidos desde `app/(auth)` para que `/en/login` y `/en/register` existan).
- `components/LoginForm.tsx`, `components/GoogleAuthButton.tsx` y
  `components/PasskeyLoginButton.tsx`: el checkbox de Términos y los botones viven
  ahí.
- `middleware.ts`: `/login` y `/register` agregados a las rutas localizadas; se
  reconstruye la respuesta de next-intl con los headers originales.
- `lib/utils.ts`: locale opcional en `formatDateTime`, `formatPrice` y `formatPriceIn`
  (default `es-AR`; los códigos cortos se mapean a `es-AR`, `en-US`, `pt-BR`).
- `messages/{es,en,pt}.json` y los call sites públicos de fechas/precios.

Fuera:

- Lógica de pagos, checkout, Mercado Pago, reservas, RPCs, motor de sorteos.
- `app/admin/`, `LiveDrawAnimation`, `SandboxDraw`, `DeliveryAddressForm`.
  Este último queda en español; se reporta.
- Páginas legales (`/terminos`, `/privacidad`) siguen en español.

## Checklist

- [x] MCP internalize sobre grid y auth; evidencia guardada.
- [x] Auth movido a `app/[locale]/(auth)`; `/login`, `/register`, `/en/login` y
  `/en/register` funcionan.
- [x] Grid traducido (selección, total, reserva, modales, términos, paginación).
- [x] Login/registro traducidos, incluido el checkbox de Términos.
- [x] Fechas y precios usan el locale activo en la página del sorteo y componentes
  públicos.
- [x] `typecheck`, `lint`, `test`, `build` verdes.
- [x] Smoke local y producción.
- [x] Commit `0b0b1e6` y push a `main`.
- [x] Deploy de producción verificado.

## Evidence

- MCP `next_intl_internalize` sobre `NumbersGrid`, login, registro, `LoginForm`,
  `GoogleAuthButton` y `PasskeyLoginButton`: salidas en
  `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-compra/mcp/`. La heurística regex
  extrajo poco de estos archivos (la mayoría son template literals); se usó como
  inventario.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 609 claves, 66
  interpolaciones, 14 plurales, 18 textos enriquecidos, en los tres locales.
- `next_intl_sync_locales`: `inSync: true`, 609 claves, 0 faltantes/sobrantes.
- `npm run typecheck`, `npm run lint`, `npm test` (336 tests) y `npm run build`: OK.
- Build: `/[locale]/login` y `/[locale]/register` generados para es/en/pt; el resto
  de las rutas públicas sigue dinámico.
- Smoke local con `next start` en :3100:
  - `/login` (es), `/en/login`, `/pt/login`, `/en/register`: 200 y `lang` correcto.
  - `/en/sorteos/df7c3431-babd-403b-988d-806373d2365a` (sorteo activo): 200, grid
    en inglés (“Tap a number to choose it”, “Reserve and send receipt”).
  - `/es/...` y `/pt/...` del mismo sorteo: grid en español y portugués.
  - Fecha: `Nov 9, 2026, 11:20 AM` en inglés; `9 nov 2026, 11:20 a. m.` en español.
  - Precio: `$ 1` en español y `ARS 1` en inglés.
- Hallazgo: `/sorteos/auto-2026-demo` está en estado `drawn`, así que no renderiza
  el grid (solo se muestra para sorteos activos). La verificación del grid se hizo
  con el sorteo activo `df7c3431-…`, que es el destacado de la home.
- Nota técnica: el rewrite de next-intl en Next 14 no propaga la cookie
  `gadu_terms_accepted` al Server Component (sí la ve el middleware). Se agregó un
  respaldo en `LoginForm` que lee `document.cookie` y oculta el checkbox si el
  consentimiento ya existe. El servidor sigue recibiendo la cookie para el resto
  del flujo.
- Sesión real probada con una cuenta de test (`carla.ficticia@gadu.test`): con la
  cookie de Supabase, `/`, `/en` y `/en/sorteos/<activo>` renderizan el Navbar con
  “Log out”, así que la sesión no se pierde en las rutas localizadas.
- Producción verificada después del push (`0b0b1e6`):
  - `/en/login`: 200, inglés (“Welcome to Gadu Sorteos”, “Continue with Google”).
  - `/en/register`: 200, inglés.
  - `/login`: 200, español.
  - `/en/sorteos/df7c3431-…`: 200, grid en inglés (“Tap a number to choose it”,
    “Reserve and send receipt”).
  - `/es/sorteos/df7c3431-…` y `/pt/sorteos/df7c3431-…`: grid en español y portugués.
  - Fecha: `Nov 9, 2026, 11:20 AM` (en) / `9 nov 2026, 11:20 a. m.` (es).
  - Precio: `ARS 1` (en) / `$ 1` (es).
  - `/es/sorteos/df7c3431-…`: 307 → ruta sin prefijo.
  - `/en/sorteos/auto-2026-demo`: 200 en inglés, pero **no muestra grid** porque
    ese sorteo está sorteado; el grid solo se renderiza en sorteos activos.
- No se tocó `NumbersGrid` en su lógica: solo textos y formato. Tampoco se tocaron
  pagos, checkout, RPCs, motor de sorteos, admin ni `LiveDrawAnimation`.

## Next

Commit y push. Fase 3 opcional: traducir `DeliveryAddressForm`, páginas legales,
`SandboxDraw` y `LiveDrawAnimation`; revisar la propagación de cookies en rewrites
de Next 14 con una sesión real.

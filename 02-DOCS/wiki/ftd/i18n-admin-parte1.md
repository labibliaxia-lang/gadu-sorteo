---
author: Gadu
branch: main
status: in-progress
---
# i18n del admin — parte 1 (layout y dashboard)

## Intent

Mover el panel de administración a `app/[locale]/admin` para que `/en/admin` y
`/pt/admin` existan, manteniendo la protección de sesión/rol/MFA, y traducir el
layout (navbar superior y sidebar) y el dashboard principal. El resto del admin
queda en español para la parte 2.

## Scope

Dentro:

- `app/admin/**` → `app/[locale]/admin/**` (movimiento completo de rutas).
- `middleware.ts`: `/admin` como ruta localizada y protección de `/admin/super`
  antes del rewrite, con redirects al login/verify del locale activo.
- `components/admin/AdminNav.tsx`: links localizados y labels traducidos.
- `app/[locale]/admin/layout.tsx`: textos, links y redirects por locale.
- `app/[locale]/admin/page.tsx`: dashboard traducido (stats, títulos, acciones y
  vacíos), fechas/precios con locale.
- `components/OrganizerOnboarding.tsx`, `components/admin/NotificationsBell.tsx`
  y `components/admin/PremiumGate.tsx`: textos visibles del dashboard/navbar.
- `components/Navbar.tsx` y `components/Footer.tsx`: detectar `/en/admin` y
  `/pt/admin` como panel; selector de idioma también en el panel.
- `messages/{es,en,pt}.json`.
- Imports absolutos `@/app/admin/...` actualizados a `@/app/[locale]/admin/...`
  (incluye componentes que importan Server Actions del admin).

Fuera:

- Lógica de pagos, checkout, Mercado Pago, RPCs, motor de sorteos, autenticación,
  roles, `requireAdminSession` y `deliverySchema`.
- Traducción del resto de páginas del admin (Sorteos, Premios, Superadmin,
  Verificación, Perfil, Reseñas, Notificaciones, Diseño) y de
  `AdvancedAnalytics`. Quedan en español para la parte 2.

## Checklist

- [x] MCP internalize de layout, AdminNav y dashboard; evidencia guardada.
- [x] `app/admin` movido a `app/[locale]/admin`; imports absolutos actualizados.
- [x] `/admin`, `/en/admin` y `/pt/admin` resuelven; build sin errores.
- [x] Middleware protege `/en/admin/super` y redirige al login/verify localizado.
- [x] Layout y AdminNav traducidos.
- [x] Dashboard traducido, con fechas/precios por locale.
- [x] Navbar/Footer detectan el panel con prefijo; selector visible en admin.
- [x] `typecheck`, `lint`, `test`, `build` verdes.
- [x] Smoke con sesión admin en `/en/admin` y `/pt/admin`; `/admin` sigue en español.
- [x] Commit `99a5815`, push y deploy verificado.

## Evidence

- MCP `next_intl_internalize` sobre layout, AdminNav y dashboard: salidas en
  `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-admin-parte1/mcp/`.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 738 claves, 74
  interpolaciones, 14 plurales, 29 textos enriquecidos, en los tres locales.
- `next_intl_sync_locales`: `inSync: true`, 738 claves, 0 faltantes/sobrantes.
- `npm run typecheck`, `npm run lint`, `npm test` (336 tests) y `npm run build`: OK.
- Build genera `/[locale]/admin` y todas sus subrutas para es/en/pt.
- Smoke local con sesión admin real (`e2e.organizador@gadu.test`, magic link):
  - `/en/admin`: 200, “Organizer panel”, “Dashboard”, “Total raffles”,
    “Estimated revenue”, “New raffle”, “Alerts”, nav “Raffles / Reviews /
    Verification / Profile”; links `/en/admin/...`.
  - `/pt/admin`: 200, “Painel do organizador”, “Total de sorteios”, “Receita
    estimada”, “Novo sorteio”, “Avisos”.
  - `/admin`: 200, español.
  - 15 páginas del admin (`design`, `notificaciones`, `perfil`, `resenas`,
    `sorteos`, `sorteos/nuevo`, detalle y subrutas) devuelven 200.
  - Sin sesión: `/en/admin` → 307 `/en/login`; `/pt/admin` → 307 `/pt/login`;
    `/admin` → 307 `/login`; `/en/admin/super` → 307 `/en/login`.
  - Con sesión admin (sin MFA de super): `/en/admin/super` → 307
    `/en/admin/verify?next=%2Fen%2Fadmin%2Fsuper`.
- `Navbar`/`Footer` reconocen `/en/admin` y `/pt/admin`; el footer no se muestra y
  el selector de idioma queda visible con links `/es/admin`, `/en/admin`,
  `/pt/admin`.
- `LiveDrawAnimation` solo cambió la ruta del import de la Server Action
  (`@/app/admin/...` → `@/app/[locale]/admin/...`); no se tocó su lógica.
- Restricciones mantenidas: no se modificó autenticación, roles, pagos, checkout,
  RPCs ni motor de sorteos.
- Producción después del push (`99a5815`):
  - `/en/admin` sin sesión → 307 `/en/login`.
  - `/pt/admin` sin sesión → 307 `/pt/login`.
  - `/admin` sin sesión → 307 `/login`.
  - `/en/admin/super` sin sesión → 307 `/en/login`.
  - `/en/admin/sorteos` sin sesión → 307 `/en/login`.
  - Con sesión admin, producción redirige a
    `/seguridad?next=%2Fen%2Fadmin` (o `/pt/...`) porque
    `ADMIN_MFA_REQUIRED=true` en Vercel: es el segundo factor esperado, no un
    error de ruteo. El dashboard traducido se verificó en local con la misma
    base de producción y el flag apagado.
  - `/en/login` sigue en inglés.

## Next

Commit y push. Parte 2: Sorteos, Premios, Superadmin, AdvancedAnalytics y el resto
de páginas del admin; también conviene localizar los links internos que hoy
apuntan a `/admin/...` sin prefijo.

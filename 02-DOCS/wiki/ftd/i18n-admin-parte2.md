---
author: Gadu
branch: main
status: in-progress
---
# i18n del admin — parte 2 (páginas de gestión y Superadmin)

## Intent

Terminar la internacionalización del admin: traducir las páginas de Sorteos,
Premios, Ventas, Analíticas, Superadmin y `AdvancedAnalytics`, y hacer que los
links internos conserven el prefijo del locale (`/en/admin`, `/pt/admin`).

## Scope

Dentro:

- `app/[locale]/admin/sorteos/**` (lista, alta, detalle, premios, ventas,
  analítica, editar, landing, preguntas, números).
- `app/[locale]/admin/super/**` (consola, bajas, planes, usuarios, sandbox,
  error).
- `components/admin/AdvancedAnalytics.tsx`.
- `messages/{es,en,pt}.json`.
- Links de esos árboles: `next/link` → `Link` de `@/src/i18n/navigation`.
- Ajustes mínimos de links/router en componentes del admin que redirigían a
  `/admin` o `/admin/super` (`RaffleCloneButton`, `RaffleDeleteButton`,
  `ImpersonationBanner`, `SuperAdminDashboard`, `NotificationsPanel`,
  `AutoDrawToggle`).

Fuera:

- Lógica de pagos, checkout, RPCs, motor de sorteos, validación de roles,
  middleware y `actions.ts`.
- Componentes anidados no incluidos en el alcance (siguen en español):
  `SuperAdminDashboard` (textos), `PlanConfigEditor`, `PlanPricesPanel`,
  `LicenseCodesPanel`, `SandboxDraw`, `ReportActions`, `VerificationActions`,
  `FeatureRaffleButton`, `RoleRequestActions`, `SupportUserActions`,
  `PlanSupportActions`, `TrafficChart`, `MetricBarChart`, `RaffleActions`,
  `ImageUploader`, `PrizeCard`, `VentasAcciones`, etc.
- Mensajes de validación Zod y errores de Server Actions.
- `lib/raffle-terms.ts` (bases legales en español por diseño).

## Checklist

- [x] Sorteos (lista, alta, detalle, premios, ventas, analítica, editar,
      landing, preguntas, números) traducidos.
- [x] Superadmin (consola, bajas, planes, usuarios, sandbox, error) traducido a
      nivel de página.
- [x] `AdvancedAnalytics` traducido.
- [x] `next/link` eliminado de `sorteos/**` y `super/**`.
- [x] Links y routers de componentes del admin conservan el locale.
- [x] Fragmentos fusionados; 1400 claves, ICU válido y sync exacto.
- [x] `typecheck`, `lint`, `test` (336) y `build` verdes.
- [x] `/en/admin/sorteos` y `/pt/admin/sorteos` verificados en local con sesión
      admin real: textos traducidos, links `/en/...` y `/pt/...`, sin
      `MISSING_MESSAGE`.
- [ ] `/pt/admin/super` runtime: bloqueado por MFA/superadmin; ver “Límite”.
- [ ] Commit, push y deploy.

## Evidence

- MCP `next_intl_internalize` sobre lista de sorteos, consola super y
  `AdvancedAnalytics`: `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-admin-parte2/mcp/`.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 1400 claves, 139
  interpolaciones, 23 plurales, 38 textos enriquecidos en es/en/pt.
- `next_intl_sync_locales`: `inSync: true`, 1400 claves, 0 diferencias.
- `npm run typecheck`, `npm run lint`, `npm test` (336) y `npm run build`: OK.
- Smoke local (`next start`, base de producción, sesión admin real):
  - `/en/admin/sorteos`: “Manage / Prizes / View public page”, fechas y precios
    en en-US, links `/en/admin/...` y `/en/sorteos/...`.
  - `/en/admin/sorteos/nuevo`, detalle, premios, ventas, analítica, editar:
    200, sin `MISSING_MESSAGE`.
  - `/pt/admin/sorteos`: portugués, links `/pt/admin/...`.
  - No quedan `href="/admin..."` en las páginas de Sorteos (solo `/en`/`/pt`).
- Auditoría de claves usadas por los traductores: 0 faltantes.
- No se tocó lógica transaccional, pagos, RPCs ni middleware.

## Límite de verificación de `/pt/admin/super`

El panel super exige simultáneamente:

1. sesión con rol `superadmin`, y
2. cookie `admin_verified` del segundo factor.

No hay una cuenta de prueba `superadmin` sin MFA disponible. En producción
`ADMIN_MFA_REQUIRED=true`; con la cuenta admin de prueba el middleware redirige
a `/seguridad?next=...`. Por eso la consola super no se pudo renderizar en
runtime sin una sesión MFA de superadmin. Sí se verificaron:

- `/pt/admin/super` sin sesión → 307 `/pt/login`.
- `/pt/admin/super` con sesión admin sin MFA → 307 `/pt/admin/verify?next=...`.
- `typecheck`, `build`, paridad de claves y auditoría de claves usadas.

## Next

Commit y push. Pendiente para una próxima pasada: traducir los componentes
anidados del super listados arriba, mensajes Zod/acciones y redirects de
servidor que aún apuntan a `/admin` sin prefijo.

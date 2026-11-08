---
author: Gadu
branch: main
status: done
---
# i18n del admin â€” parte 2 (pÃ¡ginas de gestiÃ³n y Superadmin)

## Intent

Terminar la internacionalizaciÃ³n del admin: traducir las pÃ¡ginas de Sorteos,
Premios, Ventas, AnalÃ­ticas, Superadmin y `AdvancedAnalytics`, y hacer que los
links internos conserven el prefijo del locale (`/en/admin`, `/pt/admin`).

## Scope

Dentro:

- `app/[locale]/admin/sorteos/**` (lista, alta, detalle, premios, ventas,
  analÃ­tica, editar, landing, preguntas, nÃºmeros).
- `app/[locale]/admin/super/**` (consola, bajas, planes, usuarios, sandbox,
  error).
- `components/admin/AdvancedAnalytics.tsx`.
- `messages/{es,en,pt}.json`.
- Links de esos Ã¡rboles: `next/link` â†’ `Link` de `@/src/i18n/navigation`.
- Ajustes mÃ­nimos de links/router en componentes del admin que redirigÃ­an a
  `/admin` o `/admin/super` (`RaffleCloneButton`, `RaffleDeleteButton`,
  `ImpersonationBanner`, `SuperAdminDashboard`, `NotificationsPanel`,
  `AutoDrawToggle`).

Fuera:

- LÃ³gica de pagos, checkout, RPCs, motor de sorteos, validaciÃ³n de roles,
  middleware y `actions.ts`.
- Componentes anidados no incluidos en el alcance (siguen en espaÃ±ol):
  `SuperAdminDashboard` (textos), `PlanConfigEditor`, `PlanPricesPanel`,
  `LicenseCodesPanel`, `SandboxDraw`, `ReportActions`, `VerificationActions`,
  `FeatureRaffleButton`, `RoleRequestActions`, `SupportUserActions`,
  `PlanSupportActions`, `TrafficChart`, `MetricBarChart`, `RaffleActions`,
  `ImageUploader`, `PrizeCard`, `VentasAcciones`, etc.
- Mensajes de validaciÃ³n Zod y errores de Server Actions.
- `lib/raffle-terms.ts` (bases legales en espaÃ±ol por diseÃ±o).

## Checklist

- [x] Sorteos (lista, alta, detalle, premios, ventas, analÃ­tica, editar,
      landing, preguntas, nÃºmeros) traducidos.
- [x] Superadmin (consola, bajas, planes, usuarios, sandbox, error) traducido a
      nivel de pÃ¡gina.
- [x] `AdvancedAnalytics` traducido.
- [x] `next/link` eliminado de `sorteos/**` y `super/**`.
- [x] Links y routers de componentes del admin conservan el locale.
- [x] Fragmentos fusionados; 1400 claves, ICU vÃ¡lido y sync exacto.
- [x] `typecheck`, `lint`, `test` (336) y `build` verdes.
- [x] `/en/admin/sorteos` y `/pt/admin/sorteos` verificados en local con sesiÃ³n
      admin real: textos traducidos, links `/en/...` y `/pt/...`, sin
      `MISSING_MESSAGE`.
- [ ] `/pt/admin/super` runtime: bloqueado por MFA/superadmin; ver â€œLÃ­miteâ€.
- [x] Commit `6a0a526`, push y deploy verificado.

## Evidence

- MCP `next_intl_internalize` sobre lista de sorteos, consola super y
  `AdvancedAnalytics`: `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-admin-parte2/mcp/`.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 1400 claves, 139
  interpolaciones, 23 plurales, 38 textos enriquecidos en es/en/pt.
- `next_intl_sync_locales`: `inSync: true`, 1400 claves, 0 diferencias.
- `npm run typecheck`, `npm run lint`, `npm test` (336) y `npm run build`: OK.
- Smoke local (`next start`, base de producciÃ³n, sesiÃ³n admin real):
  - `/en/admin/sorteos`: â€œManage / Prizes / View public pageâ€, fechas y precios
    en en-US, links `/en/admin/...` y `/en/sorteos/...`.
  - `/en/admin/sorteos/nuevo`, detalle, premios, ventas, analÃ­tica, editar:
    200, sin `MISSING_MESSAGE`.
  - `/pt/admin/sorteos`: portuguÃ©s, links `/pt/admin/...`.
  - No quedan `href="/admin..."` en las pÃ¡ginas de Sorteos (solo `/en`/`/pt`).
- AuditorÃ­a de claves usadas por los traductores: 0 faltantes.
- No se tocÃ³ lÃ³gica transaccional, pagos, RPCs ni middleware.

## LÃ­mite de verificaciÃ³n de `/pt/admin/super`

El panel super exige simultÃ¡neamente:

1. sesiÃ³n con rol `superadmin`, y
2. cookie `admin_verified` del segundo factor.

No hay una cuenta de prueba `superadmin` sin MFA disponible. En producciÃ³n
`ADMIN_MFA_REQUIRED=true`; con la cuenta admin de prueba el middleware redirige
a `/seguridad?next=...`. Por eso la consola super no se pudo renderizar en
runtime sin una sesiÃ³n MFA de superadmin. SÃ­ se verificaron:

- `/pt/admin/super` sin sesiÃ³n â†’ 307 `/pt/login`.
- `/pt/admin/super` con sesiÃ³n admin sin MFA â†’ 307 `/pt/admin/verify?next=...`.
- `typecheck`, `build`, paridad de claves y auditorÃ­a de claves usadas.

## Next

Commit y push. Pendiente para una prÃ³xima pasada: traducir los componentes
anidados del super listados arriba, mensajes Zod/acciones y redirects de
servidor que aÃºn apuntan a `/admin` sin prefijo.


## Cierre

- Commit `6a0a526` pusheado a `main`.
- Deploy de producción verificado: `/en/admin/sorteos`, `/pt/admin/sorteos`,
  `/en/admin`, `/pt/admin/super` y `/en/admin/super` sin sesión redirigen al
  login del locale (`/en/login` o `/pt/login`).
- La verificación de contenido del admin se hizo en local con la base de
  producción y sesión admin real, porque Vercel exige MFA (`ADMIN_MFA_REQUIRED=true`).

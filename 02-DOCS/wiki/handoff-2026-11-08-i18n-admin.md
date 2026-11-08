---
author: Gadu
date: 2026-11-08
status: closed
---

# Handoff — i18n del admin (partes 1 y 2, cerrado)

## Estado

El admin quedó **100% traducido** a es/en/pt para la experiencia del organizador,
salvo los componentes internos de Superadmin que se listan como deuda técnica
aceptada. Migrado a `app/[locale]/admin` e integrado con el selector de idioma.

Incluye:

- Layout, navbar superior, sidebar, dashboard y onboarding (parte 1).
- Sorteos: lista, alta, detalle, premios, ventas, analítica, editar, landing,
  preguntas y números (parte 2).
- Superadmin: consola, bajas, planes, usuarios, sandbox y error (parte 2).
- `AdvancedAnalytics`.
- Links internos con prefijo de locale en esos árboles.

Commits:

- `99a5815` — migración y layout/dashboard.
- `dda3b0c` — evidencia parte 1.
- `6a0a526` — traducción de Sorteos, Superadmin y analíticas.
- `2beec00` — cierre, evidencia y deploy.

## Catálogos

- `messages/{es,en,pt}.json`: **1400 claves**.
- `next_intl_validate_icu`: válido, 0 errores.
- `next_intl_sync_locales`: 0 diferencias.

## Verificación

- `typecheck`, `lint`, 336 tests y `build`: verdes.
- `/en/admin/sorteos`, `/pt/admin/sorteos` y subrutas de Sorteos: 200, textos
  traducidos, links `/en/...` y `/pt/...`, sin `MISSING_MESSAGE`.
- `/pt/admin/super` runtime no se pudo abrir sin una sesión `superadmin` con MFA.
  Sin sesión redirige a `/pt/login`; con admin sin MFA, a
  `/pt/admin/verify?next=...`. La consola compila y sus claves están auditadas.
- Deploy en producción verificado para redirects de admin sin sesión.

## Deuda técnica aceptada

No bloquea la experiencia del organizador ni del jugador. Se retomará cuando
haya soporte para otros países.

- Componentes anidados de Superadmin, solo visibles para el titular:
  `SuperAdminDashboard` (textos), `PlanConfigEditor`, `PlanPricesPanel`,
  `LicenseCodesPanel`, `SandboxDraw`, `ReportActions`, `VerificationActions`,
  `FeatureRaffleButton`, `RoleRequestActions`, `SupportUserActions`,
  `PlanSupportActions`, `TrafficChart`, `MetricBarChart`.
- Mensajes técnicos internos que no son copy de UI: validaciones Zod, errores de
  Server Actions y avisos de migraciones/DB de la consola super.
- Redirects de servidor que aún apuntan a `/admin` sin prefijo.
- Prueba visual del formulario de dirección y revisión legal de Términos
  (independientes de esta entrega).

## Documentos

- `02-DOCS/wiki/ftd/i18n-admin-parte1.md`
- `02-DOCS/wiki/ftd/i18n-admin-parte2.md`
- Evidencias en `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-admin-parte1/` y
  `.../2026-11-08-i18n-admin-parte2/`.

## Cierre

Sesión cerrada el 2026-11-08. La internacionalización del admin queda completa
para el alcance del producto; la deuda de Superadmin queda documentada.

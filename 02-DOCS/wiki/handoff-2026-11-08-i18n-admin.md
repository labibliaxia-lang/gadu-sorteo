---
author: Gadu
date: 2026-11-08
status: snapshot
---

# Handoff — i18n del admin (partes 1 y 2)

## Estado

El admin quedó migrado a `app/[locale]/admin` y traducido a es/en/pt en:

- Layout, navbar superior, sidebar, dashboard y onboarding (parte 1).
- Sorteos: lista, alta, detalle, premios, ventas, analítica, editar, landing,
  preguntas y números (parte 2).
- Superadmin: consola, bajas, planes, usuarios, sandbox y error (parte 2).
- `AdvancedAnalytics`.
- Links internos con prefijo de locale en esos árboles.

Commits:

- `99a5815` — migración y layout/dashboard.
- `dda3b0c` — evidencia parte 1.
- Parte 2: ver commit de cierre en `main`.

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

## Pendientes conocidos

- Componentes anidados del super siguen en español: `SuperAdminDashboard`
  (textos), `PlanConfigEditor`, `PlanPricesPanel`, `LicenseCodesPanel`,
  `SandboxDraw`, `ReportActions`, `VerificationActions`, `FeatureRaffleButton`,
  `RoleRequestActions`, `SupportUserActions`, `PlanSupportActions`,
  `TrafficChart`, `MetricBarChart`.
- Formularios de Sorteos: mensajes Zod y algunos labels de `ImageUploader`,
  `PrizeCard`, `RaffleActions`, etc. siguen en español.
- Errores de Server Actions y avisos técnicos de la consola super.
- Redirects de servidor que aún apuntan a `/admin` sin prefijo.
- Prueba visual del formulario de dirección y revisión legal de Términos.

## Documentos

- `02-DOCS/wiki/ftd/i18n-admin-parte1.md`
- `02-DOCS/wiki/ftd/i18n-admin-parte2.md`
- Evidencias en `02-DOCS/wiki/ftd/evidencia/2026-11-08-i18n-admin-parte1/` y
  `.../2026-11-08-i18n-admin-parte2/`.

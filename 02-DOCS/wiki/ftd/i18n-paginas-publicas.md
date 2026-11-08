---
author: Gadu
branch: main
status: in-progress
---
# i18n de páginas públicas con next-intl

## Intent

Configurar `next-intl` con `localePrefix: 'as-needed'` (español sin prefijo, inglés y
portugués con prefijo) y migrar las páginas públicas a `app/[locale]/`, extrayendo sus
textos a `messages/{es,en,pt}.json`. La extracción se apoya en el MCP
`next-intl-mcp-server` (`next_intl_scaffold`, `next_intl_internalize`,
`next_intl_validate_icu`, `next_intl_sync_locales`).

## Scope

Dentro:

- `middleware.ts`, `next.config.js`, `src/i18n/{routing,request,navigation}.ts`,
  `messages/*.json`, `app/[locale]/**`.
- Rutas públicas: `/`, `/como-funciona`, `/ganadores`, `/planes`,
  `/sorteos/[slug]` y sus subrutas públicas (`verificar`, `resultados`, `en-vivo`).
- Shell compartido visible en esas páginas: `Navbar`, `Footer` y selector de idioma.
- Componentes presentacionales de las páginas migradas: `RafflesList`,
  `ProtocolSection`, `LiveFomo`, `PrizeCard`, `RaffleMiniCard`, `RaffleCountdown`,
  `ShareRaffleButton`, `ShareButton`, `FotosEntrega`, `OrganizerCard`,
  `OrganizerContact`, `BarraConfianza`, `DrawVerifier`, `RaffleQnA`.

Fuera (explícito, fase 2):

- `app/admin/**`, Server Actions, RPCs, motor de sorteos (`lib/draw-*`,
  `lib/auto-draw*`), pagos (`app/api/checkout`, webhooks, `lib/payments`,
  `lib/mercadopago`).
- `NumbersGrid` (flujo de pago), `SandboxDraw` (simulador), `LiveDrawAnimation`
  (sala en vivo), `RedeemCodeForm`, `MultiPrizeVerifier`, `WinnerCertificate`,
  `RaffleLanding`, `ReportRaffleButton`, `RequestAdminButton`, `NotificationBell`.
  Quedan en español a propósito para no tocar lógica sensible en esta fase.
- Rutas no migradas (`/ayuda`, `/privacidad`, `/terminos`, `/seguridad`,
  `/organizador`, `/perfil`, etc.) siguen sin prefijo y en español.
- Fechas y números se siguen formateando con `es-AR` en varias vistas; la traducción
  de formato por locale queda para la fase 2.

Hallazgo: `/sorteos` (listado) no existe en el repo ni en producción (404). La ruta
pública real es `/sorteos/[slug]`; la verificación se hizo contra
`/sorteos/auto-2026-demo`.

## Checklist

- [x] MCP verificado con `tools/list` y scaffold capturado en evidencia.
- [x] `next-intl` 4.14.9 instalado; configuración final con `localePrefix: 'as-needed'`
  y `localeDetection: false`.
- [x] Catálogos `es`, `en`, `pt` con 496 claves, ICU válido y sin diferencias.
- [x] Rutas públicas movidas a `app/[locale]/` y middleware compuesto con Supabase:
  solo las rutas migradas pasan por next-intl; admin y auth siguen igual.
- [x] Shell (`Navbar`, `Footer`) traducido y selector ES/EN/PT en rutas migradas.
- [x] `/`, `/como-funciona`, `/ganadores`, `/planes` traducidas.
- [x] `/sorteos/[slug]` y subrutas movidas; texto de página y componentes públicos
  principales traducidos.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` verdes.
- [x] Smoke local: `/sorteos/auto-2026-demo` en español y
  `/en/sorteos/auto-2026-demo` en inglés; `/es/...` redirige sin prefijo.
- [ ] Commit y push a `main`.

## Evidence

- Baseline 2026-11-07: `typecheck` OK, `test` 333/333 OK, `build` OK.
- `/sorteos` en producción: 404. `/sorteos/auto-2026-demo`: 200.
- MCP `next-intl-mcp-server@1.0.0`: inspeccionado; sin llamadas de red, sin
  `child_process`, sin escritura de archivos. Cliente stdio en
  `01-TOOLS/NEXT-INTL/mcp-client.mjs`.
- `next_intl_scaffold` con `locales:["es","en","pt"]`, `defaultLocale:"es"`,
  `routing:"locale-prefix"`: salida en
  `02-DOCS/wiki/ftd/evidencia/2026-11-07-i18n-publicas/mcp/scaffold.json`.
- `next_intl_internalize` sobre 13 archivos (páginas y shell): salidas en
  `.../mcp/internalize/`. La herramienta es heurística (regex sobre JSX): sirvió como
  inventario; las claves finales son semánticas y los textos en/pt se revisaron a mano.
- `next_intl_validate_icu`: `valid: true`, 0 errores, 496 claves, 51 interpolaciones,
  11 plurales, 16 textos enriquecidos, en los tres locales. Evidencia en
  `.../mcp/validate-{es,en,pt}-result.json`.
- `next_intl_sync_locales`: `inSync: true`, 496 claves, 0 faltantes/sobrantes.
  Evidencia en `.../mcp/sync-result.json`.
- `npm run build`: OK. Rutas generadas: `/[locale]`, `/[locale]/como-funciona`,
  `/[locale]/ganadores`, `/[locale]/planes`, `/[locale]/sorteos/[slug]` y subrutas.
  Middleware 155 kB.
- Smoke con `next start` en :3100:
  - `/`, `/en`, `/pt`: 200 y `lang` correcto.
  - `/sorteos/auto-2026-demo`: 200, `lang="es"`.
  - `/en/sorteos/auto-2026-demo`: 200, `lang="en"`, sin textos españoles de UI
    (solo quedan datos de la base y el nombre del premio, que son contenido).
  - `/pt/sorteos/auto-2026-demo`: 200, `lang="pt"`.
  - `/es`, `/es/como-funciona`, `/es/sorteos/auto-2026-demo`: 307 a la ruta sin
    prefijo.
  - `/en/sorteos/auto-2026-demo/{verificar,resultados,en-vivo}`: 200.
- Tests nuevos: `lib/i18n-routing.test.ts` fija `as-needed`, `localeDetection:false`,
  paridad de claves y de placeholders/tags entre los tres catálogos. 336 tests OK.

## Next

Commit y push a `main`. Fase 2: traducir `NumbersGrid`, `SandboxDraw`,
`LiveDrawAnimation`, `WinnerCertificate`/`MultiPrizeVerifier`, `RaffleLanding`,
formularios de cuenta y formato de fechas por locale; evaluar si `/sorteos` debe existir
como listado.

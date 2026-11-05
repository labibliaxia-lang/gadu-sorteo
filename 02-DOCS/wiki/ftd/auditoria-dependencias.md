---
author: Gadu
branch: main
status: in-progress
---
# Auditoría de dependencias (npm audit)

## Intent

Separar lo que puede lastimar a Gadu de lo que es ruido de herramientas de desarrollo. El
`npm audit` marca 40 avisos; **ninguno** se arregla sin un cambio *major*, y aplicar
`npm audit fix --force` de golpe rompería la app. El objetivo es decidir con evidencia, no con
el número rojo.

## Método

1. `npm audit --json` para obtener paquete, rango, severidad y **si el arreglo es major**.
2. Clasificar por superficie real: `dependencies` corre en producción; `devDependencies` corre en
   la máquina del que desarrolla y en CI.
3. Comprobar si cada vector está alcanzable en el deploy: build de producción + `next start` +
   pedidos HTTP reales al endpoint afectado.
4. Un aviso se marca como «aplica» solo si el código llega a ese camino.

## Evidencia recogida

- Build de producción y servidor levantado en `:3111` con Next 14.2.35.
- `GET /` → 200 (la app funciona).
- `GET /_next/image?url=…` → **404** en los cuatro casos probados (PNG local, SVG remoto, ancho
  fuera de rango y con `dpl`). El optimizador de imágenes está desactivado por
  `next.config.js:13` (`images.unoptimized: true`, con el comentario de los CVE que ya lo
  justificaba) y no hay `sharp` instalado.
- `next.config.js` **no** define `rewrites` ni servidor propio.

## Hallazgos

| # | Paquete | Gravedad | ¿Aplica? | Motivo / evidencia | Acción |
|---|---------|----------|----------|--------------------|--------|
| 1 | `next` — RCE sin autenticar en el Image Optimization API (SVG/AVIF), DoS del optimizador, crecimiento de caché en disco, DoS por `remotePatterns` | CRÍTICA | **No** | El endpoint `/_next/image` responde 404: el optimizador no está montado. Sin `sharp`. | Ninguna mientras `unoptimized` siga en `true` |
| 2 | `next` — smuggling y SSRF en `rewrites` | ALTA | **No** | No hay `rewrites` ni servidor propio en `next.config.js` | Ninguna |
| 3 | `next` — DoS en Server Actions / RSC, payload sin tope en Edge | ALTA | **Sí** | Toda la app usa Server Actions (`app/**/actions.ts`) y RSC | Migrar a Next 16 (ventana propia) |
| 4 | `next` — RCE sin autenticar en servidores Windows | CRÍTICA | **No** | El deploy es Vercel (Linux) | Ninguna |
| 5 | `next` — XSS con nonces de CSP y con `beforeInteractive` | MEDIA | **No** | No hay CSP ni `Script beforeInteractive` en el código | Ninguna |
| 6 | `next` — envenenamiento de caché en redirects de middleware | MEDIA | **A verificar** | `middleware.ts:147` redirige conservando cookies; el CDN de Vercel cachea por su cuenta | Probar con `Cache-Control` en la respuesta del middleware |
| 7 | `vitest` / `tinypool` / `vite` | CRÍTICA | **No** | `devDependencies`; el aviso de Vitest exige levantar su UI | Actualizar en la ventana de Vitest 5 |
| 8 | `zod` < 4.6.6 — agotamiento de memoria con colecciones gigantes | ALTA | **Marginal** | Los schemas validan cuerpos de Server Actions/API; Vercel corta el payload (~4,5 MB) | Migrar a zod 4 junto con Next 16 |
| 9 | `postcss` — XSS al serializar CSS y lectura arbitraria de `.map` | ALTA | **No** | Corre en el build, no en el runtime | Se actualiza arrastrado por Next |
| 10 | `@sentry/nextjs`, `mercadopago` (vía `uuid`), `eslint-config-next`, `glob`, `minimatch`, `@typescript-eslint/*`, `postcss-selector-parser`, `esbuild` | MEDIA | **No** | Dependencias de build, lint o test | Ventana de mantenimiento |

## Decisión

- **No** se ejecuta `npm audit fix --force`: reemplaza Next 14, React 18, zod 3, Vitest 2 y
  MercadoPago 2 en una sola corrida, en una app que cobra y sortea.
- **No** se ejecuta `npm audit fix` a secas: dejaría 24 avisos (incluidas las 3 críticas) y solo
  mueve utilidades de lint. No cambia nada del runtime.
- Las mitigaciones que ya existen (`unoptimized`, sin `sharp`, sin `rewrites`, deploy Linux)
  cubren hoy los dos RCE del optimizador. Se sostienen mientras nadie las quite: si algún día se
  activa la optimización de imágenes, **este documento deja de valer**.

## Plan de actualización (una sola ventana)

1. Rama o worktree propio; nunca en `main` con usuarios activos.
2. Next 14 → 16: React 19, `cookies()`/`headers()` pasan a `await` (toca `lib/supabase/server.ts`,
   `middleware.ts`, `app/admin/verify/actions.ts` y cada Server Action), `experimental.instrumentationHook`
   ya no existe (`next.config.js:6-9`), `next lint` sale del CLI.
3. React 18 → 19 y `@sentry/nextjs` a la versión compatible.
4. zod 3 → 4: revisar `app/perfil/actions.ts`, `app/admin/verificacion/actions.ts`,
   `lib/landing.ts`, `lib/questions.ts`, `app/api/checkout/route.ts`.
5. Vitest 2 → 5: los 132 tests son la red de seguridad.
6. Gates completos (`typecheck`, `lint`, `test`, `build`) + prueba de humo de pago y sorteo.

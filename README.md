# Gadu Sorteos — Plataforma SaaS de sorteos verificables

Plataforma para crear, vender y sortear premios con **verificación criptográfica**.
Un organizador publica su sorteo, los jugadores eligen números y pagan por
transferencia (prepago manual con comprobante por WhatsApp) y el resultado se
publica con hash público: cualquiera puede comprobarlo.

---

## Stack tecnológico

| Pieza | Uso |
|---|---|
| **Next.js 14 (App Router)** | Web y API routes |
| **TypeScript** | Tipado estricto |
| **Supabase** | Postgres, Auth, Storage y Realtime |
| **Tailwind CSS** | Interfaz |
| **Upstash Redis** | Rate limiting de reservas |
| **Resend** | Emails transaccionales |
| **Mercado Pago** | Checkout Pro (cuando el plan lo habilita) |
| **Zod + React Hook Form** | Validación de formularios |
| **Vitest** | Pruebas unitarias e invariantes |
| **PWA** | Manifest + service worker instalable |

---

## Características principales

- **Motor de sorteo verificable**: compromiso de semilla antes del sorteo,
  hash público del resultado y página de verificación independiente.
- **Prepago manual (WhatsApp)**: el jugador reserva, transfiere y manda el
  comprobante; el organizador aprueba desde el panel. La reserva dura 48 h.
- **5 planes con límites dinámicos**: Free, Starter, Pro, Premium y Social/ONG.
  Los límites (sorteos activos, números, premios y funciones) se configuran en
  la base y se editan desde el panel del Superadmin.
- **Referidos “Invitá y Ganá”**: opt-in por sorteo, con compra mínima, tope por
  persona y entrega del número gratis en el mismo sorteo o en uno exclusivo.
- **KYC obligatorio**: nadie publica sorteos sin identidad verificada, y ningún
  usuario es organizador sin aprobación manual del Superadmin.
- **PWA instalable**: manifest, íconos y service worker.
- **Términos y Condiciones por sorteo**: generados con los datos de KYC del
  organizador; el jugador debe aceptarlos antes de reservar.
- **Notificaciones**: campana con badge y toasts en tiempo real para jugadores,
  organizadores y superadmin.
- **Muro de ganadores** público con nombres protegidos y hash de verificación.
- **Multimoneda**: ARS, MXN, COP, CLP y USD por sorteo.

---

## Lógica de negocio y seguridad

- **La base manda**: los límites de plan, la disponibilidad de números, el KYC y
  el candado de términos se aplican con **triggers, RPCs y RLS**, no solo en la UI.
- **El alta de organizador es estrictamente manual**: solicitud → aprobación del
  Superadmin → KYC aprobado. Ninguna invitación ni registro otorga `admin`
  automáticamente.
- **El dinero está protegido**: el webhook de Mercado Pago verifica la firma
  HMAC antes de leer el body y consulta el pago a la API; los números nunca pasan
  a `sold` desde el cliente.
- **Nadie compra en su propio sorteo** y **nadie se autoasigna un plan**.
- **Las bases legales son obligatorias para publicar** (candado en base).
- Reglas completas y archivos sensibles: [`02-DOCS/ARCHITECTURE_GUARDRAILS.md`](02-DOCS/ARCHITECTURE_GUARDRAILS.md).

---

## Arquitectura

```
app/                  Rutas públicas, panel /admin, /mis-numeros y API routes
components/           NumbersGrid, paneles de admin, UI
lib/                  Lógica pura y clientes de Supabase
lib/supabase/
  client.ts           Navegador (anon key, respeta RLS)
  server.ts           Server Components / Route Handlers (cookies)
  admin.ts            Service role — SOLO servidor
supabase/migrations/  Esquema, RLS, RPCs, triggers (idempotentes)
supabase/tests/       Verificadores SQL (se corren a mano, con ROLLBACK)
02-DOCS/              Guardarraíles, handoffs y decisiones
```

---

## Cómo empezar (local)

### 1. Requisitos

- Node.js 18.17+ y npm.
- Proyecto en [Supabase](https://supabase.com) (Auth con Google + Postgres).
- Opcional: Upstash Redis (rate limiting) y Resend (emails).

### 2. Clonar e instalar

```bash
git clone <url-del-repo>
cd "sorteos herramientas"
npm install
```

### 3. Variables de entorno

Copiá `.env.example` a `.env.local` y completá lo que uses. Las principales:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — **solo servidor** |
| `NEXT_PUBLIC_URL` | URL pública de la app |
| `MP_ACCESS_TOKEN` / `MP_PUBLIC_KEY` / `MP_WEBHOOK_SECRET` | Mercado Pago |
| `CRON_SECRET` | Protege `/api/cron/*` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Emails transaccionales |
| `ADMIN_ACCESS_CODE_HASH` / `ADMIN_SESSION_SECRET` | Panel de verificación |
| `NEXT_PUBLIC_PASSKEYS_ENABLED` / `ADMIN_MFA_REQUIRED` | Seguridad del panel |
| `NEXT_PUBLIC_SENTRY_DSN` | Monitoreo (opcional) |

`.env.example` documenta cada una. **Nunca** subas claves reales al repo.

### 4. Migraciones

Las migraciones se aplican **a mano** en el SQL Editor de Supabase, en orden
(`supabase/migrations/0001…` hasta la última). Cada migración es idempotente y
registra su versión en `public._applied_migrations`.

Para comprobar que quedaron aplicadas:

```sql
select version, note from public._applied_migrations order by version;
```

Los verificadores de `supabase/tests/verificar_*.sql` se corren en el SQL Editor
(abren `begin` y terminan en `rollback`).

### 5. Desarrollo

```bash
npm run dev        # http://localhost:3000
```

### 6. Gates antes de cada commit

```bash
npm run typecheck
npm run lint       # 0 warnings
npm test
npm run build
```

CI los corre en cada push a `main` y en cada PR
(`.github/workflows/ci.yml`, job `gates`).

---

## Crons

| Endpoint | Qué hace |
|---|---|
| `/api/cron/release-reservations` | Libera reservas vencidas y aplica vencimientos de plan |
| `/api/cron/auto-draw` | Ejecuta los sorteos automáticos cuya fecha pasó |

Ambos exigen `Authorization: Bearer <CRON_SECRET>`.

Para probarlos contra el servidor local:

```bash
curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/release-reservations
curl -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/auto-draw
```

En producción los dispara GitHub Actions (`.github/workflows/crons.yml`) y, para
mayor puntualidad, un pinger externo cada minuto.

---

## Despliegue

1. Importar el repo en **Vercel**.
2. Cargar las mismas variables de entorno del `.env.local` en el proyecto de
   Vercel (las `NEXT_PUBLIC_*` y las secretas).
3. Configurar en Supabase:
   - Auth con Google OAuth y la URL de callback del dominio.
   - Storage para portadas e imágenes.
4. Aplicar las migraciones en el SQL Editor.
5. Configurar el webhook de Mercado Pago apuntando a
   `/api/webhooks/mercadopago` con su secreto.
6. Activar en GitHub la protección de rama: **Require status checks → `gates`**,
   para que `main` no reciba código con gates en rojo.

---

## Documentación

- [`02-DOCS/ARCHITECTURE_GUARDRAILS.md`](02-DOCS/ARCHITECTURE_GUARDRAILS.md) — reglas de oro y archivos intocables.
- [`02-DOCS/wiki/handoff-2026-11-06-sql-merge.md`](02-DOCS/wiki/handoff-2026-11-06-sql-merge.md) — estado verificado, migraciones y pendientes.
- [`02-DOCS/wiki/handoff-2026-11-04.md`](02-DOCS/wiki/handoff-2026-11-04.md) — handoff anterior.

---

## Estado del proyecto

Plataforma operativa con sorteos verificables, prepago manual, cinco planes con
límites dinámicos, KYC, referidos con sorteo exclusivo, PWA y candados legales en
base de datos. Toda migración nueva requiere su verificador SQL antes de
considerarse terminada.

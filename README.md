# 🛠️ Sorteo de Herramientas

Aplicación web completa para sortear herramientas: grid virtualizado de
10.000 números con actualización en tiempo real, reserva temporal, pagos con
Mercado Pago (Checkout Pro), panel de administración y sorteo de ganador.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase
(Postgres + Auth + Storage + Realtime) · Mercado Pago · Zod · React Hook Form ·
@tanstack/react-virtual.

---

## 1. Arquitectura (resumen)

- **`app/`** — Rutas públicas (`/`, `/sorteos/[id]`), auth, panel admin, páginas
  de resultado de pago y API routes.
- **`components/`** — `NumbersGrid` (grid virtualizado + Realtime), `PrizeCard`,
  `ImageUploader`, `Navbar` y primitivas shadcn.
- **`lib/supabase/`** — Tres clientes:
  - `client.ts` → navegador (anon key, respeta RLS).
  - `server.ts` → Server Components / Route Handlers (cookies de sesión).
  - `admin.ts` → **service role, solo servidor** (API routes / webhook / cron).
- **`supabase/migrations/0001_init.sql`** — Esquema, RLS, RPCs atómicas, trigger
  y políticas de Storage.

**Flujo de venta (seguridad crítica):**

1. El cliente solo **selecciona** números.
2. `POST /api/checkout` reserva atómicamente (`reserve_numbers`, RPC que usa
   `auth.uid()`) y crea una preferencia de Checkout Pro con
   `external_reference = payments.id`.
3. El webhook de MP **verifica la firma HMAC**, consulta el pago a la API de MP
   y, si está `approved`, llama a `sell_numbers` (solo `service_role`) para pasar
   `reserved → sold` de forma atómica e idempotente.
4. Si no se paga, las reservas expiradas se liberan: al abrir la página del sorteo (gate de un
   minuto) y por el cron diario. Ver «Configurar el cron» para el porqué de la frecuencia.

> ⚠️ Los números **nunca** pasan a `sold` desde el cliente: no existe política de
> `UPDATE` en `raffle_numbers` y `sell_numbers` solo lo ejecuta `service_role`.

---

## 2. Requisitos previos

- Node.js 18.17+ y npm.
- Una cuenta en [Supabase](https://supabase.com).
- Una cuenta en [Mercado Pago Developers](https://www.mercadopago.com.ar/developers).

---

## 3. Crear el proyecto en Supabase

1. Creá un nuevo proyecto en Supabase.
2. En **Project Settings → API**, copiá:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ nunca al cliente).

### Ejecutar la migración

Opción A — SQL Editor (más simple):

1. Abrí **SQL Editor** en Supabase.
2. Pegá el contenido de `supabase/migrations/0001_init.sql`.
3. Ejecutá. (El archivo usa `create ... if not exists`, así que es re-ejecutable).

Opción B — Supabase CLI:

```bash
npm i -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

### Bucket de Storage

La migración ya crea el bucket `raffle-images` (público) y sus políticas
(lectura pública, subida autenticada, edición/borrado del dueño). Verificá en
**Storage** que el bucket exista y sea **public**.

### Primer usuario administrador

Registrate con la app y luego ejecutá en el SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'AQUI_EL_UUID_DEL_USUARIO';
```

El `uuid` lo ves en **Authentication → Users**, o con
`select id, full_name from public.profiles;`.

### Configurar Auth: confirmación de email

#### Desarrollo (registro y login inmediatos)

Para probar sin esperar el correo de confirmación —y sin chocar con el límite de
~2-4 correos/hora del proveedor integrado de Supabase—:

1. Supabase → **Authentication → Providers → Email**.
2. Desactivá **"Confirm email"**.
3. Guardá.

Con esto, `signUp` crea al usuario ya confirmado y podés iniciar sesión al
instante. El trigger `handle_new_user` crea el perfil igualmente (se dispara al
insertar en `auth.users`, haya o no confirmación de email).

#### Producción (SMTP propio para evitar el límite)

El proveedor integrado de Supabase limita los envíos y no es apto para
producción. Configurá un SMTP:

1. Supabase → **Authentication → Providers → Email**.
2. Activá **"Confirm email"** (recomendado en producción).
3. En **SMTP Settings**, completá host, puerto, usuario y contraseña de tu
   proveedor (Resend, SendGrid, Postmark, etc.).
4. Guardá y usá **"Send test email"** para verificar.

Ejemplo con **Resend**: host `smtp.resend.com`, puerto `465` (SSL) o `587` (TLS),
usuario `resend` y contraseña = tu API key de Resend.

---

## 4. Credenciales de Mercado Pago

1. Entrá a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers).
2. Creá una aplicación.
3. Copiá el **Access Token** de producción o de prueba → `MP_ACCESS_TOKEN`.
   - En **Credenciales de prueba** también tenés la **Public Key** → `MP_PUBLIC_KEY`
     (solo informativa en este proyecto; no se usa en el cliente).
4. Configurá el **Webhook** en tu aplicación:
   - URL: `https://TU_DOMINIO/api/webhooks/mercadopago`
   - Evento: **pagos** (`payment`).
   - Generá / definí un **secreto** y copialo a `MP_WEBHOOK_SECRET`.
     - Es el valor que usa `verifyWebhookSignature` para validar `x-signature`.

### Modo test vs producción

- En modo test, usá las **Credenciales de prueba** y tarjetas de prueba de MP
  (p. ej. Visa 4509 9535 6623 3704).
- En producción, usá las credenciales de producción y **volvé a configurar el
  webhook** con la URL pública de producción.

---

## 5. Configuración local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env.local
# (en Windows: copy .env.example .env.local)

# 3. Editar .env.local con tus valores

# 4. Ejecutar
npm run dev
```

Abrí `http://localhost:3000`.

### Comprobaciones antes de dar algo por terminado

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (next/core-web-vitals)
npm test            # Vitest: lib/payments.ts y lib/mercadopago.ts
npm run build       # lo mismo que corre el despliegue
```

Los cuatro tienen que pasar. `npm run build` corre además ESLint, así que un warning de lint también
rompe el build. Los tests cubren la matemática de importes y la verificación de firma del webhook; si
tocás `lib/payments.ts` o `lib/mercadopago.ts`, actualizá su test en el mismo commit.

> Si un `npm run build` falla con `ENOENT` sobre `.next`, casi siempre hay dos builds escribiendo en el
> mismo directorio: revisá que no quede un proceso `node` de un build anterior y que no haya otra
> sesión construyendo el proyecto al mismo tiempo. Borrá `.next` y volvé a correrlo en un árbol quieto.

---

## 5.1. Clave maestra del panel `/admin` (recomendado)

El panel `/admin` exige una re-autenticación con una **clave maestra de 25
caracteres**. La clave **nunca se guarda en el código**: solo su **hash
SHA-256** en la variable `ADMIN_ACCESS_CODE_HASH`.

1. Elegí una clave robusta de 25 caracteres (mayúsculas, minúsculas, números y
   símbolos).
2. Calculá su hash SHA-256:

```powershell
# PowerShell
$s = 'TU_CLAVE_DE_25_CARACTERES'
[BitConverter]::ToString(
  [Security.Cryptography.SHA256]::Create().ComputeHash(
    [Text.Encoding]::UTF8.GetBytes($s)
  )
).Replace('-', '').ToLower()
```

```bash
# Alternativa Node.js
node -e "console.log(require('crypto').createHash('sha256').update('TU_CLAVE').digest('hex'))"
```

3. Pegá el resultado (64 caracteres hexadecimales) en `.env.local`:

```env
ADMIN_ACCESS_CODE_HASH=<hash_sha256_de_tu_clave>
# Opcional pero recomendado: secreto propio para firmar la cookie admin
ADMIN_SESSION_SECRET=<cadena_larga_y_aleatoria>
```

> En **desarrollo**, si no definís `ADMIN_ACCESS_CODE_HASH` se usa un hash de
> respaldo interno (con un aviso en consola). En **producción no hay respaldo**:
> sin `ADMIN_ACCESS_CODE_HASH` el panel queda bloqueado y muestra «El código
> maestro no está configurado en el servidor».
> La cookie `admin_verified` dura 30 minutos, es `HttpOnly` y solo contiene
> una firma HMAC ligada a tu usuario.

---

## 5.2. Sentry (monitoreo de errores)

La app está instrumentada con `@sentry/nextjs` (cliente, servidor y edge).

1. Creá el proyecto en Sentry y copiá el **DSN** (Settings → Projects → *Client Keys*).
2. Pegalo en `.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<orgId>.ingest.sentry.io/<projectId>
# Opcional: fracción de trazas (0 a 1). Por defecto 0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

3. Para **source maps** en el build (stack traces legibles), creá un Auth Token
   con scope `project:releases` y sumalo **solo** al entorno de build:

```env
SENTRY_AUTH_TOKEN=<token>
SENTRY_ORG=gadu-sorteos
SENTRY_PROJECT=gadu-sorteos
```

> Sin DSN el SDK queda inerte y la app funciona igual. Sin `SENTRY_AUTH_TOKEN`
> se saltea la subida de source maps (el build no falla).
> En Next 14 la instrumentación se carga con `experimental.instrumentationHook`
> (ya configurado en `next.config.js`).

Archivos involucrados: `instrumentation.ts`, `sentry.client.config.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts`, `app/global-error.tsx` y
`next.config.js`.

### Vercel

Las variables `NEXT_PUBLIC_*` se **inlinean en el build**: hay que cargarlas en
Vercel y **volver a desplegar**.

1. Vercel → Project → **Settings → Environment Variables**. Agregá el DSN en
   **Production**, **Preview** y **Development**:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | `https://<key>@o<orgId>.ingest.<region>.sentry.io/<projectId>` |

2. Opcional, para **source maps** en producción (stack traces legibles). Cargá
   las **tres**; si falta alguna, el build las saltea sin fallar:

   | Variable | Valor |
   |---|---|
   | `SENTRY_AUTH_TOKEN` | Auth token con scope `project:releases` |
   | `SENTRY_ORG` | `gadu-sorteos` |
   | `SENTRY_PROJECT` | slug del proyecto (Sentry → Settings → Projects) |

3. **Redeploy** (las `NEXT_PUBLIC_*` no se aplican solas): *Deployments → ⋯ →
   Redeploy*, o `npx vercel --prod`.

Con CLI (proyecto linkeado con `npx vercel link`):

```bash
npx vercel env add NEXT_PUBLIC_SENTRY_DSN production
npx vercel env add NEXT_PUBLIC_SENTRY_DSN preview
npx vercel env add NEXT_PUBLIC_SENTRY_DSN development
npx vercel --prod
```

> `SENTRY_AUTH_TOKEN` es **secreto**: va solo en Vercel (o en `.env.local`),
> nunca en el repositorio.

---

## 6. Probar el webhook en local con ngrok

Mercado Pago necesita una URL pública para notificar. Usá [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Copiá la URL HTTPS (p. ej. `https://abc123.ngrok.io`) y:

1. En `.env.local` poné `NEXT_PUBLIC_URL=https://abc123.ngrok.io`.
2. En el panel de MP, configurá el webhook a
   `https://abc123.ngrok.io/api/webhooks/mercadopago`.
3. Configurá `MP_WEBHOOK_SECRET` en `.env.local` y en el panel de MP.

**Probar manualmente sin MP:** podés simular la firma y el body con un script:

```bash
node -e "
const crypto = require('crypto');
const secret = process.env.MP_WEBHOOK_SECRET;
const body = JSON.stringify({ type: 'payment', data: { id: 123456789 } });
const ts = Math.floor(Date.now()/1000).toString();
const v1 = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
console.log('x-signature: ts=' + ts + ',v1=' + v1);
console.log('body:', body);
"
```

> Nota: el webhook **siempre consulta el pago real a la API de MP**, así que para
> una prueba end-to-end usá una tarjeta de prueba de MP y verificá que el pago
> quede `approved` y los números en `sold`.

---

## 7. Desplegar en Vercel

1. Subí el repo a GitHub.
2. En Vercel → **Add New Project** → importá el repo.
3. Configurá las **Environment Variables** (las mismas de `.env.example`).
4. **Deploy**.

### Configurar el cron

`vercel.json` define hoy **un cron diario**:

```json
{ "crons": [{ "path": "/api/cron/release-reservations", "schedule": "0 0 * * *" }] }
```

**Por qué diario y no cada 5 minutos.** Vercel Hobby sólo permite cron diario. La reserva dura 48 h y
el producto necesita liberar los vencidos en minutos, no en un día, así que hay dos caminos:

1. **Sin plan pago (lo que corre hoy):** la página pública del sorteo libera los vencidos al abrirse,
   con gate de un minuto por instancia (`lib/release-expired.ts`). Basta para que un número trabado
   vuelva a estar disponible en minutos.
2. **Plan pago o scheduler externo:** cambiar el `schedule` a `"*/5 * * * *"` (Vercel Pro), o dejar el
   diario y apuntar un cron externo (cron-job.org, GitHub Actions) a
   `GET /api/cron/release-reservations`.

- El endpoint es `GET /api/cron/release-reservations` (también acepta `POST`).
- Configurá `CRON_SECRET` en Vercel. Vercel envía automáticamente
  `Authorization: Bearer <CRON_SECRET>` en cada ejecución.
- **Sin `CRON_SECRET` el endpoint responde 500, no 401**, y lo dice en el log: sin la variable no libera
  nada, y un 401 hacía parecer un intento de acceso no autorizado en vez de configuración faltante.
- Para probar manualmente:
  `curl -H "Authorization: Bearer TU_CRON_SECRET" "https://tu-app.vercel.app/api/cron/release-reservations"`.
  El secreto ya no se acepta por query string.

---

## 8. Checklist de pruebas en local

- [ ] `npm run dev` arranca sin errores.
- [ ] `npm run typecheck` y `npm run build` pasan.
- [ ] Registro crea perfil automáticamente (trigger) con rol `user`.
- [ ] Convertir un usuario a `admin` le habilita `/admin/sorteos`.
- [ ] Admin crea sorteo → se generan 10.000 números (verificá con
      `select count(*) from public.raffle_numbers;`).
- [ ] Admin sube premios con imagen (bucket `raffle-images`).
- [ ] Usuario ve el grid (verde/amarillo/rojo) y se actualiza en tiempo real
      con otra pestaña abierta.
- [ ] Usuario selecciona números → checkout → pago de prueba aprobado.
- [ ] Webhook marca los números como `sold` y guarda el pago (idempotente).
- [ ] Pago rechazado/cancelado libera los números.
- [ ] Reserva sin pagar se libera sola a los 10 minutos (cron).
- [ ] Admin cierra el sorteo y "Sortear ganador" elige un número vendido y lo
      muestra en la página pública.

---

## 9. Notas de seguridad

- La service role key **solo** vive en `lib/supabase/admin.ts` y se usa en
  `/api/checkout`, `/api/webhooks/mercadopago` y `/api/cron/*`.
- El webhook verifica `x-signature` (HMAC-SHA256) y usa `timingSafeEqual`.
- Las transiciones `reserved → sold` son atómicas (un único `UPDATE` en el RPC)
  y el webhook es idempotente.
- RLS bloquea `UPDATE`/`DELETE` directos de `raffle_numbers` desde el cliente.
- Los usuarios solo ven/editan sus propios pagos y su perfil; los admins ven
  todo. El grid y los sorteos son de lectura pública.

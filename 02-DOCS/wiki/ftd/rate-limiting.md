---
author: Gadu
branch: main
status: in-progress
---
# Rate limiting en endpoints críticos

## Intent

Frenar reservas masivas, fuerza bruta y notificaciones abusivas con un límite por usuario/IP, sin
tocar la lógica de pagos ni las RPCs de Supabase.

## Scope

**In:**

- Dependencias `@upstash/ratelimit` y `@upstash/redis`.
- `lib/ratelimit.ts`: limitadores sliding window, fail-open sin configuración y helper de IP.
- `app/api/checkout/route.ts`: 5 requests/minuto por `user.id`.
- `app/api/mock-payment/route.ts`: 5 requests/minuto por `user.id`.
- `app/api/webhooks/mercadopago/route.ts`: 60 requests/minuto por IP, **después** de validar la
  firma para no consumir la cuota de Mercado Pago con tráfico no autenticado.
- `.env.example`: `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
- Tests de extracción de IP y `Retry-After`.

**Out:** rate limiting en cron, login o páginas; bloqueo distribuido por fingerprint; Upstash QStash.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Limitar checkout | `limitCheckout(user.id)` antes de reservar |
| 2 | Limitar mock-payment | `limitMockPayment(user.id)` antes de reservar |
| 3 | Limitar webhook | `limitWebhook(ip)` después de la firma |
| 4 | 429 con Reintento | `Retry-After` en las tres rutas |
| 5 | Fail-open sin Redis | Advertencia y `success: true` |
| 6 | Tests | `lib/ratelimit.test.ts` |

## Evidence

**1-3 — observado.** Las tres rutas llaman al limitador antes de consultar o modificar números. El
webhook lo hace después de `verifyWebhookSignature`, con la IP de `x-forwarded-for`/`x-real-ip`.

**4 — observado.** Las tres respuestas 429 incluyen `Retry-After` calculado desde `reset`.

**5 — observado.** Sin `UPSTASH_REDIS_REST_URL`/`TOKEN`, `createLimiter` devuelve `null`, registra una
sola advertencia y el resultado es fail-open. Una caída de Upstash también hace fail-open con log.

**6 — observado.** Tests de `getClientIp` y `retryAfterSeconds` en `lib/ratelimit.test.ts`.

Gates: `typecheck` 0 · `lint` 0 warnings · `test` 58/58 · `build` 0.

## Límites honestos

- **Fail-open** significa que si Upstash falta o falla, no hay límite. Es una decisión de
  disponibilidad sobre seguridad; queda el log de advertencia.
- El límite de webhook es por IP; si Mercado Pago envía más de 60 notificaciones válidas por minuto
  desde una misma IP, se responderá 429 y MP reintentará. El flujo de pago no se corrompe porque el
  webhook es idempotente.
- La IP depende de los headers del proxy; en Vercel son confiables. En un self-hosted sin proxy
  configurado puede caer en `unknown`.
- No hay rate limiting en cron ni en login en esta fase.

## Next

Configurar Upstash en Vercel (URL y token), aplicar y probar 6 requests de checkout en un minuto para
ver el 429; después evaluar límites para login.

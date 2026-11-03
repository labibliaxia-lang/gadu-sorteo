---
author: Gadu
branch: main
status: in-progress
---
# Mitigaciones de seguridad sin actualización mayor

## Intent

Bajar el riesgo de los hallazgos Críticos/Altos/Medios de la auditoría sin actualizar Next.js ni Zod
todavía, endureciendo los endpoints de dinero y autenticación sin cambiar la lógica de negocio.

## Scope

**In:**

- `next.config.js`: `images.unoptimized = true` para no pasar imágenes subidas por usuarios por el
  optimizador vulnerable de Next 14.
- `supabase/migrations/0061_bucket_mime.sql`: buckets `raffle-images`, `avatars` y `organizer-kyc`
  limitados a `image/jpeg` y `image/png`, 5 MB.
- `app/api/mock-payment/route.ts`: exige `NODE_ENV=development`, `ENABLE_MOCK_PAYMENTS=true` y host
  local; errores internos genéricos.
- `app/api/checkout/route.ts`: el modo mock también exige flag y host local; `NEXT_PUBLIC_URL`
  obligatoria en producción; límite de body de 1 MB; errores de RPC genéricos.
- `app/api/webhooks/mercadopago/route.ts`: límite de body; firma inválida/excepción controlada;
  error de venta genérico.
- `app/api/cron/*`: solo `Authorization: Bearer`; se eliminó `?secret=`.
- `middleware.ts`: verificación HMAC con `crypto.subtle.verify` (timing-safe en Edge); se eliminó el
  hash de respaldo hardcodeado.
- `app/admin/verify/actions.ts`: se eliminó el mismo hash de respaldo para no dejar dos caminos de
  autenticación inconsistentes.
- `.env.example` y `README.md`: `ENABLE_MOCK_PAYMENTS` y ejemplo de cron por header.

**Out:** actualización de Next/Zod, rate limiting persistente (solo se validó tamaño), CSP, pruebas
profundas de penetración.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Mitigar optimizador de imágenes | `unoptimized: true` + MIME de buckets |
| 2 | Endurecer mock-payment | Triple bloqueo entorno/flag/host |
| 3 | Errores genéricos | checkout, webhook y mock con log del error real |
| 4 | Límite de body | `Content-Length` 1 MB en checkout/webhook |
| 5 | Cron sin query secret | Solo header Bearer |
| 6 | HMAC timing-safe | Web Crypto `verify` |
| 7 | Quitar fallback | Sin hash hardcodeado en middleware/verify |
| 8 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** `npm run build` compila con `unoptimized: true`; 0061 restringe MIME y tamaño.
**2 — observado.** El endpoint devuelve 403 si falta cualquiera de las tres condiciones.
**3 — observado.** No quedan `reserveError.message`/`sellError.message` en respuestas; se loguean en
servidor.
**4 — observado.** Ambas rutas devuelven 413 por encima de 1 MB.
**5 — observado.** Se eliminó `querySecret`; el build tipa sin esa variable.
**6 — observado.** Verificación HMAC compatible probada con Node + Web Crypto: firma válida `true`,
firma alterada `false`.
**7 — observado.** No quedan referencias al hash de desarrollo en `middleware.ts` ni en
`app/admin/verify/actions.ts`.
**8 — observado.** `typecheck` 0 · `lint` 0 warnings · `test` 53/53 · `build` 0.

## Límites honestos

- **No se actualizó Next.js ni Zod**: el riesgo crítico/alto de dependencias sigue hasta la rama de
  upgrade. `unoptimized` y MIME reducen la superficie del RCE del optimizador, no eliminan todos los
  CVEs de Next.
- **No hay rate limiting real**: se validó tamaño de body, no cantidad de requests. Queda pendiente
  Upstash/Redis o una tabla de rate limits para checkout.
- **La migración 0061 debe aplicarse**; si no, el bucket sigue aceptando MIME anteriores.
- **El modo mock local ahora requiere** `ENABLE_MOCK_PAYMENTS=true` en `.env.local`; sin eso, el
  checkout local sin credenciales falla cerrado.
- **El cron debe invocarse con header** `Authorization: Bearer`; el query string ya no funciona.
- **Validación de Host del mock** depende del header `Host`; es una defensa de desarrollo, no una
  garantía criptográfica.

## Next

Aplicar 0061 y probar en local: mock bloqueado sin flag, checkout grande con 413, cron con header y
sin query, panel admin con env obligatoria. Después, rama aparte para Next 16 / Zod 4.

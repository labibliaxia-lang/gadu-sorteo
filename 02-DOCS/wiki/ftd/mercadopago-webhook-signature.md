---
author: Gadu
branch: main
status: in-progress
---
# Mercado Pago webhook: verify the signature MP actually sends

## Intent

The webhook answered `401` to every genuine Mercado Pago notification, and `200` to a signature
built with the project's own scheme. Both directions were observed, not inferred.

Mercado Pago signs a manifest, not the request body:

```
id:[data.id];request-id:[x-request-id];ts:[ts_header];
```

- `data.id` comes from the **query string** of the notification URL (lowercased when alphanumeric).
- `x-request-id` comes from its header.
- `ts` comes from the `x-signature` header (`ts=...,v1=...`).
- Absent values are omitted from the manifest.

`lib/mercadopago.ts:100-103` hashed `${ts}.${rawBody}` instead, and the route never read
`x-request-id` or the `data.id` query param, so the manifest could not be computed even in principle.

**Why it matters.** Rejected notifications mean `sell_numbers` never runs in production. MP retries
every 15 minutes and gives up. Meanwhile `release_expired_reservations` frees the reservation: the
buyer paid and does not get the number. The app today only works because checkout falls back to the
development mock.

## Scope

**In:** `verifyWebhookSignature` in `lib/mercadopago.ts`; the call site and the `data.id` fallback in
`app/api/webhooks/mercadopago/route.ts`; the declared SDK range in `package.json` and
`package-lock.json`.

**Out:** the timestamp tolerance (deliberately skipped — MP retries the same notification with the
same `ts`, and a short window would reject legitimate retries; `payments` idempotency already blocks
double selling); any change to `sell_numbers`, the cron, RLS or the checkout.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | `verifyWebhookSignature` accepts `{xSignature, xRequestId, dataId}` and returns `{ok, reason}` | Read the function |
| 2 | A notification signed the way MP signs it is accepted by the project code | Executed proof against the real module |
| 3 | A signature forged with the old `${ts}.${body}` scheme is rejected | Same script, inverse case |
| 4 | The route passes `x-request-id` and the `data.id` query param before parsing the body | Read the route |
| 5 | The declared SDK range cannot resolve to a version without the validator | `package.json` + `npm ls mercadopago` |
| 6 | Types hold and the app builds | `npm run typecheck`, `npm run build` |

## Evidence

**1 — observed.** `lib/mercadopago.ts:82-107` declares `WebhookSignatureInput {xSignature, xRequestId,
dataId}` and `WebhookVerification = {ok:true} | {ok:false, reason}`; `verifyWebhookSignature`
(`lib/mercadopago.ts:109-132`) returns `{ok:false, reason:"MissingSecret"}` when the secret is absent,
delegates to `WebhookSignatureValidator.validate` (`:119`), and maps
`InvalidWebhookSignatureError.reason` into the result.

**2, 3, 4 — observed, executed against the real module.** `node --experimental-strip-types` importing
`lib/mercadopago.ts`, secret `test-secret`:

```text
1. firma oficial de MP        -> {"ok":true}
2. firma esquema viejo        -> {"ok":false,"reason":"SignatureMismatch"}
3. sin x-signature            -> {"ok":false,"reason":"MissingSignatureHeader"}
4. data.id en mayúsculas      -> {"ok":true}        (MP firma en minúsculas; el validador lo aplica)
5. sin MP_WEBHOOK_SECRET      -> {"ok":false,"reason":"MissingSecret"}
```

**End-to-end on the running route — observed** (`npm start`, `MP_WEBHOOK_SECRET=test-secret`,
`POST /api/webhooks/mercadopago?data.id=999999999&type=payment`):

```text
1. firma oficial MP    -> 502 {"error":"Error consultando Mercado Pago"}
2. firma esquema viejo -> 401 {"error":"Firma inválida"}
3. sin firma           -> 401 {"error":"Firma inválida"}
```

The `502` in case 1 is the *next* stage failing (no `MP_ACCESS_TOKEN` locally), which means the
signature gate was passed. Cases 2 and 3 are the gate refusing.

**5 — observed.** `package.json:20` → `"mercadopago": "^2.13.0"`; `npm install --package-lock-only`
→ `up to date`; `package-lock.json:18` → `"mercadopago": "^2.13.0"`, resolved `2.13.0`
(`package-lock.json:1030-1032`).

**6 — observed.** `npm run typecheck` → 0 errors. `npm run build` → success (`ƒ Middleware 86.8 kB`,
28 routes) **after** deleting a corrupt `.next`: the first attempt died with
`PageNotFoundError: Cannot find module for page: /_document`, caused by the earlier `next start`
being killed mid-write, not by this change. A clean rebuild passed.

## Next

Exercise one real test-mode payment once `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET` are set: the panel
of Mercado Pago should show the notification delivered with `200`, and the numbers should move
`reserved → sold` without touching the mock.

---
author: Gadu
branch: main
status: in-progress
---
# Fail closed: mock payment and admin master code

## Intent

Close the two defects the ratified constitution names against principles 16 and 19. Both give away
something valuable when an environment variable is missing:

- `app/api/checkout/route.ts:17-20,131` — `isMockMode()` treated an absent or `TEST`/`mock`
  `MP_ACCESS_TOKEN` as "simulate the payment" **in any environment**, and the mock branch calls
  `sell_numbers`. In production that marks numbers `sold` without money.
- `middleware.ts:11-12` and `app/admin/verify/actions.ts:14-15` — a hardcoded
  `DEFAULT_ACCESS_CODE_HASH` was the fallback when neither `ADMIN_ACCESS_CODE_HASH` nor
  `ADMIN_ACCESS_CODE` is set, so the admin panel unlocked with a key that is in the repository.

Worth doing now because the first real sale depends on neither path being livable in production.

## Scope

**In:** the mock branch in the checkout route; the master-code fallback in the middleware and the
verify action; the verify page's error message so a locked panel is diagnosable; the README note that
documented the old fallback.

**Out:** the Mercado Pago signature manifest question (`lib/mercadopago.ts:100`, finding #3) — it needs
MP's current docs and is a separate change; the missing ESLint config and test runner (finding #4);
any change to the reservation RPCs, the webhook, or the schema.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | `isMockMode()` returns `false` when `NODE_ENV === "production"` | Read the function; grep shows the guard |
| 2 | Production without credentials answers `503` before `reserve_numbers`, never 200 + `sold` | Read the guard placement above the `reserve_numbers` call |
| 3 | Master-code fallback only outside production, with a `console.warn` | Both files change identically; grep for the hash shows it is gated |
| 4 | Production without the hash locks the panel with `?error=unconfigured` | Read `verifyAdmin`; the verify page renders the message |
| 5 | Types hold | `npm run typecheck` → 0 errors |
| 6 | The app still builds | `npm run build` → success |

## Evidence

**1-2 — observed by reading the file after the edit.**
`app/api/checkout/route.ts:16-30`:

```ts
const IS_PRODUCTION = process.env.NODE_ENV === "production";
function hasMpCredentials(): boolean {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  return Boolean(token) && token !== "TEST" && token !== "mock";
}
function isMockMode(): boolean {
  return !IS_PRODUCTION && !hasMpCredentials();
}
```

The fail-closed branch sits at `route.ts:64-75`, and `reserve_numbers` is called at `route.ts:103`:
no reservation happens before the `503`.

**3 — observed by grep.** `IS_PRODUCTION` at `middleware.ts:11` and `app/admin/verify/actions.ts:12`;
`if (IS_PRODUCTION) return null;` at `middleware.ts:42` and `actions.ts:41`; the constant renamed
`DEV_FALLBACK_ACCESS_CODE_HASH` in both. `DEFAULT_ACCESS_CODE_HASH` no longer exists in the code
(only in this document and the constitution's history).

**4 — NOT OBSERVED, and why.** Showing `?error=unconfigured` requires an authenticated superadmin
session. `SUPABASE_SERVICE_ROLE_KEY` is empty in `.env.local` and there is no local test user, so no
session could be minted. Verified by reading `verifyAdmin` (`actions.ts:96-113`) and the
`ERROR_MESSAGES` map (`app/admin/verify/page.tsx:13-18`). **This check has not been run.**

**5 — observed.** `npm run typecheck` → `tsc --noEmit`, no output, exit 0.

**6 — observed.** `npm run build` → `✓ Generating static pages (25/25)`, 28 routes listed,
`ƒ Middleware 86.8 kB`, no errors or warnings.

**Server probes — observed** against `npm start` (`NODE_ENV=production`, port 3005):

```text
POST /api/mock-payment              -> 403 {"error":"No disponible fuera de desarrollo"}
POST /api/checkout (no session)     -> 401 {"error":"Debes iniciar sesión para participar"}
GET  /api/cron/release-reservations -> 401 {"error":"No autorizado"}
GET  /admin (no session)            -> 307 -> /login
```

The `401` on checkout confirms the authentication check runs before the new `503` guard, as designed.
The `503` branch itself is still unobserved: it needs a real session, same reason as task 4.

## Next

Observe tasks 2 and 4 once a session exists: in a production-like run with `MP_ACCESS_TOKEN` empty
and `ADMIN_ACCESS_CODE_HASH` unset, log in and confirm the checkout answers `503` and `/admin` shows
«El código maestro no está configurado en el servidor». Until then both stay unchecked.

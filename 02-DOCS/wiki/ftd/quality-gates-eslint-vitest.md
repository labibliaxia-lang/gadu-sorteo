---
author: Gadu
branch: main
status: in-progress
---
# Quality gates: ESLint and Vitest

## Intent

The constitution's principle 8 asked for proof on money paths, and principle 6 asked for a type check,
but the repository could prove neither of two things: `npm run lint` had **no config and no eslint
dependency**, so it did nothing, and there was **no test runner at all**. A bar the repo cannot check
is worse than no bar.

Close that: ESLint with `next/core-web-vitals` wired into `npm run lint` (and therefore into
`next build`), and Vitest covering the money logic that already exists.

## Scope

**In:** `eslint@8.57.1` + `eslint-config-next@14.2.35` and `.eslintrc.json`; `vitest@2.1.9`,
`vitest.config.ts` and the `test` / `test:watch` scripts; `lib/payments.ts` (amount rounding and MP
status mapping extracted from the routes so they can be tested without Supabase); the three routes
that now import it; the single pre-existing lint warning in
`app/admin/sorteos/nuevo/page.tsx:142`.

**Out:** coverage thresholds (no coverage provider installed yet), tests for the routes themselves
(they need Supabase mocks; the extracted functions are what carry the arithmetic), e2e/Playwright,
and ESLint flat config (Next 14.2 wants the `.eslintrc` format).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | `npm run lint` runs for real and reports nothing | `next lint` output |
| 2 | `npm test` runs and passes | Vitest summary |
| 3 | Money arithmetic and MP status mapping have unit tests | Test files named and counted |
| 4 | Routes use the shared helpers instead of duplicated math | Read the three routes |
| 5 | Types, lint and build still pass together | `typecheck`, `lint`, `build` |
| 6 | No leftover build process is corrupting `.next` | Process list after the build |

## Evidence

**1 — observed.** `npm run lint` → `✔ No ESLint warnings or errors`, exit 0. Before the change it
reported nothing because there was nothing to run; with the config in place it first surfaced one
waning (`react-hooks/exhaustive-deps` at `app/admin/sorteos/nuevo/page.tsx:142`), fixed by adding
`setValue` to the dependency array (stable in react-hook-form v7).

**2, 3 — observed.** `npm test` → `vitest run`:

```text
 ✓ lib/payments.test.ts (9 tests)
 ✓ lib/mercadopago.test.ts (6 tests)
 Test Files  2 passed (2)
      Tests  15 passed (15)
```

`lib/mercadopago.test.ts` covers: an official MP manifest accepted, the old `${ts}.${body}` scheme
rejected (`SignatureMismatch`), a signature from another secret rejected, a missing header
(`MissingSignatureHeader`), the `data.id` lowercase rule, and the missing secret
(`MissingSecret`). `lib/payments.test.ts` covers rounding (`3 × 0.1 = 0.3`, `7 × 133.33 = 933.31`),
string prices from Postgres, terminal states, and the MP failure mapping.

**4 — observed.** `app/api/checkout/route.ts:129` and `app/api/mock-payment/route.ts:97-100` call
`computeAmount`; `app/api/webhooks/mercadopago/route.ts:105-112,150` call `mapMpFailureStatus` and
`isTerminalPaymentStatus`. The local `TERMINAL_STATUSES` set is gone.

**5 — observed.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or errors`,
exit 0. `npm run build` → exit 0, 28 routes, `ƒ Middleware 86.8 kB`.

**6 — observed, and it is a warning about concurrency.** Two `next build` attempts died with
`ENOENT ... .next\cache\webpack\...` and `.next\server\app\_not-found\page.js.nft.json`. Two causes,
both real:

1. A build from this session (`npm run build`, pid 7980 → `next build`, pid 13152) was still alive
   after its pipeline returned an error, and kept writing into `.next` while the directory was being
   deleted.
2. **Another session was building the same project at the same time.** Files this FTd did not touch
   appeared during the work — `lib/superadmin.ts`, `supabase/migrations/0025_harden_profiles_and_metrics.sql`,
   `app/admin/super/*`, and `components/UserManagementTable.tsx` deleted — and a second `next build`
   (pid 18416) was running when this document was written.

`.next` is a single shared directory: two builds in one folder corrupt it, whoever started them. The
fix is coordination, not code: build from one session at a time, or give each session its own worktree
(`rsc isolation`, `.worktrees/<branch>/`). Killed the leftover processes, cleaned `.next`, rebuilt in
the background and waited: exit 0.

**Consequence for this evidence:** the gates below ran over a tree that already contained the other
session's in-flight refactor, and that session was still building. They passed, but the responsible
check is a re-run in a quiet tree.

## Next

Add a coverage provider and a floor on `lib/` once the routes get their own tests with Supabase
mocks; until then the gate is "the suite passes", not a percentage.

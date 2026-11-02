---
type: constitution
title: sorteos herramientas — Constitution
description: The non-negotiable principles every rsc-sdd phase obeys.
tags: [sdd, constitution]
timestamp: 2026-11-02T03:05:00Z
topic: sdd
version: v1.1.0
---

# sorteos herramientas — Constitution

> Version: v1.1.0 · Ratified: 2026-11-02 · Last amended: 2026-11-02
> The non-negotiable principles every rsc-sdd phase obeys. Stack mechanics live in the code and,
> as they are written down, in `02-DOCS/wiki/stack/*`. This file ratifies the principle and links
> the detail — it does not paste it.
>
> Goal (from onboarding): *Vender números de la rifa de punta a punta: reserva, cobro con Mercado
> Pago y entrega del número al comprador, con un admin que sorte el ganador.*

## 1. Stack canon

1. **TypeScript on Next.js 14 App Router, one package.** Versions pinned in `package.json`
   (`next 14.2.35`, `react 18.3.1`, `typescript ^5.6.3`). Replacing the framework or the router is a
   MAJOR amendment.
2. **`strict: true` stays on** (`tsconfig.json:4`). A cast that defeats the checker (`as never`,
   `as unknown as`) needs a comment saying why — `lib/mercadopago.ts:62-73` is the accepted example.
3. **npm with a committed `package-lock.json`.** No second package manager, no lockfile rewrite
   without a recorded reason.
4. **Supabase is the only persistence, auth and storage layer.** Every schema change lands as a file
   in `supabase/migrations/NNNN_*.sql`; a change made by hand in the dashboard without a matching
   migration is not done.
5. **Money moves through Mercado Pago Checkout Pro only.** `lib/mercadopago.ts` is the single place
   that talks to the MP SDK.

## 2. Quality bar

6. **`npm run typecheck` and `npm run lint` pass with zero errors and zero warnings** before a change
   is called done (`tsc --noEmit`; ESLint `next/core-web-vitals` via `.eslintrc.json`, which `next
   build` also runs).
7. **`npm run build` succeeds** before a change lands. Deployment depends on it; a green dev server
   proves nothing.
8. **Money paths are proven by an observed run, not by intention.** Any change touching
   `app/api/checkout`, `app/api/webhooks/mercadopago`, `sell_numbers` / `release_numbers` /
   `reserve_numbers`, or `lib/payments.ts` ships with the recorded evidence of a real
   reservation → payment → `sold` transition (MP test mode or the documented mock) in its feature
   document.
   *Since 2026-11-02 there is a runner: `npm test` (Vitest) covers `lib/payments.ts` and
   `lib/mercadopago.ts`. A change to money logic adds or updates its unit test in the same commit;
   `npm test` passing is part of done.*

## 3. Conventions

9. **Layering.** `app/` holds routes, pages and Server Actions only; `components/` holds UI;
   `lib/` holds clients and helpers; SQL lives only in `supabase/migrations/`.
10. **The service-role client never reaches the browser.** `lib/supabase/admin.ts` is imported from
    Route Handlers, Server Actions and Server Components only — never from a file marked
    `"use client"`.
11. **Every API route and Server Action parses its input with Zod before use** and answers with an
    explicit status code plus a `{ error }` body (`app/api/checkout/route.ts:8-36`,
    `app/api/mock-payment/route.ts:7-42`). No unvalidated `await request.json()` reaches the
    database.
12. **Commit messages follow the existing shape:** `feat: …`, `fix: …`, `docs: …` with a Spanish
    description of the change, as in the current history.

## 4. Branching & shipping

13. **Work lands straight on `main`** (chosen at install). No branch-per-change ceremony while the
    project has one maintainer; revisiting this is a MINOR amendment.
14. **Git authorship is the human's.** No `Co-Authored-By` for an AI, no "generated with" footer.
    Enforced at the `ship` phase. (History holds 0 such lines; keep it that way.)

## 5. Security & privacy floor

15. **No secret is ever committed.** `.env*` stays gitignored; `NEXT_PUBLIC_*` is reserved for
    values that are safe to ship to the browser. `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`,
    `MP_WEBHOOK_SECRET`, `CRON_SECRET`, `ADMIN_SESSION_SECRET` are server-only.
16. **A number becomes `sold` only through a payment verified against Mercado Pago's API.**
    The atomic transition lives in `sell_numbers`, executable by `service_role` alone
    (`supabase/migrations/0001_init.sql:393-394`), and there is no `UPDATE` policy on
    `raffle_numbers` for clients.
    *Closed 2026-11-02: `isMockMode()` now returns false in production, and a missing credential
    answers `503` before `reserve_numbers` (`app/api/checkout/route.ts:16-30,64-75`).*
17. **Every table has RLS enabled and at least one policy, in the same migration that creates it.**
    Today: 5 tables, 5 `enable row level security`, 19 policies
    (`supabase/migrations/0001_init.sql`).
18. **Idempotency and source of truth.** A webhook never trusts its body for money: it verifies the
    HMAC signature, then re-reads the payment from MP (`app/api/webhooks/mercadopago/route.ts:26-32,
    56-96`). Re-delivery of the same event changes nothing.
    *Closed 2026-11-02: the mismatch was real. `verifyWebhookSignature` now delegates to the SDK
    validator over the official manifest `id:…;request-id:…;ts:…;` (`lib/mercadopago.ts:82-132`), and
    the route passes `x-request-id` and the `data.id` query param
    (`app/api/webhooks/mercadopago/route.ts:29-45`). Evidence:
    `02-DOCS/wiki/ftd/mercadopago-webhook-signature.md`.*
19. **Fail closed: no default secret in shipped code.** Outside development the app refuses to act
    when a required secret is missing.
    *Closed 2026-11-02: the fallback now exists only outside production, and production without a
    configured hash locks the panel with `?error=unconfigured` (`middleware.ts:11-43`,
    `app/admin/verify/actions.ts:12-56`).*
20. **Development shortcuts are gated by environment, not by hope.** Any route that fakes a payment
    returns 403 outside development — `app/api/mock-payment/route.ts:21-27` is the reference
    implementation.

## 6. UX / accessibility floor

21. **WCAG 2.1 AA, checked by hand at verify:** the number grid is keyboard-reachable and its
    selection is announced; every form control has a label; focus is always visible; text meets AA
    contrast. No automated axe run — the repo has no e2e harness yet, and a bar nothing checks is
    worse than a bar a person checks.

## 7. Performance budgets

22. **The 10.000-number grid stays virtualized.** No page renders the full list: rendering goes
    through `@tanstack/react-virtual` (`components/NumbersGrid`), and a change that maps all
    numbers into the DOM is rejected regardless of how it looks.
23. **Images go through `next/image` with declared `remotePatterns`** (`next.config.js:3-10`), never
    a raw `<img>` pointing at an undeclared host.

## 8. Knowledge & decisions

24. **Every significant decision is appended to `02-DOCS/wiki/sdd/decisions.md`** with date, options
    considered and the why. The constitution is the highest-order decision record; amendments follow
    the strike-and-append protocol, never a silent edit.

## Definition of Done (the merge bar `verify` runs against)

A change ships only when ALL hold:

- [ ] `npm run typecheck` reports 0 errors (principle 6).
- [ ] `npm run lint` reports 0 errors and 0 warnings (principle 6).
- [ ] `npm test` passes; money logic changed comes with its unit test (principle 8).
- [ ] `npm run build` succeeds (principle 7).
- [ ] Money paths carry observed evidence: reservation → payment → `sold` (principle 8).
- [ ] Layering and the service-role boundary hold (principles 9-10).
- [ ] Every new input is Zod-parsed; errors return an explicit status (principle 11).
- [ ] Lands on `main`, authored by the human, message in the house format (principles 12-14).
- [ ] No secret committed; no new default secret; dev-only paths still 403 in production
      (principles 15, 19-20).
- [ ] New tables ship with RLS and policies in the same migration (principle 17).
- [ ] Numbers reach `sold` only through a verified payment (principle 16).
- [ ] Keyboard, labels, focus and contrast checked where UI changed (principle 21).
- [ ] Virtualization and image rules hold where rendering changed (principles 22-23).
- [ ] Significant decisions logged (principle 24).

## Known debt this constitution names

| Where | What | Owning phase |
|-------|------|--------------|
| `app/api/checkout/route.ts` | ~~Mock auto-approval without a `NODE_ENV` guard (principle 16)~~ — **closed 2026-11-02**, evidence in `02-DOCS/wiki/ftd/fail-closed-payments-and-admin.md` | `ftd` (done) |
| `middleware.ts`, `app/admin/verify/actions.ts` | ~~Hardcoded admin hash usable in production (principle 19)~~ — **closed 2026-11-02**, same document | `ftd` (done) |
| `lib/mercadopago.ts` | ~~Signature manifest to confirm against MP docs (principle 18)~~ — **closed 2026-11-02**: it was wrong; now the official manifest via the SDK validator, evidence in `02-DOCS/wiki/ftd/mercadopago-webhook-signature.md` | `ftd` (done) |
| repo | ~~No ESLint config, no test runner (principle 8)~~ — **closed 2026-11-02**: `npm run lint` and `npm test` are real gates now, evidence in `02-DOCS/wiki/ftd/quality-gates-eslint-vitest.md`. Still open: no coverage floor and no route-level tests | `ftd` (partial) |

## Amendment log (append-only)

| Date | Version | Change | Why |
|------|---------|--------|-----|
| 2026-11-02 | draft | Draft generated by `rsc onboard`. | The SDD floor needs a constitution; ratification is the `constitution` phase's. |
| 2026-11-02 | v1.0.0 | Ratified initial constitution: 24 numbered principles across 8 sections, Definition of Done, and four named pieces of debt. | Project kickoff of the harness; ratified by the repo owner after the `constitution` interview (quality gate = typecheck + build + manual proof; a11y = WCAG 2.1 AA by hand; secrets = fail closed). |
| 2026-11-02 | v1.0.1 | Debt closed for principles 16 and 19; no principle added, removed or reworded. | FTD `02-DOCS/wiki/ftd/fail-closed-payments-and-admin.md`: checkout mock mode gated by `NODE_ENV`, admin fallback limited to development. |
| 2026-11-02 | v1.0.2 | Debt closed for principle 18; the "to verify" note became a "closed" note. No principle added, removed or reworded. | FTD `02-DOCS/wiki/ftd/mercadopago-webhook-signature.md`: the own-signature scheme `${ts}.${body}` was replaced by MP's manifest, verified in both directions. |
| 2026-11-02 | v1.1.0 | **Tightened** principles 6 and 8: `npm run lint` (ESLint `next/core-web-vitals`) joins the type check as a gate, and `npm test` (Vitest) joins the money-path proof. Definition of Done gains both lines. | FTD `02-DOCS/wiki/ftd/quality-gates-eslint-vitest.md`: the repo had no lint config and no runner, so the bar it declared was unverifiable. |

---
author: Gadu
branch: main
status: in-progress
---
# Que los gates se ejecuten solos

## Intent

Los cuatro gates del proyecto existen desde hace unas horas y pasan: typecheck, lint, tests y build. Pero
sólo se ejecutan **cuando alguien se acuerda**. Es el mismo patrón que dejó entrar el hallazgo #2 —una
migración «aplicada» que nadie comprobó— trasladado al proceso: la garantía dependía de la memoria de una
persona.

Cerrarlo es barato: un comando que corre todo, y un workflow que lo corre en cada push.

## Scope

**In:** script `npm run verify` (typecheck + lint + test); `.github/workflows/ci.yml` (los cuatro, en cada
push a `main` y en cada pull request).

**Out:** los checks que necesitan la base (`supabase/tests/verificar_esquema.sql`) — no pueden correr en
CI sin secretos, y darles secretos de producción a un runner es peor que correrlos a mano. El ledger de
migraciones sigue pendiente.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | `npm run verify` corre los tres gates rápidos | Corrida real |
| 2 | El workflow es YAML válido | Parseado |
| 3 | El build no necesita secretos | Build con variables de mentira |
| 4 | El workflow cubre push a main y pull request | Leer el archivo |

## Evidence

**1 — observed.** `npm run verify` → `tsc --noEmit` sin errores, `✔ No ESLint warnings or errors`,
`Tests 37 passed`, exit 0.

**2 — observed.** `.github/workflows/ci.yml` parseado con `js-yaml`: devuelve el objeto esperado
(`name`, `on.push.branches`, `jobs`). No se ejecutó en GitHub Actions: no se puede desde esta máquina.

**3 — observed.** `npm run build` con `NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co`,
`ANON_KEY=ci-placeholder-anon-key` y `NEXT_PUBLIC_URL=http://localhost:3000` → exit 0. Confirma la
suposición del workflow: las rutas son dinámicas y el build no necesita Supabase real.

**4 — observed by reading.** `on: push: branches: [main]` + `pull_request` + `workflow_dispatch`.

## Next

Abrir el primer pull request para ver el workflow en verde. Y, si se quiere cerrar del todo el patrón: el
ledger de migraciones, que es a la base lo que este workflow es al código.

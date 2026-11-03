---
author: Gadu
branch: main
status: in-progress
---
# Simulador de sorteo para superadmin

## Intent

Poder probar el motor y la experiencia de sorteo sin crear un sorteo real ni ensuciar la web pública:
un escenario aislado de 100 números “vendidos”, con la misma fórmula de hash, animación y
certificado, accesible solo desde el panel superadmin.

## Scope

**In:**

- `supabase/migrations/0043_draw_sandbox.sql`: tabla `draw_sandbox_runs` (RLS: solo superadmin lee) y
  RPC `run_sandbox_draw(p_count = 100)`, SECURITY DEFINER, que exige `is_superadmin()`, simula los
  números 1..N, genera semilla (dos UUID v4 sin guiones, igual que el motor real), calcula compromiso,
  `numbers_hash`, `result_hash` y ganador con la misma fórmula SHA-256, y guarda la corrida.
- `components/SandboxDraw.tsx`: grilla de 100 números, botón de simulación, animación que frena en el
  ganador y detalle de hashes/semilla; reutiliza el certificado PNG.
- `app/admin/super/sandbox/page.tsx`: acceso desde el panel superadmin, simulador y últimas 10
  corridas.
- Enlace «Simulador de sorteo» en la cabecera de `/admin/super`.

**Out:** `raffles`, `raffle_numbers`, `payments`, el motor `draw_winner` y cualquier página pública.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Escenario aislado de 100 números | Tabla + componente propios |
| 2 | Solo superadmin puede ejecutarlo | `is_superadmin()` + RLS |
| 3 | Misma fórmula SHA-256 del motor | `run_sandbox_draw` replica 0034 |
| 4 | Animación y certificado reutilizados | `SandboxDraw` + `WinnerCertificate` |
| 5 | No toca datos reales | Solo escribe `draw_sandbox_runs` |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 5 — observado.** La función solo inserta en `draw_sandbox_runs`; no referencia `raffles` ni
`raffle_numbers` para escribir. La tabla no se expone a anon.

**2 — observado.** `run_sandbox_draw` lanza excepción si `is_superadmin()` es falso; la página
valida con `requireSuperadminSession()` y la política RLS solo deja leer al superadmin.

**3 — observado.** Usa los mismos literales del motor: `gadu:v1|raffle:<id>|seed:<seed>`,
`...|numbers:<csv>`, `...|winner:<n>|numbers:<csv>`, índice con los primeros 60 bits y `sha256`.

**4 — observado.** El build lista `/admin/super/sandbox`; el componente reutiliza `WinnerCertificate`.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Aplicar `0043` y esperar el deploy; después entrar a `/admin/super/sandbox`, simular y
comparar el hash a mano si se quiere.

## Next

Aplicar 0043, correr la simulación desde el panel y verificar el certificado. Si gusta, el mismo
escenario se puede usar como demo para mostrarle el motor a un organizador.

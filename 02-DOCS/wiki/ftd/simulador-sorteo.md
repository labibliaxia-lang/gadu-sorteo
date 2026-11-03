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
- `supabase/migrations/0051_sandbox_two_phase.sql`: el simulador pasa a dos fases, igual al flujo real:
  - `create_sandbox_commitment(p_count)`: genera la semilla y publica el **compromiso**, sin revelar
    la semilla.
  - `execute_sandbox_draw(run_id)`: usa la semilla comprometida y los números, calcula ganador y
    huellas, revela la semilla. Idempotente por `executed_at`.
  - `draw_sandbox_runs` acepta filas sin ejecutar (`winning_number`, hashes y `executed_at` nulos).
- `components/SandboxDraw.tsx`: permite elegir **cantidad de números (1..10.000)** y **cantidad de premios
  (1..50, sin repetir ganador)**. El premio 1 usa la selección del motor real; los siguientes se
  calculan con SHA-256 sobre los números restantes. Muestra el hash de cada premio y un
  `results_hash` combinado.
- `supabase/migrations/0055_sandbox_multi_prize.sql`: columnas `prizes_count`, `winners` (JSONB) y
  `results_hash`; RPC `create_sandbox_commitment_v2(p_count, p_prizes)` y
  `execute_sandbox_draw_v2(run_id)`.
- `components/MultiPrizeVerifier.tsx`: recalcula todos los premios en el navegador y muestra un check
  por puesto, más el `results_hash` combinado.
- `components/WinnerCertificate.tsx`: acepta `prizeLabel`; el título del PNG y el nombre del archivo
  indican el puesto. Se renderiza **un certificado por premio**.

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
| 7 | Flujo en dos fases igual al real | 0051 + botones 1/2 |
| 8 | Verificación con hashes en el navegador | `DrawVerifier` reutilizado |
| 9 | Multi-premio con hashes por premio | 0055 + selector de premios |
| 10 | Verificador por premio | `MultiPrizeVerifier` |
| 11 | Certificado PNG por premio | `prizeLabel` + map de certificados |

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

**7, 8 — observado.** `create_sandbox_commitment` inserta la semilla y devuelve solo el compromiso;
`execute_sandbox_draw` bloquea la fila, calcula con la semilla guardada y actualiza ganador/hashes/
`executed_at`. La UI no permite ejecutar sin compromiso y el resultado incluye `DrawVerifier` con la
lista de números simulados.

**9 — observado.** El simulador acepta hasta 10.000 números y 50 premios. El premio 1 conserva la
fórmula del motor real; los siguientes usan `|prize:i|numbers:<restantes>` y excluyen ganadores
previos. Cada premio guarda `{position, number, hash}` en `winners` y el conjunto queda cubierto por
`results_hash`. `result_hash` sigue siendo el del primer premio para compatibilidad.

**10, 11 — observado.** `MultiPrizeVerifier` recalcula compromiso, listado, cada ganador/hash,
`results_hash` y ausencia de repetidos; muestra un check por puesto. Cada premio renderiza su propio
`WinnerCertificate` con `prizeLabel`, hash individual y archivo
`certificado-gadu-<puesto>-<numero>.png`.

**10 — corregido.** La primera versión de `execute_sandbox_draw` fallaba con
`column reference "v_row.winning_number" is ambiguous` porque el `RETURNS TABLE` declara columnas con
el mismo nombre que el record usado en el `RETURN QUERY`. La 0052 devuelve variables escalares sin
`FROM`; no cambia hashes ni lógica.

**Pendiente.** Aplicar `0043` y esperar el deploy; después entrar a `/admin/super/sandbox`, simular y
comparar el hash a mano si se quiere.

## Next

Aplicar `0052`, entrar a `/admin/super/sandbox` y correr las dos fases. Si quedó una fila comprometida
sin ejecutar, se puede ejecutar igual o descartar con «Otra simulación». Después, comparar el hash con
el verificador en pantalla.

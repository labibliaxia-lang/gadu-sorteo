---
author: Gadu
branch: main
status: in-progress
---
# Motor multi-premio real

## Intent

Que un sorteo real pueda adjudicar hasta 30 premios con una sola semilla comprometida, hashes
individuales por premio y un `results_hash` público, sin romper el camino de un solo ganador.

## Scope

**In:**

- `supabase/migrations/0058_multi_prize_engine.sql`:
  - Tabla `raffle_winners` (posición, número, usuario, nombre y hash por premio; únicos por sorteo).
  - `raffles.results_hash`.
  - RLS: lectura pública de ganadores, sin escritura de clientes.
  - Trigger de inmutabilidad de ganadores.
  - Backfill de sorteos viejos: un ganador, mismas huellas.
  - `draw_winner_multi_core`, `draw_winner_multi` (organizador dueño) y
    `draw_winner_multi_system` (service_role).
- `app/admin/sorteos/[id]/actions.ts`: si `winners_count > 1` usa el RPC multi; si es 1 conserva
  `draw_winner`. Los emails se envían a cada ganador.
- `lib/auto-draw.ts`: el cron/fallback elige el RPC multi y notifica a todos; también bloquea si no se
  alcanzó el mínimo de venta.
- `app/admin/sorteos/nuevo/page.tsx` y `EditarSorteoForm.tsx`: campos de mínimo, cantidad de premios
  y regla si no se alcanza.
- `app/sorteos/[id]/page.tsx`: sección «Ganadores por premio» con número, nombre, premio y hash;
  `results_hash` público.
- `app/sorteos/[id]/verificar/page.tsx`: verificador multi-premio y **un certificado por premio**.
- `supabase/migrations/0059_superadmin_prize_limit.sql`: superadmin puede configurar hasta 30 premios
  en cualquier sorteo.

**Out:** reembolsos automáticos y estados `cancelled`/`postponed`. Si no se alcanza el mínimo, el
sorteo se bloquea; la devolución/cancelación sigue siendo manual.

## Fórmula

- Compromiso único de siempre: `SHA-256("gadu:v1|raffle:<id>|seed:<seed>")`.
- Premio 1: fórmula actual del motor real.
- Premio i > 1: `SHA-256("...|prize:<i>|numbers:<restantes>")`, sin repetir ganadores.
- Cada premio guarda su `winner_hash`.
- `results_hash = SHA-256("...|seed:<seed>|winners:<csv>|numbers:<listado completo>")`.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tabla de ganadores e inmutabilidad | 0058 |
| 2 | Motor multi sin tocar el single | RPC separados |
| 3 | Compatibilidad con sorteos viejos | Backfill a posición 1 |
| 4 | Resultados públicos y verificables | Página + `/verificar` |
| 5 | Certificado por premio | `WinnerCertificate` + `MultiPrizeVerifier` |
| 6 | Acciones y auto-draw notifican a todos | `actions.ts` + `auto-draw.ts` |
| 7 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** `raffle_winners` tiene unique por posición y por número; el trigger impide update/
delete. La RLS deja leer a cualquiera y no escribir desde el cliente.

**2 — observado.** `draw_winner_multi_core` repite lock, validación de fecha, semilla, listado y
selección secuencial. `draw_winner` y `draw_winner_core` no se modificaron; con `winners_count = 1`
el sorteo sigue exactamente por el camino anterior.

**3 — observado.** La migración inserta un ganador posición 1 para sorteos `drawn` sin filas y copia
`result_hash` a `results_hash`.

**4, 5 — observado.** La página del sorteo lista los premios cuando hay más de uno. `/verificar` usa
`MultiPrizeVerifier` y renderiza un `WinnerCertificate` por puesto con hash individual.

**6 — observado.** La acción del panel y el auto-draw consultan `winners_count` y notifican a cada
ganador; si no se alcanza el mínimo, el trigger/acción bloquea y registra el motivo.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 46/46. `npm run build` → 0.

## Límites honestos

- **No se probó contra una base real todavía**: falta aplicar 0057–0059 y hacer un sorteo de prueba
  en staging con 2–3 premios.
- `if_not_met = cancel_and_refund` no devuelve dinero automáticamente; queda como gestión manual.
- Los sorteos con `winners_count = 1` siguen siendo el camino principal y no cambian.

## Next

Aplicar 0057, 0058 y 0059; probar en staging: sorteo con 3 premios, mínimo alcanzado, verificar
hashes y certificados; después probar el bloqueo con mínimo no alcanzado.

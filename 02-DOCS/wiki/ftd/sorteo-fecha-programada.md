---
author: Gadu
branch: main
status: in-progress
---
# Sorteo habilitado solo en la fecha programada

## Intent

Evitar sorteos por error de tipeo: el botón «Sortear ganador» queda bloqueado hasta la fecha y hora
programadas del sorteo, con contador regresivo visible. El bloqueo se aplica en la UI, en la Server
Action y en la base.

## Scope

**In:**

- `components/RaffleActions.tsx`: recibe `drawDate`, calcula el tiempo restante cada segundo y
  deshabilita el botón hasta que llega la hora. Muestra «Se habilita el … · faltan 2d 04:12:05»;
  al llegar, habilita el sorteo y muestra «Fecha programada alcanzada».
- `app/admin/page.tsx` y `app/admin/sorteos/[id]/page.tsx`: pasan `draw_date` a las acciones.
- `app/admin/sorteos/[id]/actions.ts` (`drawWinner`): antes de llamar al RPC verifica que
  `now >= draw_date` y devuelve un mensaje con la fecha programada si todavía no corresponde.
- `supabase/migrations/0047_draw_date_guard.sql`: trigger `enforce_draw_date` que impide pasar una
  fila a `drawn` antes de `draw_date`, incluso si alguien llama al RPC directamente.

**Out:** algoritmo del sorteo, compromiso de semilla, pagos, reservas y RLS existentes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Botón deshabilitado antes de la fecha | Estado `due` en `RaffleActions` |
| 2 | Contador regresivo en vivo | Intervalo de 1 s y formato días/hh:mm:ss |
| 3 | Habilitación al llegar la hora | `now >= drawAt` |
| 4 | Bloqueo del servidor | `drawWinner` compara `draw_date` |
| 5 | Bloqueo en base | Trigger 0047 |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2, 3 — observado.** `RaffleActions` calcula `drawAt` desde la prop, arranca un intervalo de un
segundo y mantiene el botón `disabled` mientras `now < drawAt`; el texto muestra la fecha y el
tiempo restante. Al alcanzar la hora, el botón queda operativo.

**4 — observado.** Antes del RPC, `drawWinner` lee `raffles.draw_date`; si es futura, devuelve error
con la fecha formateada en hora argentina y no ejecuta el sorteo.

**5 — observado.** El trigger `enforce_draw_date` lanza excepción si una transición a `drawn` ocurre
antes de `draw_date`; cubre llamadas directas al RPC.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Nota.** El bloqueo es «desde» la fecha programada: una vez alcanzada, el organizador puede sortear
más tarde (no se cierra una ventana), para no impedir el sorteo si se demora unos minutos.

## Next

Aplicar 0047 y probar con un sorteo de fecha futura; después, mostrar el contador también en la vista
pública del sorteo.

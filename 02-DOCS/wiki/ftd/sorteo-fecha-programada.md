---
author: Gadu
branch: main
status: in-progress
---
# Sorteo habilitado solo en la fecha programada

## Intent

Evitar sorteos por error de tipeo: el botÃ³n Â«Sortear ganadorÂ» queda bloqueado hasta la fecha y hora
programadas del sorteo, con contador regresivo visible. El bloqueo se aplica en la UI, en la Server
Action y en la base.

## Scope

**In:**

- `components/RaffleActions.tsx`: recibe `drawDate`, calcula el tiempo restante cada segundo y
  deshabilita el botÃ³n hasta que llega la hora. Muestra Â«Se habilita el â€¦ Â· faltan 2d 04:12:05Â»;
  al llegar, habilita el sorteo y muestra Â«Fecha programada alcanzadaÂ».
- `app/admin/page.tsx` y `app/admin/sorteos/[id]/page.tsx`: pasan `draw_date` a las acciones.
- `app/admin/sorteos/[id]/actions.ts` (`drawWinner`): antes de llamar al RPC verifica que
  `now >= draw_date` y devuelve un mensaje con la fecha programada si todavÃ­a no corresponde.
- `supabase/migrations/0047_draw_date_guard.sql`: trigger `enforce_draw_date` que impide pasar una
  fila a `drawn` antes de `draw_date`, incluso si alguien llama al RPC directamente.

**Out:** algoritmo del sorteo, compromiso de semilla, pagos, reservas y RLS existentes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | BotÃ³n deshabilitado antes de la fecha | Estado `due` en `RaffleActions` |
| 2 | Contador regresivo en vivo | Intervalo de 1 s y formato dÃ­as/hh:mm:ss |
| 3 | HabilitaciÃ³n al llegar la hora | `now >= drawAt` |
| 4 | Bloqueo del servidor | `drawWinner` compara `draw_date` |
| 5 | Bloqueo en base | Trigger 0047 |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2, 3 â€” observado.** `RaffleActions` calcula `drawAt` desde la prop, arranca un intervalo de un
segundo y mantiene el botÃ³n `disabled` mientras `now < drawAt`; el texto muestra la fecha y el
tiempo restante. Al alcanzar la hora, el botÃ³n queda operativo.

**4 â€” observado.** Antes del RPC, `drawWinner` lee `raffles.draw_date`; si es futura, devuelve error
con la fecha formateada en hora argentina y no ejecuta el sorteo.

**5 â€” observado.** El trigger `enforce_draw_date` lanza excepciÃ³n si una transiciÃ³n a `drawn` ocurre
antes de `draw_date`; cubre llamadas directas al RPC.

**6 â€” observado.** `npm run typecheck` â†’ 0. `npm run lint` â†’ `âœ” No ESLint warnings or errors`.
`npm test` â†’ 38/38. `npm run build` â†’ 0.

**Nota.** El bloqueo es Â«desdeÂ» la fecha programada: una vez alcanzada, el organizador puede sortear
mÃ¡s tarde (no se cierra una ventana), para no impedir el sorteo si se demora unos minutos.

## Next

Aplicar 0047 y probar con un sorteo de fecha futura; despuÃ©s, mostrar el contador tambiÃ©n en la vista
pÃºblica del sorteo.

## Enmienda 2026-11-05 â€” contador pÃºblico y fecha fija mientras hay venta

**QuÃ© se agrega.**

- `lib/countdown.ts` + `lib/countdown.test.ts`: estado puro de la cuenta regresiva
  (`running` / `reached` / `inactive`) y formato `2d 04:12:05`. Nunca devuelve negativos.
- `components/RaffleCountdown.tsx`: contador cliente. Antes de montar muestra la fecha exacta, asÃ­ no
  rompe la hidrataciÃ³n; al llegar a cero dice **Â«Fecha alcanzada Â· sorteo pendienteÂ»** en vez de
  reiniciarse o mostrar negativos.
- `app/sorteos/[id]/page.tsx`: contador en el bloque de fecha del sorteo.
- `components/RaffleMiniCard.tsx`: versiÃ³n corta (Â«Cierra en â€¦Â») en las tarjetas.
- `supabase/migrations/0075_lock_draw_date_when_live.sql`: con el sorteo `active`, cambiar
  `draw_date` aborta. Superadmin y `service_role` quedan exceptuados. Para moverla: cerrar y
  republicar. **Escrita, sin aplicar.**
- `app/admin/sorteos/[id]/editar/EditarSorteoForm.tsx`: con el sorteo activo la fecha se muestra
  fija, con la explicaciÃ³n.
- `supabase/tests/verificar_0075.sql`: control (editar el tÃ­tulo sigue permitido) antes del ataque
  (extender la fecha), y `rollback`.

**Por quÃ© por defecto y no opcional.** `raffles.draw_date` es `not null`: todo sorteo tiene fecha.
Un interruptor dejarÃ­a al organizador esconder un dato que ya existe y es parte del contrato, y
permitirÃ­a reiniciar la urgencia cuando le convenga. La cuenta regresiva no es un adorno: es la
promesa de la fecha, y por eso la fecha se vuelve inmutable mientras hay venta.

**Evidencia.** `lib/countdown.test.ts` (12 casos) y el contrato en `lib/security-invariants.test.ts`
sobre la Ãºltima definiciÃ³n de `lock_draw_date_when_live`.

---
author: Gadu
branch: main
status: in-progress
---
# Sorteo automático opt-in con cron y fallback

## Intent

Que un organizador pueda elegir que el sorteo se ejecute solo cuando llega la fecha/hora programada,
sin depender de que alguien tenga la pestaña abierta, y sin duplicar el algoritmo ni abrir la
autorización del RPC manual.

## Scope

**In:**

- `supabase/migrations/0048_auto_draw.sql`:
  - `raffles.auto_draw boolean not null default false` (opt-in apagado por defecto).
  - `draw_winner_core`: el algoritmo de la 0034 sin autorización y con `SELECT … FOR UPDATE` para
    serializar ejecuciones simultáneas.
  - `draw_winner`: mismo nombre/firma y mismas reglas de autorización de siempre; delega en el core.
  - `draw_winner_system`: solo ejecutable por `service_role` (cron/fallback).
  - `auto_draw_runs`: log de intentos (fuente, estado, motivo, ganador).
- `lib/auto-draw.ts`: procesa sorteos opt-in vencidos, cierra ventas, ejecuta el RPC de sistema,
  registra el intento, avisa al ganador y al organizador si falla. Deduplica avisos cada 6 h.
- `app/api/cron/auto-draw/route.ts`: endpoint protegido con `CRON_SECRET` para un scheduler por
  minuto.
- `app/api/cron/release-reservations/route.ts`: red de seguridad diaria que también procesa los
  automáticos vencidos.
- Fallback perezoso en `app/sorteos/[id]/page.tsx`: si la hora ya pasó y nadie lo ejecutó, se
  resuelve al abrir la página.
- `components/AutoDrawToggle.tsx` + `setAutoDraw`: opt-in desde el detalle del sorteo.
- `components/RaffleActions.tsx`: el contador dice «Se sortea automáticamente el …» cuando el modo
  está activo.
- `lib/email.ts`: aviso «El sorteo automático no pudo ejecutarse».

**Out:** algoritmo de selección, compromiso de semilla, pagos, reservas y RLS existentes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Opt-in por sorteo | Columna + toggle |
| 2 | Núcleo compartido sin duplicar algoritmo | `draw_winner_core` |
| 3 | Manual sigue autorizado igual | `draw_winner` wrapper + grants |
| 4 | Ejecución de sistema solo server | `draw_winner_system` revocado |
| 5 | Cron protegido | `/api/cron/auto-draw` + secreto |
| 6 | Fallback al abrir el sorteo | `maybeAutoDrawRaffle` |
| 7 | Log y aviso de fallo | `auto_draw_runs` + email |
| 8 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** La migración agrega la columna con default `false`; el detalle del sorteo ofrece
activar/desactivar y avisa si falta compromiso o ventas.

**2, 3, 4 — observado.** El core contiene el mismo algoritmo de 0034 (hashes, semilla, selección
determinística) y un lock de fila. `draw_winner` conserva las comprobaciones `is_admin()`/dueño.
`draw_winner_system` está revocado para `public/anon/authenticated` y habilitado solo para
`service_role`.

**5, 6 — observado.** El endpoint valida `Authorization: Bearer $CRON_SECRET`; el fallback llama a
`maybeAutoDrawRaffle` desde la página pública y refresca la fila si sorteó. El cron diario existente
también ejecuta el procesamiento como red de seguridad.

**7 — observado.** Cada intento se registra en `auto_draw_runs`; los fallos se notifican al
organizador con deduplicación de 6 horas para no spamear cada minuto.

**8 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0 (`/api/cron/auto-draw`).

**Límites.** Vercel Hobby solo permite cron diario; la ejecución al minuto necesita Vercel Pro o un
scheduler externo que llame al endpoint. Sin scheduler y sin visitas, el sorteo espera al cron diario
o a la próxima apertura del sorteo.

## Next

Aplicar 0048, configurar el scheduler cada minuto con `CRON_SECRET` y probar un sorteo de prueba con
fecha cercana.

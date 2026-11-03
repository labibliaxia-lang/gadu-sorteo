---
author: Gadu
branch: main
status: in-progress
---
# Modos de sorteo por sorteo (manual y automático)

## Intent

Que el organizador elija cómo se ejecuta cada sorteo y que esa decisión esté visible en la página
pública. Premium puede elegir manual o automático; el plan base conserva el modo manual con aviso.

## Scope

**In:**

- `supabase/migrations/0049_manual_draw_notice.sql`: columna `manual_draw_notified_at` para avisar
  una sola vez que un sorteo manual llegó a su hora.
- `components/AutoDrawToggle.tsx`: selector de dos tarjetas, **Manual** y **Automático**, con estado
  elegido, requisito de compromiso/ventas y candado Premium para el automático.
- `app/admin/sorteos/[id]/actions.ts` (`setAutoDraw`): rechaza activar el automático si el plan no es
  Premium ni superadmin; el manual siempre se puede elegir.
- `app/admin/sorteos/[id]/page.tsx`: calcula el plan del organizador y pasa `canAutoDraw`.
- `app/sorteos/[id]/page.tsx`: muestra el modo elegido y la fecha/hora bajo el título del sorteo;
  además dispara el aviso manual una sola vez si la hora ya pasó.
- `lib/auto-draw.ts`: `processManualDrawReminders` y `maybeNotifyManualDraw` (email al organizador,
  una sola vez, sin spamear).
- `lib/email.ts`: plantilla «Tu sorteo ya está listo para ejecutar».
- `app/api/cron/auto-draw` y el cron diario: procesan tanto automáticos como avisos manuales.

**Out:** algoritmo, compromiso de semilla, pagos, reservas y RLS existentes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Elección manual/automático por sorteo | Selector en el detalle |
| 2 | Automático solo Premium | Validación en `setAutoDraw` + UI bloqueada |
| 3 | Manual incluido con aviso | `processManualDrawReminders` |
| 4 | Modo visible en el sorteo público | Texto bajo la fecha |
| 5 | Aviso único | `manual_draw_notified_at` |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** El selector muestra Manual y Automático; el automático aparece con badge
Premium y queda deshabilitado si `canAutoDraw` es falso. La Server Action repite la validación de
plan, así que no se puede activar por API.

**3, 5 — observado.** El procesador busca sorteos manuales vencidos sin aviso, comprueba que tengan
ventas y compromiso, manda el email y marca `manual_draw_notified_at`; el cron y el fallback público
lo invocan.

**4 — observable.** La página pública agrega debajo de la fecha: «Sorteo automático: se ejecuta solo…»
o «Sorteo manual: el organizador lo ejecuta…». El detalle del admin muestra el modo elegido con cuál
está activo.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Aplicar 0049 y probar un sorteo manual y uno automático con fecha cercana. El aviso
por email requiere `RESEND_API_KEY`.

## Next

Probar ambos modos con una cuenta Premium y una base; después, mostrar el modo también en las
tarjetas del listado público.

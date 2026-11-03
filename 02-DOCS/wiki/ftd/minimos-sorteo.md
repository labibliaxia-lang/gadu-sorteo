---
author: Gadu
branch: main
status: in-progress
---
# Reglas de mínimo de venta y límite de premios por plan

## Intent

Que el organizador fije antes de vender el mínimo de números para que el sorteo sea válido, la regla
a aplicar si no se alcanza, y preparar la cantidad de premios con el límite del plan. La regla se
muestra públicamente y se bloquea en la base.

## Scope

**In:**

- `supabase/migrations/0057_raffle_minimums.sql`:
  - `raffles.min_tickets_required` (≥0), `if_not_met` (`extend_date` / `cancel_and_refund`) y
    `winners_count` (1..30).
  - Trigger `enforce_raffle_rules`: valida los campos y el máximo de premios por plan
    (organizador 3 · premium 30 · superadmin 30).
  - Trigger `enforce_min_tickets_before_draw`: impide pasar a `drawn` si no se alcanzó el mínimo.
  - Trigger `freeze_raffle_rules`: congela las reglas después de sortear.
- `app/admin/sorteos/nuevo/page.tsx`: campos de mínimo y regla en el paso 1, con validación
  `min_tickets_required <= max_numbers`; se guardan al crear.
- `app/admin/sorteos/[id]/editar/EditarSorteoForm.tsx` + `actions.ts`: edición de mínimo y regla.
- `app/sorteos/[id]/page.tsx`: aviso público con el mínimo, los vendidos actuales, cuántos faltan y
  la regla elegida.

**Out:** motor multi-premio real, reembolsos automáticos y cambios de estado nuevos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Campos de mínimo y regla | Migración 0057 |
| 2 | Máximo de premios por plan | Trigger `enforce_raffle_rules` |
| 3 | No sortear bajo el mínimo | Trigger `enforce_min_tickets_before_draw` |
| 4 | Regla pública antes de comprar | Badge en la página del sorteo |
| 5 | Reglas congeladas post-sorteo | Trigger `freeze_raffle_rules` |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** Las columnas tienen defaults seguros (`0`, `extend_date`, `1`). El trigger lee
el plan del perfil y rechaza `winners_count` por encima de 3 o 30 según corresponda.

**3 — observado.** Antes de aceptar `drawn`, el trigger cuenta los números `sold` y lanza excepción si
son menores al mínimo. Aplica también al sorteo automático/cron.

**4 — observado.** La página del sorteo muestra mínimo, vendidos, faltantes y la regla elegida; cambia
de ámbar a verde cuando se alcanza.

**5 — observado.** Cambiar mínimo, regla o cantidad de premios después de `drawn` falla.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 46/46. `npm run build` → 0.

## Límites honestos

- `winners_count` ya existe y está validado por plan, pero la UI todavía no lo expone y el motor real
  sigue sorteando **un** ganador. Se usará cuando se implemente el multi-premio real.
- Si no se alcanza el mínimo, el sorteo **no se ejecuta**. Para `extend_date`, el organizador debe
  editar la fecha; para `cancel_and_refund`, no hay reembolso automático todavía: queda como proceso
  manual.
- Los sorteos existentes reciben `min_tickets_required = 0`, por lo que no cambian.

## Next

Aplicar 0057 y probar: crear con mínimo, ver el aviso público, intentar sortear sin alcanzarlo (debe
fallar), y sortear al alcanzarlo. Después, motor multi-premio y el flujo de cancelación/reembolso.

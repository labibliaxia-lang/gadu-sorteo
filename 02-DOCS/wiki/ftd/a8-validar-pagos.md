---
author: Gadu
branch: main
status: in-progress
---
# A8 — Validar pagos con comprobante, nota y deshacer

## Intent

Que «Marcar como pagado» sea una acción consciente y reversible: confirmar que el comprobante se
recibió, dejar una nota interna y poder deshacer un error dentro de una ventana corta.

## Scope

**In:**

- `components/ReservedNumbersPanel.tsx`: buscador por nombre/teléfono/número; checkbox
  «Comprobante recibido» obligatorio antes de habilitar el botón; nota interna opcional por reserva;
  botón «Marcar verificadas» que solo procesa las tildadas; banner con cuenta regresiva y botón
  **Deshacer**.
- `app/admin/sorteos/[id]/actions.ts`:
  - `markReservationPaid(raffleId, numbers, note?)` guarda la nota en `admin_audit_logs` como
    `MARK_PAID`.
  - Nueva acción `undoMarkReservationPaid(raffleId, numbers)`: revierte números marcados hace ≤10
    minutos a `reserved` con el mismo comprador y 48 h nuevas; usa service role porque RLS ya no
    permite UPDATE directo de `raffle_numbers` (0041); exige dueño/superadmin y audita
    `UNDO_MARK_PAID`.
- `app/admin/super/page.tsx`: etiquetas de auditoría para `MARK_PAID` y `UNDO_MARK_PAID`.

**Out:** pagos, webhook, motor de sorteo, base de datos y el flujo de WhatsApp.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El botón exige comprobante verificado | Checkbox + `disabled` |
| 2 | Nota interna persistida en auditoría | `MARK_PAID` con `note` |
| 3 | Reversión dentro de 10 minutos | `undoMarkReservationPaid` + banner |
| 4 | Reversión segura | Solo dueño/superadmin, solo `sold` recientes, vuelve a `reserved` |
| 5 | Búsqueda y marcado masivo solo de verificadas | Panel |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** El botón por reserva queda deshabilitado hasta tildar «Comprobante recibido»;
la nota viaja al Server Action y se inserta en `admin_audit_logs` con los números, el conteo y la nota.

**3, 4 — observado.** La acción de deshacer valida sesión y `owns_raffle`, lee los números vendidos,
filtra `sold_at` de los últimos 10 minutos y actualiza con service role a `reserved`
(`reserved_by = sold_to`, `reserved_until = now + 48 h`, `sold_* = null`). Audita el resultado.

**5 — observado.** El panel filtra por nombre, teléfono o número; el masivo usa solo grupos con
checkbox y pide confirmación.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Probar en el panel real cuando Vercel deploye: marcar, deshacer, esperar el vencimiento
de la ventana y verificar la auditoría en `/admin/super`.

## Next

Con A8 cerrado queda el foco atrapado de diálogos y la pasada completa de contraste; después,
analítica del organizador y wizard de creación.

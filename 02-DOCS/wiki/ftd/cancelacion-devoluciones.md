---
author: Gadu
branch: main
status: in-progress
---
# Cancelación de sorteos y devoluciones manuales

## Intent

Cerrar el caso que quedó abierto cuando un sorteo no alcanza el mínimo o el organizador decide
cancelarlo: pasar a un estado `cancelled`, avisar públicamente y dejar registro de las devoluciones
para gestionarlas manualmente.

## Scope

**In:**

- `supabase/migrations/0063_raffle_cancellation_refunds.sql`:
  - estado `cancelled` en `raffles` + `cancelled_at` y `cancellation_reason`;
  - tabla `refunds` (`pending`/`paid`, monto, comprador);
  - RLS: el comprador ve su devolución, el organizador dueño/superadmin la gestiona;
  - RPC `cancel_raffle`: valida dueño/estado, libera reservas y genera una devolución por comprador
    con números vendidos;
  - trigger que impide cambiar monto/comprador y completa `paid_at`.
- `app/admin/sorteos/[id]/actions.ts`: `cancelRaffle` y `markRefundPaid`.
- `components/RaffleActions.tsx`: botón «Cancelar sorteo» con confirmación y motivo.
- `components/admin/RefundMarkPaidButton.tsx`: marcar devolución como pagada.
- `app/admin/sorteos/[id]/page.tsx`: lista de devoluciones del sorteo cancelado.
- `app/sorteos/[id]/page.tsx` y `app/mis-numeros/page.tsx`: aviso de cancelación y devolución.
- `components/RafflesList.tsx` y mapas de estado: etiqueta «Cancelado».

**Out:** devoluciones automáticas contra Mercado Pago/transferencia, emails masivos de cancelación,
estado `postponed`, y cancelación automática por cron.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Estado `cancelled` válido en DB | Migración 0063 |
| 2 | Cancelar solo dueño/superadmin | RPC + `owns_raffle` |
| 3 | Liberar reservas | Update `reserved` → `available` |
| 4 | Generar devoluciones | `insert into refunds` por comprador |
| 5 | Marcar devolución pagada | Acción + RLS + trigger |
| 6 | Aviso público y en Mis Números | Banners y badge |
| 7 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** El CHECK de `raffles.status` se reemplaza para aceptar `cancelled`; la migración
agrega columnas de cancelación.

**2 — observado.** `cancel_raffle` exige `auth.uid()` dueño o `is_superadmin()`, y solo estados
`active`/`closed`. La acción del panel llama a `owns_raffle` antes.

**3 — observado.** La RPC actualiza las reservas a `available` y limpia `reserved_by`/`reserved_until`
antes de generar devoluciones.

**4 — observado.** Se inserta una fila por comprador con `count(sold) * price_per_number`; el unique
`(raffle_id, user_id)` evita duplicados.

**5 — observado.** El organizador ve la lista y puede marcar «Devuelto»; RLS permite solo al dueño o
superadmin. El trigger bloquea cambios de monto/comprador y setea `paid_at`.

**6 — observado.** La página pública muestra «Sorteo cancelado», el motivo y la instrucción de
contactar al organizador; Mis Números muestra el mismo aviso en el boleto. El listado usa la etiqueta
«Cancelado».

**7 — parcial.** `typecheck` 0 · `lint` 0 warnings · `test` 106/106 (suite actual).
**Build pendiente**: otro proceso está editando 76 archivos de diseño en paralelo y `next build` agota
la memoria del entorno; no se mezcló ese trabajo en esta fase.

## Bloqueo de cierre

Hay cambios externos sin commitear en `app/globals.css`, `app/page.tsx`, `Navbar`, `Footer`, UI y
otras páginas. No se commiteó esta fase para no mezclar ese rediseño. Cuando ese proceso termine, hay
que correr `npm run build`, aplicar 0063 y commitear solo los archivos de cancelación.

## Límites honestos

- **No hay devolución automática de dinero**: el cobro es por transferencia/prepago; el organizador
  debe devolver y luego marcar la fila como pagada.
- La cancelación es **manual**. El mínimo no alcanzado bloquea el sorteo, pero no dispara solo la
  cancelación; el organizador decide hacerlo desde el panel.
- Los números vendidos quedan como historial (no se borran) para poder calcular la devolución.
- No se envían emails masivos de cancelación en esta fase.
- **No se probó contra Supabase real**: falta aplicar 0063 y ejecutar el flujo completo.

## Next

Aplicar 0063; probar con un sorteo de staging con 2 compradores: cancelar, verificar 2 filas
`pending`, marcar una `paid`, comprobar RLS con otro organizador. Después evaluar `postponed` y
notificaciones por email.

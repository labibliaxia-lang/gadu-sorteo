---
author: Gadu
branch: main
status: in-progress
---
# Prepago manual por WhatsApp

## Intent

Gadu Sorteos necesita cobrar sin pasarela mientras se termina de estabilizar Mercado Pago. El flujo
nuevo, que es también el más barato de operar, es el de siempre en una rifa: el comprador elige sus
números, reserva, paga por transferencia y manda el comprobante por WhatsApp; el organizador abre el
panel y marca esos números como pagados.

Además, para poder abrir la plataforma ahora: el bloqueo por KYC se desactiva (reversible) y el botón
de Mercado Pago se oculta en la UI sin borrar su lógica, que sigue intacta para cuando se reactive.

## Scope

**In:**

- `supabase/migrations/0029_manual_prepaid_sales.sql`: reafirma `organizer_mark_sold` (0016), agrega
  `reserve_numbers_prepaid` (hold de 48 h, devuelve solo lo que reservó esta llamada) y
  `organizer_mark_reserved_sold` (reserved → sold atómico, todo o nada). Las tres con grants al rol
  `authenticated` y chequeo de dueño vía RPC.
- `components/NumbersGrid.tsx`: botón principal nuevo («Reservar y enviar comprobante») → reserva con
  el RPC nuevo → modal con resumen y botón verde de WhatsApp (`wa.me`) con sorteo, números y total.
  Mercado Pago y el simulador se ocultan con `NEXT_PUBLIC_ENABLE_MP` (por defecto apagado); el código
  del checkout queda, no se borra.
- `app/admin/sorteos/[id]/page.tsx`: sección «Reservas esperando pago» con los números `reserved`
  agrupados por comprador.
- `components/ReservedNumbersPanel.tsx` (nuevo, cliente): lista la reserva y ejecuta «Marcar como
  Pagado» por comprador, más un «Marcar todas como pagadas» con confirmación.
- `app/admin/sorteos/[id]/actions.ts`: Server Action `markReservationPaid` que llama al RPC estricto
  (solo dueño del sorteo, solo números reservados).
- `app/admin/sorteos/nuevo/page.tsx`: el bloqueo por KYC queda detrás de
  `NEXT_PUBLIC_REQUIRE_KYC` (por defecto apagado). Código intacto, no comentado: reversible con una
  variable.

**Out:** lógica del webhook de Mercado Pago, `app/api/checkout`, `app/api/mock-payment`, `lib/*` de
pagos, `middleware.ts`, RLS y políticas. No se toca nada de dinero del servidor; Mercado Pago solo se
oculta en pantalla.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Migración 0029 con las tres funciones y registro en el ledger | `npm test` (contrato código↔migraciones) |
| 2 | `organizer_mark_sold` existe y mantiene el chequeo de dueño | Lectura de 0029 + `npm test` |
| 3 | Reserva prepaga devuelve solo lo reservado en esta llamada | Lectura del RPC |
| 4 | Marcar pagado es atómico y solo con números reservados | Lectura del RPC + build |
| 5 | NumbersGrid reserva y abre modal con WhatsApp | Lectura + `npm run build` |
| 6 | MP y simulador ocultos por defecto, código conservado | Grep del flag + lectura |
| 7 | Panel admin lista reservas y marca pagado | Lectura de la página y del componente |
| 8 | KYC desactivado por defecto y reversible | Lectura del gate |
| 9 | Tipos, lint, tests y build limpios | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` |

## Evidence

**1 — observado.** `supabase/migrations/0029_manual_prepaid_sales.sql` crea/reafirma las tres
funciones y cierra con `insert into public._applied_migrations ('0029')`. `npm test` → 4 archivos,
**38 tests pasados**, incluido `lib/migrations.test.ts`, que exige que toda RPC usada en el código
esté declarada y que toda migración desde 0028 se registre en el ledger.

**2 — observado.** `organizer_mark_sold` quedó re-creada idempotente con `is_admin()` + dueño
(`created_by = auth.uid()`) o superadmin, igual que 0016. No se cambió su comportamiento para no
romper el panel de números existente.

**3 — observado.** `reserve_numbers_prepaid` valida sesión, 1–100 números, rango 1–10000, sorteo
`active` y hold entre 1 y 72 h; libera solo reservas vencidas del propio usuario y devuelve
`array_agg` del `UPDATE ... RETURNING`, es decir, **solo lo que reservó esta llamada**.

**4 — observado.** `organizer_mark_reserved_sold` actualiza únicamente filas `status='reserved'` con
`reserved_by` no nulo, asigna `sold_to = reserved_by` y, si `row_count` no coincide con el array
pedido, lanza excepción: el UPDATE se revierte completo. Grants solo a `authenticated`.

**5 — observado.** `components/NumbersGrid.tsx`: el botón principal es «Reservar y enviar
comprobante»; llama al RPC nuevo y abre un modal con los números, el total y el botón verde
`wa.me` armado con título, números y total. Si el organizador no cargó WhatsApp, no reserva y avisa.
Una reserva parcial abre el resumen con los que sí quedaron (aviso ámbar) en vez de trabar la
selección.

**6 — observado.** `MP_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MP === "true"` (por defecto
`false`): el bloque de Mercado Pago y el simulador quedan ocultos y el código sigue en el archivo.
No se tocó `app/api/checkout`, `app/api/mock-payment` ni el webhook.

**7 — observado.** `app/admin/sorteos/[id]/page.tsx` arma grupos por comprador (nombre, teléfono,
números, vencimiento) y los pasa a `components/ReservedNumbersPanel.tsx`, que llama a
`markReservationPaid` (`app/admin/sorteos/[id]/actions.ts`). El RPC es el que exige dueño o
superadmin: un admin ajeno recibe «No autorizado» aunque vea la pantalla (hallazgo de auditoría
previo, fuera de este alcance).

**8 — observado.** En `app/admin/sorteos/nuevo/page.tsx`, el bloqueo por KYC quedó como
`if (REQUIRE_KYC && verificationStatus !== "approved")`, con
`REQUIRE_KYC = process.env.NEXT_PUBLIC_REQUIRE_KYC === "true"` (apagado por defecto, reversible).

**9 — observado.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → exit 0, `✓ Compiled successfully`, 25 páginas, 28 rutas,
`/sorteos/[id]` 6.92 kB y `/admin/sorteos/[id]` 4.18 kB.

**Pendiente de observación real:** aplicar `0029` en Supabase. El build prueba que compila, no que
el RPC exista en la base; hasta correr la migración, reservar falla y la sección de reservas queda
vacía.

## Next

Aplicar 0029 en el SQL Editor, probar una compra de punta a punta (reservar → WhatsApp → marcar
pagado → ver `sold` en la página pública) y decidir si los mensajes de compra/venta manual suman a
la «recaudación estimada» del dashboard, que hoy solo cuenta filas de `payments`.

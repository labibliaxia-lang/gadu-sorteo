---
author: Gadu
branch: main
status: in-progress
feature: notificaciones-organizador
---

# Notificaciones del organizador: bandeja de decisiones

## Intent

Que el organizador se entere **en el momento** de que alguien reservó números y pueda decidir desde
un solo lugar: aprobar al ver el comprobante, liberar si no pagó, o ampliar la reserva. Hoy el único
aviso es un email, el panel de números no se actualiza solo, y la reserva vence a los 10 minutos
mientras el comprobante llega por WhatsApp.

La idea central: **una notificación no es un mensaje, es una tarea con vencimiento**. La bandeja
tiene que decir "hay 3 decisiones pendientes, la más urgente vence en 4 minutos", no "tenés 3
mensajes".

## Scope

**Fase 1 — la bandeja (este documento).**

- Tabla `notifications` con RLS: cada organizador ve solo las suyas, el superadmin todas. El
  cliente no inserta: las crea el servidor.
- Aviso al reservar (`reservation_pending`) con números, comprador, monto y `expires_at`, generado
  desde `reserve_numbers` y `reserve_numbers_prepaid`: **una notificación por reserva**, no por
  número.
- Aviso informativo de pago acreditado (`payment_approved`) desde el webhook.
- Aviso de reserva vencida (`reservation_expired`) desde el cron que libera.
- Página `/admin/notificaciones` con pestañas **Pendientes** e **Historial**, tarjetas ordenadas por
  vencimiento y acciones: **Aprobar** (marca vendido), **Liberar**, **Ampliar +15 min**,
  **Pedir comprobante** (WhatsApp con texto prearmado), **Marcar leída**.
- Campana en el panel con contador de pendientes, actualizada por Realtime.
- Contrato: aprobar y liberar reutilizan `markNumbersSold` y `releaseNumbers`; ampliar usa una RPC
  nueva `extend_reservation`.

**Fuera de fase 1:** subir el comprobante dentro de la app (fase 2), devolución por número
(fase 3), digest por email y métricas (fase 4). El TTL sigue en 10 minutos; se compensa con
"ampliar".

## Modelo de datos

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,   -- organizador
  type text not null check (type in ('reservation_pending','payment_approved',
                                     'reservation_expired','refund_requested',
                                     'draw_ready','report_pending')),
  raffle_id uuid references public.raffles (id) on delete cascade,
  subject_user_id uuid references auth.users (id) on delete set null,   -- comprador
  payload jsonb not null default '{}',                                   -- números, monto, etc.
  priority text not null default 'normal' check (priority in ('urgent','normal','info')),
  status text not null default 'pending' check (status in ('pending','read','resolved','expired')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz
);

create index notifications_pendientes_idx
  on public.notifications (user_id, status, priority, expires_at);
```

Reglas:

- **RLS**: `select` propio o superadmin; `update` propio (solo `status`, `read_at`, `resolved_at`);
  sin política de `insert` (las crea una función `security definer` o el servidor con service role).
- **Unicidad**: una reserva no puede generar dos avisos para el mismo `raffle_id` + comprador +
  vencimiento; se resuelve con una clave en `payload` o con un índice único parcial.
- **Realtime**: agregar la tabla a la publicación `supabase_realtime`.

## Bandeja

| Elemento | Qué muestra |
|---|---|
| Campana | Contador de `pending` con prioridad `urgent` resaltada |
| Tarjeta pendiente | Comprador, números, monto, origen (MP/transferencia), cuenta regresiva, acciones |
| Pestaña Historial | Resueltas y vencidas, con quién resolvió y cuándo |
| Estado vacío | "No hay decisiones pendientes" (no un panel vacío) |

Acciones y su efecto:

1. **Aprobar** → `markNumbersSold` (los números pasan a `sold`), notificación a `resolved`.
2. **Liberar** → `releaseNumbers`, notificación a `resolved` con motivo.
3. **Ampliar +15 min** → `extend_reservation`, actualiza `expires_at` en la notificación.
4. **Pedir comprobante** → abre WhatsApp con el texto de la reserva y los números.
5. **Marcar leída** → `status = 'read'` (sigue contando como pendiente de trabajo).

## Decisiones (defaults propuestos)

1. **Comprobante dentro de la app: sí, en fase 2.** Fase 1 lo deja por WhatsApp con el botón
   prearmado, para no mezclar dos migraciones de UX.
2. **TTL configurable por sorteo: sí, en fase 2.** En fase 1, 10 minutos fijos + "ampliar +15".
3. **Liberar un número vendido genera devolución registrada: sí (fase 3).** Solo antes de sortear,
   con motivo y aviso al comprador; nunca después del sorteo.

## Fases

| Fase | Contenido | Criterio de cierre |
|---|---|---|
| 1 | Tabla, triggers/RPC, bandeja, campana, Realtime, ampliar | Un comprador reserva y la decisión aparece sin refrescar; aprobar y liberar funcionan desde la tarjeta |
| 2 | Comprobante en la app, TTL por sorteo | El organizador aprueba viendo la imagen y el monto |
| 3 | Devolución por número | Liberar un vendido deja su devolución y su aviso |
| 4 | Digest email, métricas | Tiempo medio de aprobación y reservas vencidas medibles |

## Checklist (fase 1)

| # | Task | Proof it is done |
|---|---|---|
| 1 | Tabla y RLS | Un organizador no ve notificaciones ajenas |
| 2 | Aviso al reservar | Reservar 3 números crea **una** notificación con los 3 |
| 3 | Aviso de pago | El webhook aprobado genera `payment_approved` |
| 4 | Aviso de vencimiento | El cron de liberación genera `reservation_expired` |
| 5 | Bandeja y campana | Contador correcto y pestañas |
| 6 | Realtime | La tarjeta aparece sin recargar |
| 7 | Aprobar | Pasa a `sold` y la notificación a `resolved` |
| 8 | Liberar | Vuelve a `available` y la notificación a `resolved` |
| 9 | Ampliar | `expires_at` +15 min en la reserva y en la tarjeta |
| 10 | Gates | typecheck, lint, tests, build |

## Evidencia

- **Fase 1 implementada y verificada (2026-11-06).**
  - `0089` aplicada: tabla `notifications` con RLS, helper `notificar_reserva`, aviso desde
    `reserve_numbers` y `reserve_numbers_prepaid`, aviso de vencimiento desde
    `release_expired_reservations`, y `extend_reservation` (solo organizador).
  - `verificar_0089.sql`: **7/7** — tabla con RLS, el comprador no ve lo ajeno, reservar crea una
    notificación con los 2 números, el comprador no puede ampliar («No autorizado»), el organizador
    amplía 15 minutos y el vencimiento libera y avisa.
  - `/admin/notificaciones` con pendientes/historial, cuenta regresiva y acciones aprobar, liberar,
    +15 min, pedir comprobante y marcar leída. Campana con contador por Realtime en el panel.
  - Gates: typecheck 0, lint 0, 285 tests, build OK.
- **Lección del verificador (cuarta vez):** el paso 2 dejaba la sesión como comprador y el paso 3
  contaba con esa RLS, así que la fila del organizador parecía inexistente. Los conteos se hacen
  siempre de vuelta en postgres.
- **Cierre de fase 1 (2026-11-06):** `0090` agrega el **teléfono del comprador** al payload (el
  botón «Pedir comprobante» ahora abre WhatsApp con destinatario, normalizado a 54) y
  `notificar_pago_aprobado`, que el webhook llama al acreditar un pago (best-effort: si falla, el
  pago sigue aprobado). `verificar_0090.sql` pendiente de correr.
- Pendiente de fase 1: aplicar `0090`, correr su verificador y probar con dos cuentas reales
  (campana, aprobar, números vendidos).

## Next

1. Migración con la tabla, RLS, índices y publicación Realtime.
2. Inserciones desde `reserve_numbers`, `reserve_numbers_prepaid`, webhook y cron.
3. `extend_reservation` y las tres acciones de la tarjeta.
4. Página, campana y suscripción Realtime.
5. Verificador SQL y prueba de navegador con dos cuentas.

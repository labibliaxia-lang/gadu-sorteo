---
author: Gadu
branch: main
status: in-progress
---
# Avisos al organizador y recordatorios de plan

## Intent

Los emails cubrían al comprador (reserva, pago, premio), pero el organizador se enteraba de todo
entrando al panel, y del vencimiento de su plan no se enteraba nunca. Este cambio agrega el aviso de
nueva reserva y recordatorios automáticos a 7, 3 y 1 día del vencimiento.

## Scope

**In:**

- `lib/email.ts`: `sendOrganizerReservationEmail` (nueva reserva, con números y link al panel) y
  `sendPlanExpiryWarningEmail` (días restantes, fecha de vencimiento y link a `/planes`).
- `app/sorteos/actions.ts`: después del email al comprador, avisa al organizador del sorteo usando
  service role solo para leer su email. Respeta `email_opt_in`, `terms_accepted_at` y `is_banned`.
- `lib/plan-reminders.ts`: recorre los perfiles con `role_expires_at` en los próximos 8 días, envía
  el aviso si caen en 7/3/1 y lo registra para no repetirlo.
- `supabase/migrations/0039_plan_reminders.sql`: tabla `plan_reminder_sends` con unique
  `(user_id, days_before, expires_at)`, RLS sin políticas (solo service role).
- `app/api/cron/release-reservations/route.ts`: después de `release_expired_reservations` y
  `expire_plans`, ejecuta los recordatorios y devuelve `reminders: {sent, skipped, failed}`.

**Out:** cambios en la reserva, en el flujo de WhatsApp, en el cálculo de vencimientos y en pagos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Email al organizador cuando entra una reserva | Lectura de `notifyReservation` |
| 2 | Respeta consentimiento y cuentas suspendidas | Lectura de la consulta al perfil |
| 3 | Recordatorios 7/3/1 sin duplicados | Migración 0039 + helper |
| 4 | El cron los ejecuta y reporta cantidades | Lectura de la ruta |
| 5 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2 — observado.** `notifyReservation` lee `raffles.title, created_by`; si el organizador no es el
comprador, consulta con service role `email, full_name, email_opt_in, terms_accepted_at, is_banned`
y solo envía si hay email, consentimiento y no está suspendido. Un fallo del aviso no revierte ni
bloquea la reserva (todo dentro del try/catch existente).

**3 — observado.** La tabla tiene unique `(user_id, days_before, expires_at)`; el helper consulta si
ya existe antes de enviar y registra el envío después. Si Resend falla (`sendEmail` devuelve false),
no registra y reintenta en la próxima corrida.

**4 — observado.** El cron devuelve `reminders` junto a `released`, `plans` y `plansOk`; un error de
recordatorios no cambia el 500 de la liberación de reservas.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Aplicar `0039`. Para probar los recordatorios sin esperar meses: poner a un usuario de
prueba `role_expires_at = now() + interval '7 days'`, llamar al cron con el secreto y verificar
`reminders.sent = 1`; llamarlo de nuevo debe dar `skipped`.

## Next

Aviso al organizador cuando se le vence el plan ya queda cubierto; sigue rate limiting y tests de
RLS/e2e. Después: sección de planes en Términos y datos fiscales.

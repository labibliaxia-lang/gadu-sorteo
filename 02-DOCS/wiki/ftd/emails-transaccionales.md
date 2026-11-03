---
author: Gadu
branch: main
status: in-progress
---
# Emails transaccionales de respaldo

## Intent

WhatsApp es el canal principal del prepago, pero se pierde si el comprador cierra la conversación. Este
cambio agrega tres correos de respaldo: reserva, pago confirmado y ganador. No cambia la reserva, el
sorteo ni el flujo de WhatsApp: solo agrega el aviso después de cada hecho consumado.

## Scope

**In:**

- `lib/email.ts` (nuevo): `sendEmail()` contra la API HTTP de Resend (sin SDK, sin dependencias),
  timeout de 5 s y contrato de no lanzar nunca. Plantillas con estilos inline para reserva, pago y
  premio. Se configura con `RESEND_API_KEY` y `RESEND_FROM_EMAIL` (solo servidor).
- `app/admin/sorteos/[id]/actions.ts`: `markReservationPaid` avisa a los compradores de los números
  marcados; nueva Server Action `drawWinner` que envuelve el RPC `draw_winner` y avisa al ganador.
- `app/sorteos/actions.ts` (nuevo): `notifyReservation`, llamada desde el grid después de reservar.
  Valida que los números estén efectivamente reservados por la sesión antes de enviar.
- `components/NumbersGrid.tsx`: dispara `notifyReservation` en segundo plano después de la reserva.
- `components/RaffleActions.tsx`: el botón de sortear usa la Server Action `drawWinner`.
- `.env.example`: documenta las dos variables nuevas.

**Out:** base de datos (sin migración), lógica de pagos, webhook, flujo de WhatsApp y cualquier
cambio en el RPC de sorteo o en el motor.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | `sendEmail` con Resend server-only y sin filtrar la API key | Lectura de `lib/email.ts` |
| 2 | Email de reserva después de reservar, sin bloquear | Lectura de `notifyReservation` + grid |
| 3 | Email de pago aprobado al comprador correcto | Lectura de `notifyPaidBuyers` |
| 4 | Email al ganador al sortear | Lectura de `drawWinner` |
| 5 | Los emails no rompen ni bloquean la operación | Helpers con try/catch y `void` |
| 6 | Sin configuración, todo sigue funcionando | `sendEmail` devuelve false y loguea |
| 7 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** `lib/email.ts` usa `fetch` contra `https://api.resend.com/emails` con
`Authorization: Bearer $RESEND_API_KEY`; si falta la key o el remitente, avisa por consola y devuelve
`false`. No hay `NEXT_PUBLIC_` en las variables y ningún componente cliente importa el módulo.

**2 — observado.** `NumbersGrid` llama `void notifyReservation(raffleId, reserved)` después de
confirmar la reserva. La acción verifica sesión, que los números estén `reserved` a nombre del usuario
y que el sorteo exista; si no, no envía nada. La reserva sigue siendo el mismo RPC de siempre.

**3 — observado.** `markReservationPaid` dispara `notifyPaidBuyers` en segundo plano: lee con service
role los `sold_to` de los números recién vendidos y sus emails, y manda un correo por comprador. El
título del sorteo se lee antes de responder (una consulta chica).

**4 — observado.** La nueva Server Action `drawWinner` llama al RPC `draw_winner` (mismas
validaciones), lee `winner_user`, obtiene su email con service role y dispara `sendWinnerEmail`. El
botón del panel usa la acción en lugar del RPC directo.

**5 — observado.** Los avisos de pago y premio se esperan dentro de la Server Action (`await`), porque
en Vercel una promesa suelta puede congelarse cuando termina la respuesta. La operación de negocio ya
está confirmada antes del envío, así que un fallo de Resend no la revierte. La reserva se notifica con
una acción propia que también espera el envío. `sendEmail` tiene timeout de 5 s y nunca lanza.

**6 — observado.** Sin `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, `sendEmail` no hace red: devuelve `false`
y loguea. La app funciona igual.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Consentimiento (0036) — implementado.** `supabase/migrations/0036_email_consent.sql` agrega
`terms_accepted_at` y `email_opt_in` (default `true`), backfillea la aceptación de las cuentas
existentes con su fecha de alta y un trigger completa la aceptación al crear el perfil (los Términos
publicados dicen que registrarse implica aceptarlos). `/perfil` muestra una tarjeta «Avisos por
email» para activar/desactivar; al activar se registra `terms_accepted_at` si faltaba, con enlaces a
Términos y Privacidad. Los tres envíos verifican `email_opt_in = true AND terms_accepted_at IS NOT
NULL`: si falta cualquiera, no se manda nada.

**Fuera de alcance.** El pago por Mercado Pago (oculto hoy) aprueba números desde el webhook y no
dispara este email: se puede sumar cuando se reactive el cobro automático.

## Next

Aplicar `0036`, configurar `RESEND_API_KEY`/`RESEND_FROM_EMAIL` y probar los tres correos, además de
activar y desactivar los avisos desde `/perfil`. Después: email al organizador cuando entra una
reserva y preferencias por tipo de aviso.

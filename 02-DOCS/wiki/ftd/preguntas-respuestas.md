---
author: Gadu
branch: main
status: in-progress
---
# Preguntas y respuestas públicas por sorteo

## Intent

Abrir un canal de dudas por sorteo, visible para todos y respondido por el organizador, sin tocar
pagos, reservas ni el motor. Con moderación y un límite básico anti-spam.

## Scope

**In:**

- `supabase/migrations/0046_raffle_questions.sql`: tabla `raffle_questions` (raffle, user, question
  ≤300, answer ≤500, timestamps); SELECT público; INSERT autenticado (autor = `auth.uid()`); UPDATE
  solo organizador dueño o superadmin; DELETE autor, organizador dueño o superadmin. Trigger
  `enforce_question_rate_limit` (máx. 3 por usuario/sorteo en 24 h) y trigger
  `guard_question_update` (relaciones inmutables y `answered_at` automático).
- `lib/questions.ts`: Zod (pregunta 5–300, respuesta 2–500) y tipo público.
- `app/qa/actions.ts`: `askQuestion`, `answerQuestion` (verifica dueño del sorteo), `deleteQuestion`
  (autor/organizador/superadmin verificado en servidor además de RLS).
- `components/RaffleQnA.tsx`: lista con badge Pendiente/Respondida, autor, fecha, respuesta oficial,
  formulario para preguntar (logueado) y eliminación para autor/moderador. En modo admin muestra
  textarea de respuesta por pregunta y ordena pendientes primero.
- `app/sorteos/[id]/page.tsx`: sección debajo de premios/grid con las preguntas y el formulario.
- `app/admin/sorteos/[id]/preguntas/page.tsx` + enlace «Preguntas» en el detalle: cola de respuestas
  del organizador.

**Out:** flujo de pagos, prepago, motor de sorteo y estructura de datos existente.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tabla y límites de longitud | CHECK + Zod |
| 2 | Máx. 3 preguntas/día | Trigger de rate limit |
| 3 | RLS estricta de INSERT/UPDATE/DELETE | Policies + triggers |
| 4 | Preguntas con respuesta oficial | Componente |
| 5 | Panel de respuestas | `/admin/sorteos/[id]/preguntas` |
| 6 | Moderación | Delete autor/organizador/superadmin |
| 7 | Sin HTML | Render React de texto plano |
| 8 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** La tabla tiene CHECK de longitudes y el trigger cuenta las preguntas del mismo
usuario/sorteo en las últimas 24 h; la acción traduce el error a un mensaje claro.

**3 — observado.** INSERT exige `auth.uid() = user_id`; UPDATE usa `owns` por `raffles.created_by`
(o superadmin); DELETE permite autor, dueño o superadmin. `guard_question_update` impide cambiar
autor/sorteo/pregunta y calcula `answered_at`.

**4, 5, 6 — observado.** El componente ordena pendientes primero en admin, muestra la respuesta con
estilo propio en público y ofrece eliminar según permisos calculados en el servidor; el panel admin
reutiliza el mismo componente en modo respuesta.

**7, 8 — observado.** Sin `dangerouslySetInnerHTML`; `npm run typecheck` → 0, `lint` → 0 warnings,
`npm test` → 38/38, `npm run build` → 0 (`/admin/sorteos/[id]/preguntas`).

**Pendiente.** Aplicar `0046` y probar con dos cuentas: comprador pregunta, organizador responde,
autor borra la suya, tercero no puede borrar.

## Next

Aplicar la migración y probar el flujo; después, notificación al organizador cuando entra una
pregunta (email) y contador de pendientes en el panel.

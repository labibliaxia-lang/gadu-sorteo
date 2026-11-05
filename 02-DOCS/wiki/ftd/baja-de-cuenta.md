---
author: Gadu
branch: main
status: in-progress
---

# Baja de cuenta: solicitud, validación y anonimización

## Intent

Que una persona pueda pedir la baja de su cuenta desde la app, sin depender de un mail, y que la
baja se ejecute **sin destruir los registros de dinero ni dejar sorteos sin dueño**. Hoy la
Política de Privacidad reconoce el derecho a eliminar la cuenta, pero el único camino es escribir a
`francofsm84@gmail.com` y que el superadmin borre desde el panel.

Ese borrado, tal como está, tiene dos efectos que nadie quiere:

- `payments.user_id` y `refunds.user_id` son `on delete cascade`: al borrar al comprador
  **desaparecen sus pagos y devoluciones**, y con ellos la trazabilidad contable.
- `raffles.created_by` es `on delete set null`: los sorteos del organizador quedan **sin dueño**,
  con números vendidos que después nadie puede cancelar ni sortear.

## Scope

**In:**

- `supabase/migrations/00XX_account_deletion.sql`:
  - tabla `account_deletion_requests` (id, user_id, requested_at, status
    `pending|approved|rejected|cancelled`, reviewed_by, reviewed_at, note, anonymized_at).
  - RLS: el usuario ve y crea solo su solicitud pendiente; el superadmin ve todas.
  - `payments.user_id` pasa a **nullable** con `on delete set null`; `refunds.user_id` igual.
    Los importes, fechas y referencias al sorteo quedan intactos.
- `app/perfil/page.tsx` + una server action: botón «Pedir la baja», confirmación explícita, y
  estado visible mientras está pendiente, con opción de cancelarla.
- `app/admin/super`: pestaña **Bajas** con el detalle de cada solicitud y el resultado de las
  validaciones, más el botón de aprobar.
- Server action de aprobación (`approveAccountDeletion`), solo superadmin:
  1. Vuelve a correr las validaciones (no confía en el estado de la pantalla).
  2. Anonimiza: vacía nombre, teléfono, DNI, domicilio, bio, redes y avatar del perfil.
  3. Purga las tres imágenes de KYC del bucket `organizer-kyc`.
  4. Pone `anonymized_at` y deja la cuenta de Auth con email sustituido por
     `eliminado+<uuid>@…` e inutilizable, y recién después la borra.
  5. Registra `DELETE_USER` con el detalle en `admin_audit_logs`.
- Endurecer el `deleteUsers` del panel para que aplique las **mismas validaciones** (hoy borra
  cualquier cosa).
- Política de Privacidad: describir el camino nuevo y el plazo de **10 días hábiles**.

**Out:**

- Transferir sorteos a otra cuenta. La baja se bloquea mientras haya sorteos sin resolver.
- Borrar `admin_audit_logs` (son evidencia, no datos del usuario).
- Devoluciones automáticas por Mercado Pago: se siguen haciendo a mano.

## Validaciones (bloquean la aprobación)

| # | Condición | Por qué |
|---|---|---|
| 1 | No tener sorteos en `active` o `closed` como organizador | quedarían sin dueño |
| 2 | No tener pagos en `pending`/`in_process` | hay plata en vuelo |
| 3 | No tener devoluciones en `pending` | hay plata por devolver |
| 4 | No tener números `reserved` ni `sold` en sorteos abiertos | si el sorteo se cancela, no habría a quién devolverle |

Si alguna falla, la solicitud queda **rechazada con el motivo visible** y el usuario puede resolver
el pendiente y volver a pedirla.

## Decisiones

1. **Anonimizar, no borrar la plata.** Los `payments` y `refunds` se conservan con `user_id = null`:
   el importe, la fecha y el sorteo siguen siendo auditables, y la persona deja de ser
   identificable. En el panel se muestran como «usuario eliminado».
2. **Validaciones automáticas y confirmación del superadmin.** El sistema bloquea lo que no
   corresponde; una persona confirma el caso raro (reclamo abierto, historia rara).
3. **Plazo de 10 días hábiles**, publicado en la Política de Privacidad.
4. **Organizador con sorteos abiertos: se bloquea**, no se transfiere. El dueño resuelve sus
   sorteos y recién ahí puede irse.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tabla y RLS de solicitudes | Un usuario ve solo la suya; el superadmin ve todas |
| 2 | Botón y confirmación en `/perfil` | La solicitud aparece en `pending` y se puede cancelar |
| 3 | Validaciones que bloquean | Tests de las cuatro condiciones |
| 4 | Anonimización del perfil | Tras aprobar, los campos personales quedan vacíos y `anonymized_at` seteado |
| 5 | KYC purgado | El bucket no conserva archivos de esa cuenta |
| 6 | Pagos y devoluciones sobreviven | Fila con importe y fecha, `user_id` null |
| 7 | Cuenta de Auth eliminada | El login falla; no queda fila en `profiles` |
| 8 | Auditoría | Fila `DELETE_USER` con el detalle |
| 9 | `deleteUsers` endurecido | Rechaza los mismos casos que la baja self-service |
| 10 | Política actualizada | Texto con camino y plazo |
| 11 | Gates verdes | typecheck, lint, tests, build |

## Evidencia

Pendiente: feature sin implementar. El diagnóstico que la origina está en
`02-DOCS/wiki/handoff-2026-11-04.md` y en el commit `252e6ae` (purga del dorso de KYC).

## Next

1. Escribir la migración y los tests de las validaciones (sin tocar UI).
2. UI de solicitud en `/perfil` y pestaña de bajas en superadmin.
3. Actualizar la Política de Privacidad y borrar el mail manual como único camino.

---
author: Gadu
branch: main
status: in-progress
---

# Smoke test — baja de cuenta

## Objetivo

Comprobar de punta a punta que una persona puede pedir la baja, que el sistema la frena cuando
corresponde, que el superadmin la aprueba o la rechaza, y que **la plata sobrevive** al borrado.

Feature: `02-DOCS/wiki/ftd/baja-de-cuenta.md`.

## Antes de empezar

- **Usá una cuenta descartable.** El borrado es irreversible: no hay forma de recuperar la cuenta,
  el perfil ni los documentos KYC.
- Necesitás dos sesiones: la cuenta de prueba (Google) y tu cuenta de superadmin.
- Tené a mano el uuid de la cuenta de prueba: aparece en `/admin/super/usuarios`.

**No lo corras con una cuenta real ni con la tuya.**

## Escenario 1 — Bloqueo (la cuenta tiene actividad)

1. Con la cuenta de prueba, creá un sorteo y dejala con un número vendido o reservado en un sorteo
   abierto.
2. Entrá a `/perfil` → **Baja de cuenta** → **Pedir la baja de mi cuenta**.
3. **Esperado:** el pedido se rechaza en el momento, con los motivos en castellano
   («Tenés sorteos sin cerrar…», «Participás en sorteos que siguen abiertos…»). No se crea ninguna
   solicitud.

## Escenario 2 — Camino feliz

1. Resolvé la actividad de la cuenta de prueba: cancelá o sorteá su sorteo, y liberá sus números.
2. Opcional para probar la conservación de la plata, desde el SQL Editor:

   ```sql
   insert into public.payments (user_id, raffle_id, numbers, amount, status)
   values ('<uuid-de-la-cuenta>', '<uuid-de-un-sorteo>', '{}', 1234.56, 'approved');
   ```

3. En `/perfil` → **Baja de cuenta** → **Pedir la baja** → confirmar.
4. **Esperado:** la tarjeta pasa a «Tu solicitud está pendiente de revisión» y ofrece cancelarla.
5. En `account_deletion_requests` aparece **una** fila `pending` (el índice único impide dos).
6. Desde tu cuenta de superadmin: `/admin/super` → **Bajas de cuenta**.
7. **Esperado:** la solicitud lista con nombre, mail, motivo y «Sin bloqueos: se puede aprobar».
8. **Aprobar y borrar** → confirmar.
9. **Esperado:**
   - La cuenta desaparece de la lista de usuarios y el login falla.
   - Los documentos KYC ya no están en el bucket `organizer-kyc`.
   - El pago de prueba sigue existiendo, con `user_id` en null.
   - Hay una fila `DELETE_USER` en `admin_audit_logs` con `source: account_deletion_request`.

## Escenario 3 — Cancelar la solicitud

1. Con otra cuenta (o la misma antes de aprobar), pedir la baja.
2. En `/perfil`, tocar **Cancelar la solicitud**.
3. **Esperado:** la fila queda en `cancelled` y el panel de superadmin no la muestra.
4. Volver a pedirla tiene que funcionar (el índice único solo cubre `pending`).

## Escenario 4 — Borrado manual del panel

1. En `/admin/super/usuarios`, seleccioná una cuenta **con actividad** y tocá **Eliminar**.
2. **Esperado:** «No se puede borrar: hay cuentas con actividad (…). Resolvé esos pendientes o forzá
   el borrado con un motivo.»
3. Aceptá forzar. Sin motivo o con menos de 10 caracteres tiene que rechazar.
4. Con un motivo válido, la cuenta se borra y en `admin_audit_logs` queda `forced: true`,
   `forceReason` y la lista de `blockers`.

## Verificación en base

```sql
-- Solicitudes recientes
select id, user_id, status, requested_at, reviewed_by, anonymized_at
  from public.account_deletion_requests
 order by requested_at desc
 limit 5;

-- Evidencia de los borrados
select action, target_email, details, created_at
  from public.admin_audit_logs
 order by created_at desc
 limit 5;

-- La plata sobrevivió
select id, user_id, amount, status, created_at
  from public.payments
 where user_id is null
 order by created_at desc
 limit 5;
```

## Criterios de aceptación

| # | Condición |
|---|---|
| 1 | Una cuenta con actividad no puede pedir la baja y ve el motivo |
| 2 | Una cuenta limpia pide la baja; queda una sola fila `pending` |
| 3 | Cancelar deja la fila en `cancelled` y permite volver a pedir |
| 4 | Aprobar borra la cuenta y los KYC, y conserva el pago sin dueño |
| 5 | La auditoría registra el borrado y el `source`/`forced` |
| 6 | El borrado manual con actividad se bloquea; forzar exige motivo |

## Después de la prueba

- Borrá los sorteos de prueba que hayas creado.
- Si insertaste un pago a mano, no hace falta limpiarlo: es evidencia de la prueba y no está atado
  a ninguna cuenta.

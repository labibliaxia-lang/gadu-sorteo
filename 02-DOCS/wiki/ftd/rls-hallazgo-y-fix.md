---
author: Gadu
branch: main
status: in-progress
---
# Hallazgo de RLS: una cuenta podía editar el sorteo de otra

## Intent

La prueba de aislamiento (`supabase/tests/rls_aislamiento.sql`) falló con
`FALLA: B editó el sorteo de A (1 filas)`. Es un hallazgo real: la política de UPDATE de
`raffles` no estaba aplicando la regla de dueño (quedó una regla permisiva de versiones anteriores),
así que cualquier cuenta autenticada con rol admin podía modificar sorteos ajenos.

## Scope

**In:**

- `supabase/migrations/0041_rls_close.sql`: habilita RLS en las cuatro tablas, **borra todas** las
  políticas existentes de `raffles`, `raffle_numbers`, `prizes` y `payments` (para que no queden
  reglas viejas sumándose con OR) y las recrea con una única regla explícita:
  - sorteo: lectura pública; INSERT/UPDATE/DELETE solo dueño (`created_by = auth.uid()`) o superadmin.
  - números: lectura pública; INSERT solo en sorteo propio; se revoca UPDATE/DELETE a `authenticated`
    (las transiciones van por RPC SECURITY DEFINER).
  - premios: lectura pública; escritura solo con `owns_raffle()`.
  - pagos: cada usuario ve los suyos, el organizador los de sus sorteos; INSERT propio en `pending`.
- `supabase/tests/rls_aislamiento.sql`: agrega diagnóstico antes de probar (si RLS está deshabilitado
  avisa y no da un falso resultado) y verifica que la simulación sea válida (`current_user =
  authenticated` y `auth.uid() = B`).

**Out:** RPC de reservas/sorteo, pagos de Mercado Pago y datos existentes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Políticas viejas eliminadas sin excepción | Migración 0041 recorre `pg_policies` |
| 2 | Sorteo solo editable por dueño/superadmin | Política `raffles_update_owner` |
| 3 | Números sin UPDATE/DELETE directo | `revoke update, delete` + sin políticas |
| 4 | Premios y pagos con regla de dueño | Políticas recreadas |
| 5 | El test distingue falla de simulación inválida | Checks de `current_user` y `auth.uid()` |

## Evidence

**Hallazgo — observado.** El test automático devolvió `FALLA: B editó el sorteo de A (1 filas)`.
La causa más probable es una política permisiva vieja en `raffles` o RLS deshabilitado; la migración
lo cubre de las dos formas.

**Fix — pendiente de verificación.** Aplicar `0041` y volver a correr el test. Si ahora imprime
`OK: B no edita...` y `OK: A sí puede editar...`, el aislamiento quedó cerrado. Si imprime
`PRUEBA INVÁLIDA`, el problema es la simulación del JWT, no la app, y el mensaje dice exactamente qué
falló.

## Next

Aplicar 0041, repetir el test y documentar el resultado. Después: rate limiting (0040) y los tests de
e2e de compra.

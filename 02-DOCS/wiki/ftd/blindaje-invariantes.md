---
author: Gadu
branch: main
status: in-progress
---
# Blindaje de invariantes de seguridad

## Intent

Que ninguna de las protecciones encontradas en la auditoría se caiga sin que alguien lo note. El riesgo real no es volver a tener el bug: es **reescribir una función** —un `create or replace function` que se pega desde un archivo viejo— y borrar un freno en silencio. Ya pasó una vez en este proyecto: `0025` dejó la función del trigger sin su trigger y nadie lo vio por días.

## Cómo funciona

`lib/security-invariants.test.ts`, dentro de `npm test` (y por lo tanto en cada push del CI).

- Lee **todas** las migraciones en orden y se queda con la **última definición** de cada función, que es la que Postgres aplica.
- Comprueba que esa última definición **contenga el freno**: el patrón de la reserva, la guarda de 24 h, el `for update`, el `current_user`, etc.
- Si alguien vuelve a pegar el cuerpo de `0001`, el test falla y dice qué invariante se perdió.

No prueba la base: para eso están los `verificar_*.sql`. Prueba que **el repositorio sigue declarando la protección**.

## Invariantes cubiertas

| # | Invariante | Dónde vive | Hallazgo |
|---|---|---|---|
| 1 | `reserve_numbers` devuelve solo lo reservado ahora (CTE + `returning`) y suelta las reservas propias vencidas | `0069` | #2 doble cobro |
| 2 | `release_expired_reservations` no libera si hay un pago `pending` de menos de 24 h | `0068` | #3 cobrado sin entregar |
| 3 | `sell_numbers` no vende con el sorteo `drawn` y toma el lock del sorteo | `0071` | #6 vender después del sorteo |
| 4 | `organizer_mark_sold` rechaza un sorteo `drawn` | `0071` | #6 |
| 5 | `void_sold_numbers` exige sorteo `active`, mismo usuario y mismo pago; sin `execute` para `authenticated` | `0070` | #8 contracargos |
| 6 | `guard_raffle_result` frena al cliente y deja pasar al motor (`current_user`) | `0067` | #1 resultado falsificable |
| 7 | `force_profile_role_on_insert` usa la sesión (`auth.uid()`), no el rol de conexión | `0067` | #4 rol en el alta |
| 8 | `enforce_draw_date` compara la fecha anterior **y** la nueva | `0071` | #5 adelantar el sorteo |
| 9 | `payments` admite `refunded` y `charged_back` | `0070` | #8 |
| 10 | El webhook compara lo vendido con lo cobrado y procesa reversas | `app/api/webhooks/mercadopago/route.ts` | #3, #8 |
| 11 | El checkout reutiliza el pago del mismo carrito y libera la reserva parcial | `app/api/checkout/route.ts` | #2, #11 |
| 12 | Todo verificador que abre transacción termina en `rollback;` y ninguno confirma | `supabase/tests/verificar_*.sql` | higiene |

Además, `migrations.test.ts` (anterior) sigue cuidando que toda RPC que el código llama exista, que toda función de trigger tenga su trigger y que cada migración desde `0028` esté en el ledger.

## Lo que esto NO cubre

- **La base real.** Que la migración esté aplicada se comprueba con los `verificar_*.sql`, a mano.
- **Integración con Mercado Pago.** Firmas, preferencias y webhooks reales siguen necesitando sandbox.
- **Regresiones de comportamiento en SQL.** El test lee texto: si alguien cambia un `<>` por un `=` manteniendo las palabras clave, pasa. Los `verificar_*.sql` son la red para eso.

## Cómo agregar una invariante

1. Escribir la corrección en su migración.
2. Copiar el patrón de `lib/security-invariants.test.ts`: `lastDefinition("nombre_funcion")` y `expect(cuerpo).toMatch(/el freno/)`.
3. Comprobar que el test **falla** si se quita el freno (probar el test antes de confiar en él).
4. Sumar la fila a la tabla de arriba.

## Reglas para escribir un verificador SQL

Salieron de errores propios, no de la teoría:

1. **Nunca mueras a mitad de camino.** Si falta el objeto que verificás, reportá `FALTA` y seguí. Un script que aborta no devuelve nada y parece que no corrió.
2. **El control antes del ataque.** El caso «esto legítimo tiene que funcionar» va primero, sobre datos limpios. Si el ataque corrió antes, contamina el control.
3. **Acotá lo que contás.** Nunca cuentes todas las filas de una tabla que tu propio script ensució con datos de prueba: contá el rango exacto (`number between 1 and 10`). Un `count(*)` sobre la tabla entera da falsos positivos.
4. **El ataque tiene que ser distinguible.** Valores siempre distintos del actual (`coalesce(x,0)+1`, hash aleatorio): si el valor ya coincidía, el trigger no se dispara y la prueba pasa en falso.
5. **Terminá en `rollback;`.** Está verificado automáticamente por la suite; ningún verificador puede dejar cambios.
6. **Los usuarios de prueba de aislamiento nunca son `superadmin`.** El superadmin ve todo por diseño: usarlo para probar que «un organizador no ve lo ajeno» da un `CRÍTICO` falso. Se usa `role = 'admin'` estricto, y si falta un segundo organizador se fabrica dentro de la transacción.
7. **El helper del reporte va en `public`, no en `pg_temp`.** El esquema temporal no está disponible dentro del manejador de excepciones de un bloque (`3F000: schema "pg_temp" does not exist`), y ahí es justo donde más se necesita. Se crea dentro de la transacción y el `ROLLBACK` lo borra.
8. **Un verificador que dice `CRÍTICO` también se audita.** Antes de correr a arreglar el código, confirmá cuál es el estado real de la base (`pg_policies`, `pg_trigger`, `pg_get_functiondef`). Tres veces el bug estuvo en el test, no en la migración.

---
author: Gadu
branch: main
status: in-progress
---
# Auditoría de seguridad: sorteo, dinero y datos

## Intent

Tres revisiones independientes sobre las tres superficies que pueden costar plata o destruir la
confianza del producto —el cobro, el motor de sorteo y el aislamiento de datos— más verificación
propia de cada hallazgo grave. El objetivo no es una lista de sustos: es saber qué está roto, con
qué evidencia, y en qué orden se arregla.

## Método

1. Tres revisiones separadas, en paralelo, cada una con la consigna de citar `archivo:línea` y no
   especular.
2. **Verificación propia** de los hallazgos críticos y altos: se releyó el código citado y se
   confirmó el fragmento. Un hallazgo delegado que no pude confirmar queda marcado `a verificar`.
3. Lo que se pudo corregir sin riesgo se corrigió en el momento y se verificó con los cuatro gates.

## Lo que ya está bien (y conviene no romper)

- **La firma del webhook está bien resuelta**: validador oficial del SDK, falla cerrado si falta
  `MP_WEBHOOK_SECRET` (`lib/mercadopago.ts:112-116`), y el pago se re-consulta a la API de Mercado
  Pago en vez de confiar en el cuerpo (`route.ts:115`).
- **El monto no se puede imponer desde el cliente**: precio y cantidad salen de `raffles` y se
  recalculan en servidor (`checkout/route.ts:138,169,261`).
- **La criptografía del sorteo es correcta**: fórmula publicada = fórmula verificada, vectores fijos
  fijados en `lib/draw-verify.test.ts`, `BigInt` para no perder precisión, semilla generada en el
  servidor (`0034:103`) y guardada en una tabla sin políticas ni grants.
- **Los RPC sensibles tienen grants correctos**: `sell_numbers` y `release_numbers` solo para
  `service_role` (`0001:393-397`); la service role key nunca llegó al bundle.
- **Ninguna tabla quedó con RLS apagado** (24 tablas) y las vistas de `0062` no exponen PII.

## Estado verificado en la base (2026-11-04)

`supabase/tests/verificar_0067.sql` corrido en el SQL Editor: **12/12 OK**.

| Comprobación | Resultado | Qué significa |
|---|---|---|
| 1-2 | OK | Las dos funciones y los dos triggers de `0067` están cargados. |
| 3 | OK | Las columnas de `0033`/`0034` existen: **esas migraciones sí están aplicadas**. |
| 4 | OK | Ledger con 40 migraciones y `0067` anotada. El «a verificar» sobre qué corrió queda respondido. |
| 5 | OK | Control: RLS deja al organizador editar su sorteo, así que 7 y 8 prueban el trigger, no una política. |
| 6 | OK | Bloqueado por **0047** (fecha programada), no por `0067`: los triggers van en orden alfabético y `enforce_draw_date` gana. |
| 7-8 | OK | **Prueba directa de `0067`**: `winner_number` y `draw_commitment` rechazados con el mensaje del motor. Hallazgo #1 cerrado. |
| 9 | OK | El camino privilegiado (motor / service_role) sigue escribiendo el resultado. |
| 10 | OK | La transición a `drawn` desde el camino privilegiado rebota por 0047 (fecha futura): correcto, y confirma que 0047 está viva. |
| 11-12 | OK | El alta por cliente queda en `role='user'`; el alta del servidor conserva el rol. Hallazgo #4 cerrado. |

Pendiente de prueba directa: la transición `status='drawn'` **por el trigger de 0067** (los dos intentos rebotaron antes en 0047). Se puede forzar creando un sorteo de prueba con `draw_date` en el pasado.

Y `supabase/tests/verificar_0069.sql`, también **7/7 OK** tras aplicar la migración: la línea 4 pasó de `CRÍTICO — sigue devolviendo [1,2]` a `OK — el segundo checkout devuelve VACÍO`. El doble cobro queda cerrado con evidencia, no por lectura de código.

## Hallazgos

### Críticos

| # | Archivo:línea | Problema | Evidencia |
|---|---|---|---|
| 1 | `0065:87` + `0065:127-136` + `0034:286,295` | El organizador puede escribir las columnas del **resultado** de su propio sorteo (`status`, `winner_*`, `result_hash`, `numbers_hash`, `draw_seed`, `draw_commitment`) con un `PATCH` directo por PostgREST, sin pasar por `draw_winner`. El trigger de congelamiento no lo frena porque solo actúa si `old.status = 'drawn'`. Un sorteo "certificado" con ganador elegido a mano pasa el verificador público. | `grant insert, update, delete on public.raffles to authenticated` sin restricción de columnas + política `raffles_update_owner` sin lista de columnas + `if old.status = 'drawn' then` |
| 2 | `0001:233-239` + `checkout/route.ts:156` | `reserve_numbers` devuelve también los números que el usuario **ya tenía** reservados, así que un segundo checkout de los mismos números "pasa" y crea otro pago y otra preferencia: el cliente puede pagar dos veces los mismos números. | El `select` final filtra por `status='reserved' and reserved_by = v_uid`, no por lo que reservó esta llamada |
| 3 | `0001:228` + `0001:307-326` + `webhook:157` | La reserva dura **10 minutos** y el cron libera las vencidas sin mirar si hay un pago en curso. Un cobro tardío (efectivo: Rapipago/PagoFácil liquida en horas o días) llegaba como `approved` **sin números entregados**. | **Corregido en esta sesión** (ver abajo); la causa raíz —el TTL y el cron— sigue abierta |

### Altos

| # | Archivo:línea | Problema |
|---|---|---|
| 4 | `0001:424-426` (+ `0001:103`, guards solo en `0010:26` y `0014:67`) | `profiles_insert_own` permite insertar la propia fila con **`role` libre**. Todos los protectores de rol son `BEFORE UPDATE`. El propio código prevé que falte la fila (`app/layout.tsx:122` la auto-repara): en ese estado, un autenticado puede crearse un perfil `superadmin`. `a verificar`: que `handle_new_user` esté aplicado y no falle. |
| 5 | `0048:79-84` + `0047:17-20` | `enforce_draw_date` evalúa `new.draw_date > now()`: bajando `draw_date` en el mismo UPDATE que pasa a `drawn`, el freno se esquiva y se puede sortear un sorteo anunciado para dentro de un mes. **Refinado tras leer el código**: sortear con el sorteo `active` no deja vender después (al quedar `drawn`, `reserve_numbers` exige `active`), así que el riesgo real es *adelantar* el sorteo, no la venta abierta. |
| 6 | `0001:261-271` | `sell_numbers` no mira el estado del sorteo: un pago aprobado después del sorteo agrega números `sold` y el `numbers_hash` publicado deja de reproducirse (`verificar/page.tsx:57-63` consulta en vivo, no un snapshot). |
| 7 | `app/sorteos/[id]/verificar/page.tsx:63` | La verificación corta en **5000** filas y el plan premium permite **10.000** números (`0024`). En sorteos grandes el verificador recalcula con una lista truncada y acusa un fraude inexistente. |
| 8 | `webhook:147` + `0001:45` | El corte por estado terminal impide procesar `approved → refunded/charged_back`: un contracargo posterior se ignora y los números quedan `sold`. El `CHECK` de `payments.status` ni siquiera admite esos valores. |
| 14 | `0065:89` + `0065:151-153` | **Reclasificado desde MEDIA.** INSERT directo en `raffle_numbers` sin restringir columnas: el organizador podía inventar filas `status='sold'`. `draw_winner_core` sortea sobre `status='sold'`, así que agregar vendidos falsos **cambia el conjunto del sorteo** y el `numbers_hash` publicado: es el hallazgo #1 por otra puerta. |

### Medios

| # | Archivo:línea | Problema |
|---|---|---|
| 9 | `webhook:154` | Nunca compara `transaction_amount`/`currency_id` con `payments.amount`. |
| 10 | `webhook:103` + `lib/mercadopago.ts:107` | El `data.id` del cuerpo tiene prioridad sobre el firmado y no está firmado; sin tolerancia de timestamp la firma es reutilizable. Sin ganancia real para un atacante (Mercado Pago es la fuente de verdad), pero es superficie de más. |
| 11 | `checkout/route.ts:156-166` | Reserva parcial devuelve 409 **sin liberar** los números reservados ni borrar el pago. |
| 12 | `0001:201` vs `0037:97-103` | `reserve_numbers` no valida `is_banned` ni el tope de 20/h que sí tiene `reserve_numbers_prepaid`. |
| 13 | `0063:167` | La devolución se calcula con el precio vigente al cancelar, no con lo cobrado en `payments.amount`. |
| 15 | `0030:183` | El organizador ve la fila **completa** del comprador (email, teléfono, DNI, dirección). |
| 16 | `0065:147-149` | `SELECT` público de `raffle_numbers` expone `reserved_by`/`sold_to` (UUID de usuarios). |
| 17 | `0034:88` | `commit_draw_seed` se puede publicar después del cierre: la promesa "la semilla estaba fijada antes" no es comprobable desde afuera. |
| 18 | `cron/auto-draw:26` + `cron/release-reservations:16` | Secreto comparado con `===` (no tiempo constante) y duplicado en dos rutas. |
| 19 | `vercel.json:2` | El único cron declarado corre una vez al día; `auto-draw` no está programado en el repo. `a verificar` en el despliegue. |

### Bajos

| # | Archivo:línea | Problema |
|---|---|---|
| 20 | `0066:8` | `is_featured` escribible por el organizador (migración de otra sesión; revisar al integrarla). |
| 21 | `lib/auto-draw.ts:41` | `logRun` no desestructura `{ error }` de supabase-js: un fallo al registrar el intento se pierde. |

## Corregido en esta sesión

| Archivo | Cambio |
|---|---|
| `app/api/webhooks/mercadopago/route.ts:157-209` | Se lee el conteo de `sell_numbers`; si no coincide con los números comprados, **no** se marca `approved`, se guarda `mp_payment_id` para poder reembolsar y se registra el incidente en Sentry. Responde 200 para no dejar el endpoint «enfermo» para Mercado Pago. |
| `app/api/checkout/route.ts:196-224` | El modo mock aplica el mismo control de conteo antes de aprobar. |
| `lib/supabase/admin.ts:1` | `import "server-only"`: importar la service role desde un componente de cliente ahora rompe el build. |
| `middleware.ts:151` | Redirects dependientes de sesión con `Cache-Control: no-store`. |
| `supabase/migrations/0067_harden_raffle_result_and_profile_insert.sql` | **Escrita, sin aplicar.** Dos triggers: `guard_raffle_result` (solo el motor escribe `winner_*`, `*_hash`, `draw_*` y la transición a `drawn`) y `force_profile_role_on_insert` (un cliente autenticado solo puede crearse `role='user'`). Usa `current_user` como firma del motor: no toca `draw_winner_core` ni el pipeline criptográfico. |
| `lib/raffle-numbers.ts` + `lib/raffle-numbers.test.ts` | Paginado del listado vendido (1000 por pedido, tope 10.000) con 6 tests: una página, varias, 4200 números, tope, corte por error y listado vacío. |
| `app/sorteos/[id]/verificar/page.tsx` y `app/sorteos/[id]/page.tsx` | Dejan de truncar el listado: la página pública no paginaba en absoluto (tope real 1000) y `/verificar` cortaba en 5000. El verificador ya recalcula el hash con los números completos. |
| `supabase/migrations/0068_keep_pending_payment_reservations.sql` | **Aplicada y verificada** (`verificar_0068.sql`: 7/7 OK). `release_expired_reservations` deja de liberar una reserva vencida si hay un pago `pending` de menos de 24 h: es la causa raíz de «cobré y no entregué». No toca estados de pago (marcarlos `expired` reintroduciría el silencio que el webhook ya no tiene). |
| `supabase/migrations/0069_reserve_numbers_returns_only_new.sql` | **Aplicada y verificada** (`verificar_0069.sql`: 7/7 OK). `reserve_numbers` suelta las reservas propias vencidas y devuelve solo lo reservado en la llamada (patrón de `0029:107-132`). El segundo checkout del mismo carrito devuelve vacío: el doble cobro quedó cerrado. |
| `app/api/checkout/route.ts` + `lib/payments.ts` | El checkout reconoce un carrito repetido (`sameNumberSet`) y **reutiliza** el pago pendiente idéntico en vez de crear otro; si no hay pago que lo respalde, libera la reserva parcial antes del 409 (hallazgo #11). 5 tests nuevos para `sameNumberSet`. |
| `supabase/migrations/0070_refunds_and_chargebacks.sql` + `app/api/webhooks/mercadopago/route.ts` | **Aplicada y verificada** (`verificar_0070.sql`: 7/7 OK). `payments.status` acepta `refunded` y `charged_back`; el webhook deja de cortar en el guard de estado terminal cuando un pago aprobado se devuelve o se desconoce; `void_sold_numbers` da de baja los números solo del pago revertido y solo con el sorteo `active`. |
| `supabase/migrations/0071_no_early_draw_no_late_sales.sql` | **Escrita, sin aplicar.** `enforce_draw_date` compara también la fecha ANTERIOR (mata la evasión de bajar `draw_date` en el mismo UPDATE); `sell_numbers` no vende si el sorteo está `drawn` (protege el `numbers_hash`); `organizer_mark_sold` rechaza lo mismo con un error visible. No toca el motor del sorteo. |
| `app/api/webhooks/mercadopago/route.ts` + `lib/payments.ts` | **Conciliación de importe y moneda (hallazgo #9).** Antes de entregar números, el webhook compara `transaction_amount` y `currency_id` contra `payments.amount` (ARS). Si no coinciden, no entrega: registra el incidente y deja el pago para revisión. Si Mercado Pago no informa el importe, se sigue: bloquear todo aprobado por un campo faltante sería peor. 6 tests nuevos para `amountMatches`. |
| `lib/security-invariants.test.ts` + `02-DOCS/wiki/ftd/blindaje-invariantes.md` | **Blindaje.** 15 contratos en `npm test` que leen la ÚLTIMA definición de cada función en las migraciones y fallan si alguien reescribe una y borra el freno. Cubre las 13 invariantes y verifica que ningún verificador SQL confirme cambios. |
| `supabase/migrations/0072_no_direct_number_inserts.sql` | **Escrita, sin aplicar.** Revoca `insert on raffle_numbers` a `authenticated` y borra la política `raffle_numbers_insert_owner`: el grid lo crea `create_raffle_numbers`, que es `security definer` y no necesita ese permiso. Cierra el #14 (inventar números vendidos). |

Verificado con `typecheck`, `lint`, `test` (158) y `build`.

## Plan, en orden

**P0 — antes de la próxima venta**

1. **Columnas del resultado (#1).** Quitar el `UPDATE` de tabla a `authenticated` y conceder solo
   las columnas editables; la transición a `drawn` y las columnas `winner_*`/`*_hash`/`draw_*` pasan
   a escribirse únicamente desde las funciones `SECURITY DEFINER`, con una bandera de sesión
   (`set_config('app.draw_engine','on',true)`) que el trigger exige.
2. **Insert de perfil (#4).** Trigger `BEFORE INSERT` que fuerza `role='user'` cuando
   `auth.role() <> 'service_role'`.
3. **Doble pago (#2).** Reescribir `reserve_numbers` con CTE + `returning number` (el patrón de
   `0029:118-130`) y liberar antes las reservas vencidas del propio usuario.
4. **Causa raíz de #3.** Subir el TTL a 30-60 min o, mejor, que `release_expired_reservations` no
   libere números con un `payments` en `pending`/`in_process` asociado.

**P1 — confianza del producto**

5. Contracargos y devoluciones (#8): ampliar el `CHECK` de `payments.status` y permitir el descenso
   desde `approved`.
6. Sorteo con ventas abiertas y fecha manipulable (#5): exigir `closed and draw_date <= now()` en
   `draw_winner_core` y proteger `draw_date`.
7. Snapshot de participantes al sortear (#6).
8. Verificador sin tope (#7): paginar el listado por rangos de 1000.

**P2 — endurecimiento**

9. Monto y moneda (#9), `data.id` firmado y tolerancia (#10), liberar en el 409 (#11), alinear
   `reserve_numbers` con el prepago (#12), devoluciones por lo cobrado (#13), columnas de
   `raffle_numbers` (#14), PII del comprador (#15), `reserved_by`/`sold_to` públicos (#16),
   compromiso temprano (#17), comparación en tiempo constante del cron (#18), crons declarados (#19).

## Lo que no hice y por qué

- **No apliqué la migración 0067.** No hay base sobre la que probarla: las migraciones de este
  proyecto se corren a mano en el SQL Editor (lo dice `0065:9-16`). El archivo está escrito,
  es idempotente y trae al final las consultas de verificación y el rollback. Aplicala, corré las
  tres comprobaciones del pie del archivo y recién entonces considerá cerrado el hallazgo #1.
- **No migré a Next 16.** Cierra tres avisos críticos, pero es un diff de miles de líneas (React 19,
  `cookies()` asíncrono en toda la app) y hay otra sesión commiteando en este mismo árbol.

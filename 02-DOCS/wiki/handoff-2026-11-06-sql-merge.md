---
author: Gadu
date: 2026-11-06
---

# Handoff — fin del día 2026-11-06

## Dónde quedamos

Día de mucho movimiento y de **dos sesiones en paralelo** escribiendo SQL. La base quedó verificada y
el ledger normalizado; las features de ventas y devoluciones están cerradas con verificadores.

## Estado verificado contra la base (no contra el repo)

| Comprobación | Resultado |
|---|---|
| Columnas `refunds.buyer_confirmed_at`, `numbers`, `confirmation_token` | existen |
| Trigger `liberar_numeros_al_pagar_devolucion` | existe |
| `refund_and_release_numbers` libera al registrar | **no** (versión correcta: libera al pagar) |
| `notifications` acepta `refund_confirmed` | sí |
| Tablas `notifications`, `raffle_audit`, `raffle_delivery_photos` | existen |
| Funciones de notificaciones y ventas | todas presentes |
| Ledger 0079–0098 | normalizado (0097 huérfana anotada, 0086/0087 registradas) |

## Verificadores que dieron verde

- Ciclo de vida (0088): 5/5.
- Notificaciones (0089, 0090): 7/7 y 2/2.
- Baja de cuenta (0086): 6/6.
- Ventas (0091, 0092): 6/6 y 5/5.
- **Devoluciones vigente (0096): `verificar_0094_liberar_al_pagar.sql` 5/5.**

Superseded (no correr como prueba actual): `verificar_0091.sql`, `verificar_0092.sql`,
`verificar_fix_devolucion.sql`.

## Pendiente para mañana

1. **Cerrar el aviso público de la devolución del dueño.** Verificar `status`; si ya se pagó, marcarla
   `paid`. Tiene `numbers` en null (se creó antes de 0096), así que el trigger no libera nada.
2. **Decidir devoluciones post-sorteo.** Hoy la función rechaza registrar con el sorteo `drawn`.
   Recomendado: permitir solo-plata (registrar y pagar, nunca liberar números).
3. **Prueba en navegador** con dos cuentas: campana de reservas, aprobar, registrar pago, devolver
   parcial, enlace de devolución en incógnito y marcar pagada.

## Regla aprendida hoy

**Las migraciones de una línea salen de una sola sesión.** Dos chats escribiendo `create or replace`
sobre la misma función hicieron imposible saber qué versión estaba activa sin consultar `pg_proc`.
Además, una migración puede estar **aplicada en la base y ausente del repo** (caso 0097): el repo por
sí solo no reconstruye el entorno.

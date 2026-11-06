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

## Cerrado después de este handoff (mismo día)

1. **Aviso público de devolución apagado.** Verificado en producción: la página del sorteo ya no
   muestra "devoluciones sin pagar".
2. **Devoluciones post-sorteo:** `0099` permite registrar pagos con el sorteo `drawn`, solo
   enlazando `payment_id` (no cambia estado ni dueño, el resultado queda intacto) y auditado.
3. **Prueba en navegador completada por el dueño (flujo de prepago manual).**

## Probado de punta a punta

Reserva → aviso legal → notificación al organizador → aprobar → registrar pago → sortear →
aviso al ganador. Incluye:

- Aviso legal del 100% arriba de la grilla y debajo del botón de reservar.
- Panel en dos bloques (Decisiones / Avisos), agrupado por sorteo, con auto-avance.
- Contador de reserva en días: "vence en 2 días" (hold fijo de 48 h en prepago).
- Teléfono normalizado para WhatsApp (`0`, `15`, `549`) con el destino a la vista.
- Ganador ve "🏆 ¡Saliste ganador!" en Mis números, sin depender del email.
- Si el ganador no tiene email, al organizador le llega `winner_unreachable` con su teléfono.

## Crons puntuales

Los dos jobs corren **cada minuto** en cron-job.org (200 OK en la prueba): `auto-draw` y
`release-reservations`, con `Authorization: Bearer <CRON_SECRET>`. Esto reemplaza la cadencia
real de GitHub Actions, que corría aproximadamente una vez por hora.

## Backlog

| Prioridad | Tema |
|---|---|
| Media | **Próxima tarea:** centro de notificaciones del comprador (campana + toasts + realtime) |
| Media | RPC para que `authenticated` no vea UUID ajenos (deuda del #16) |
| Baja | Panel de ventas fases 2–3 (plantillas de mensaje, KPIs) |
| Proyecto aparte | Upgrade de `next` |

### Notas para la próxima tarea (leídas del código antes de empezar)

- La tabla `notifications` **no tiene** `title` ni `message`: tiene `type`, `payload`, `status`,
  `read_at`. Hay que agregarlas o derivar el texto.
- Esa tabla hoy es **del organizador** (`user_id` = dueño del sorteo). Para el comprador se usa la
  misma tabla con `user_id` = comprador; las políticas ya limitan a leer lo propio.
- **No hay librería de toasts instalada** (no está `sonner` ni equivalente).
- `components/Navbar.tsx` existe y es el lugar para la campana.
- El email de "pago aprobado" del comprador ya existe (`sendPaymentApprovedEmail`), pero la
  aprobación **manual** de una reserva (`organizer_mark_sold`) no lo dispara.

## Superadmin (mismo día, tarde)

- **Dashboard:** se agregó la tarjeta **Referidos exitosos** (`referrals.rewarded`). Las tarjetas de
  usuarios, sorteos activos e ingresos, más el gráfico de ingresos por día, ya existían (0064).
- **Pestaña Referidos:** Top 10 de referentes con invitados, cuántos compraron (números `sold`) y
  cuántos premios se otorgaron. Solo lectura.
- **Pestaña Notificaciones:** bandeja de `super_report` y `super_kyc` del superadmin (últimas 50).
- **Pestaña Sorteos:** columna **Bonus por referidos** con la relación `bonus_raffle_id` (entrega en /
  recibe de) y la cantidad de números 🎁 regalados.
- **Impersonación:** ya existía completa (modo editor, cookie httpOnly, auditoría
  `IMPERSONATE_USER`/`IMPERSONATE_END`). Se agregó **motivo opcional**, que queda en `details` del
  audit. Sigue sin exponer tokens en la URL.
- **Sin migración nueva:** son consultas y UI.

### Pendiente manual de referidos

La implementación y la base están verificadas (7/7, 7/7, 6/6, 8/8). Falta el recorrido en la app
(reserva del invitado → aprobación → bono en el sorteo exclusivo), que requiere clics reales.

### Prueba E2E automatizada: bloqueada

No se agregó Playwright porque hoy no es ejecutable con seguridad:

1. La `SUPABASE_SERVICE_ROLE_KEY` local está revocada (401), así que no se pueden crear usuarios de
   prueba.
2. El alta/login es **Google OAuth**: un navegador automatizado no puede completar el registro sin
   un proveedor de email/contraseña o un bypass de sesión.
3. No hay un proyecto de staging: correrlo contra producción crearía y borraría cuentas reales.

Ruta sugerida: proyecto Supabase de staging + auth email/password + service role de staging, y recién
ahí `tests/e2e/referral-flow.spec.ts` con Playwright.

## Backup

Hecho el 2026-11-06 14:27 y repetido a las 14:46 con `01-TOOLS/backup/backup-db.ps1` (pg_dump 17.6
portátil + Session pooler). Archivo vigente: `C:\Users\Usuario\Desktop\backups\gadu-2026-11-06-1446.dump`
(965.659 bytes, formato custom). Validado con `pg_restore --list`: 903 entradas, 76 bloques de datos,
77 funciones, 52 políticas y 31 triggers del esquema `public`; todas las tablas críticas tienen datos.
Incluye los esquemas `auth`/`storage`; **no** incluye los archivos de los buckets.

## Regla aprendida hoy

**Las migraciones de una línea salen de una sola sesión.** Dos chats escribiendo `create or replace`
sobre la misma función hicieron imposible saber qué versión estaba activa sin consultar `pg_proc`.
Además, una migración puede estar **aplicada en la base y ausente del repo** (caso 0097): el repo por
sí solo no reconstruye el entorno.

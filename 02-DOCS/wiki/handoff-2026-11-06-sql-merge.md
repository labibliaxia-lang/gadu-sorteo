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

### Prueba E2E automatizada: **descartada por ahora**

Decisión del 2026-11-06: no se implementa Playwright hasta tener un entorno de staging.
La prueba **manual del flujo de referidos sigue pendiente y es del dueño del proyecto**.

1. La `SUPABASE_SERVICE_ROLE_KEY` local está revocada (401), así que no se pueden crear usuarios de
   prueba.
2. El alta/login es **Google OAuth**: un navegador automatizado no puede completar el registro sin
   un proveedor de email/contraseña o un bypass de sesión.
3. No hay un proyecto de staging: correrlo contra producción crearía y borraría cuentas reales.

Ruta futura: proyecto Supabase de staging + auth email/password + service role de staging, y recién
ahí `tests/e2e/referral-flow.spec.ts` con Playwright.

### Compra en el propio sorteo (0106)

Los organizadores ya no pueden reservar números en un sorteo que crearon: la RPC lanza
*"No podés comprar números en tu propio sorteo"* (idéntico para admin, superadmin y user). Comprar
en sorteos ajenos sigue permitido. El grid muestra un aviso y deshabilita los botones. Verificador
`verificar_0106.sql`: 5/5.

## Planes dinámicos y Fase 2 de UI (cierre de sesión)

### Base de datos

- **0107 — planes dinámicos:** tabla `plan_configs` (organizador/pro/premium/social) con límites,
  precio y toggles; `enforce_plan_raffle_limit`, `create_raffle_numbers` y `enforce_raffle_rules`
  leen de la tabla. Se cerraron los bypasses premium en la base (MP, auto-draw, referidos y landing;
  en UPDATE solo si la columna cambia). Se agregó `raffles.currency` y el estado `paused`;
  `expire_plans` degrada a Starter y pausa los sorteos excedidos.
  Verificador `verificar_0107.sql`: **9/9**.
- **0108 — estructura final:** Starter 2 sorteos/300 números sin landing ni referidos; Pro 6/1.000 con
  landing y 10 referidos por sorteo; Premium 20/10.000 con referidos ilimitados y auto-sorteo;
  Social igual a Premium **sin Mercado Pago**. Nuevo tope `max_referrals_per_raffle` aplicado por
  trigger en `referrals`; USD admitido; trigger que impide autoasignarse el Plan Social.
  Verificador `verificar_0108.sql`: **6/6**.

### UI

- **Pausado:** `"paused"` en `RaffleStatus` y en los 6 mapas de estado; carteles en el panel del
  organizador y en la vista pública. El grid bloquea la compra porque solo `active` permite reservar.
- **Moneda:** `formatPriceIn(value, currency)` en `lib/utils.ts`; `Raffle.currency`; selector
  ARS/MXN/COP/CLP/USD en el wizard (se envía en el insert y la vista previa lo respeta); la página
  pública y el grid muestran precios y totales en la moneda del sorteo.
- **Configurar Planes:** `/admin/super/planes` con editor de los 4 planes y Server Action que valida
  superadmin; enlace desde el header del panel. La tabla ya no se edita por SQL.
- **Página `/planes`:** lista los 4 niveles; el CTA de Social dice "Solo por contacto" y aclara que no
  hay autoservicio.

### Estado de pruebas

- **15/15**: 9/9 de 0107 + 6/6 de 0108.
- Gates: typecheck limpio, lint 0, tests y build OK.
- **0109 — Plan Free y precios duales:** `plan_configs.price_usd` (nunca null), plan Free
  (1 sorteo/100 números), precios 0/0, 3/3000, 10/10000, 25/25000, 0/0, editor con USD y ARS,
  orden Free→Starter→Pro→Premium→Social y bloqueo del Free en el wizard. Verificador
  `verificar_0109.sql`: **7/7**.
- **0110 — Free por defecto:** `profiles.plan` default `'free'` y `handle_new_user` asigna Free a
  toda cuenta nueva. Los usuarios existentes **no** cambian de plan (el ON CONFLICT no toca `plan`).
  `/planes` muestra "Gratis" en el plan Free.
- **0111 — Solicitud de organizador:** formulario "Quiero ser Organizador" con nombre real,
  teléfono, qué sortearía y redes; se guardan en `profiles.request_tools` / `request_social` y el
  Superadmin los ve en la tarjeta. Verificador `verificar_0111.sql`: **5/5**.
- **0112 — Nadie es admin automáticamente:** `handle_new_user` asigna siempre `role = 'user'` y
  `plan = 'free'`. Las invitaciones del Superadmin ya **no otorgan rol**: quedan como registro
  histórico. El único camino a organizador es solicitud → aprobación manual → KYC.
  El trigger `enforce_organizer_kyc` sigue bloqueando el alta de sorteos en la base.
  **El circuito de organizadores queda 100 % cerrado: no existe ninguna vía a `admin` sin
  aprobación manual y KYC.**
- **Verificado en producción:** la cuenta nueva `hackedigma@gmail.com` entró con `role = user` y
  `plan = free`. El `prosrc` de `handle_new_user` no contiene la palabra `admin`.
- **Normalización aplicada (2026-11-06):** `jacintocards@gmail.com` y
  `auja.costura@gmail.com` quedaron con `role = 'user'`, `plan = 'free'` y `plan_expires_at = NULL`.
  Ficha coherente y sin métricas de facturación falsas.
- **Invitaciones:** eliminado el flujo de invitación del panel. «Crear organizador» ahora solo
  promueve a usuarios **ya registrados**; si el email no existe, responde que la persona debe
  registrarse y solicitar ser organizador. No se insertan más filas en `organizer_invitations`.
- **Pendiente manual:** flujo completo de referidos en la web (reserva del invitado → aprobación →
  bono en el sorteo exclusivo).
- **Postergado:** integración de Mercado Pago vía OAuth (Marketplace).

## Cierre del día: PWA, SEO y bases legales

- **PWA (instalable):** `app/manifest.ts` (standalone, colores, íconos 192/512 generados desde el
  logo), `public/sw.js` (navegación red-primero, estáticos cache-primero; nunca `/api` ni `/auth`),
  `components/PwaRegister.tsx` (registra solo en producción) y metadatos `apple-*` + `theme-color`.
  Verificado con `next start`: manifest, sw e íconos responden 200 y el head incluye manifest,
  theme-color y apple-touch.
- **SEO de ganadores:** `generateMetadata` del sorteo ahora, si está `drawn`, titula
  «¡Nombre A. ganó [Título] en Gadu Sorteos!» y describe el número ganador; también en OpenGraph y
  Twitter. El nombre se recorta (sin apellido completo) y no se exponen email ni teléfono. El Muro
  `/ganadores` ya existía: solo `drawn`, campos limitados y hash público.
- **0113 — Bases legales por sorteo:** `raffles.terms_accepted_by_organizer` y
  `raffles.player_terms_text`. `lib/raffle-terms.ts` genera el texto con nombre y DNI/CUIT del KYC,
  premio, fecha, precio y datos de pago; se sanea y se renderiza como texto (sin HTML).
  - **Alta:** sección con vista previa + checkbox obligatorio; sin tildar no se crea.
  - **Edición:** misma sección con las bases sugeridas; sin tildar no guarda.
  - **Jugador:** al reservar (prepago o MP) se abre el modal con las bases y el botón de aceptar
    está deshabilitado hasta tildar. Se exige también en sorteos viejos sin texto (fallback).
- **Bypass cerrado:** los usuarios ya no pueden autoasignarse planes ni el plan Social; el plan
  Free es el default de cuentas nuevas (0110) y el alta de organizadores ahora pasa siempre por
  solicitud + aprobación + KYC (0112).

- **0114 — Candado de bases legales:** trigger `enforce_terms_on_publish` impide que un sorteo quede
  `active` sin `terms_accepted_by_organizer = true`. Un usuario autenticado no puede publicarlo ni
  por API; las sesiones de servicio (SQL Editor/cron) quedan exentas para poder preparar datos, igual
  que el candado de KYC. Los sorteos ya activos se editan sin problema mientras no cambien de estado.
  Verificador `verificar_0114.sql`: 7/7.

## Cierre: slugs, precios públicos y multimoneda

- **0115 — Slugs de sorteo:** `raffles.slug` único, backfill desde el título y generación automática
  en altas (trigger `asignar_slug_sorteo`). La ruta pública pasó a `app/sorteos/[slug]` y resuelve
  **por slug o por UUID viejo**; los enlaces ya compartidos siguen funcionando. El slug no cambia al
  editar el título. Compartir y copiar enlace usan el slug.
  - Panel: banner pulsante de **acción obligatoria** cuando falta el compromiso, botón de publicar
    compromiso animado y tarjeta **"Tu enlace de referidos"** (`?ref=<id>`) con copiar o acceso a
    activar *Invitá y Ganá*.
- **/planes sincronizado:** la página pública lee **`plan_configs`** (con cliente admin en servidor,
  solo precios y límites públicos) en lugar de `plan_prices`. Free muestra **Gratis** y botón
  **Empezar gratis**; los planes pagos muestran USD + equivalencia ARS con `formatPriceIn`.
- **0116 — Multimoneda LATAM:** tabla `exchange_rates` (ARS/MXN/COP/CLP, con respaldo y lectura
  pública), columnas `plan_configs.price_mxn/price_cop/price_clp`. Cron
  `GET/POST /api/cron/update-rates` protegido con `CRON_SECRET`: consulta
  `open.er-api.com/v6/latest/USD`, actualiza cotizaciones y recalcula los precios locales desde
  `price_usd`. Si la API externa falla responde 200 con `stale: true`.
  - **GitHub Actions**: el workflow `crons.yml` suma el disparo diario `0 6 * * *` y un job `rates`
    que llama al endpoint solo en ese horario (o manual).
  - **Superadmin**: banner con cotización actual y última corrida; precios locales de solo lectura.
  - **Pública**: selector USD/ARS/MXN/COP/CLP; precios desde `plan_configs`.
  - Verificador `verificar_0116.sql`: **9/9** (tabla, monedas, RLS, grants de tabla, columnas, checks,
    planes pagos, coherencia con la cotización y ledger). Se detectó y corrigió que RLS sin grants no deja
    escribir al service_role: el cron respondía ok y no guardaba cotizaciones (`199fa32`).
- **Cotizaciones reales verificadas:** ARS 1545 · MXN 18,65 · COP 3240 · CLP 974; el cron actualizó
  los 3 planes pagos con `ok: true`.
- **0117 — Recálculo automático de precios locales:** trigger `recalcular_precios_plan`
  (`BEFORE UPDATE OF price_usd` en `plan_configs`) lee `exchange_rates` y recalcula
  `price_ars/mxn/cop/clp` con `ROUND(...,2)`. Si `price_usd = 0` (Free/Social) deja los cuatro
  en 0. Funciona también cuando se reenvía el mismo USD, para resincronizar con la cotización del día.
  Verificador `verificar_0117.sql`: 6/6 (trigger, función, cambio de USD, caso cero, mismo USD y ledger).
- **Pendiente manual:** backup de la base (hecho el 2026-11-07, archivo `gadu-2026-11-07-0206.dump`);
  prueba completa de referidos en la web (guía paso a paso: `02-DOCS/wiki/guia-e2e-referidos.md`). No hay verificador escrito para 0115.

## Roadmap Live TV / Resultados — estado

- **Fase 1 (Live TV multipremio): HECHA.** `LiveDrawAnimation` recibe `initialWinners` desde
  `raffle_winners` (posición, número, nombre, premio), anima en secuencia (ruleta ~2 s, revela,
  pausa 2 s, siguiente) y llena un **podio en vivo** que pasa a «Podio final». Nombres recortados
  (nombre + inicial). Los espectadores siguen recibiendo el UPDATE de `raffles` por Realtime y el
  componente busca `raffle_winners` al detectar `drawn`; el botón de sortear sigue siendo solo del
  dueño. Probado en navegador con el modo **solo desarrollo** `?demo=1` (3 premios ficticios):
  secuencia y podio correctos, sin tocar datos.
- **Fase 2 (Simulador unificado): PENDIENTE.** `/como-funciona` sigue usando `SandboxDraw`; falta
  extraer una animación reutilizable con 3 premios falsos sin tocar el sandbox real.
- **Fase 3 (Página de Resultados): HECHA.** `/sorteos/[slug]/resultados` pública con podio (foto
  del premio, nombre recortado, número), compatible con sorteos de un ganador; botón
  **Compartir Resultados** (Web Share API con fallback a copiar enlace) y `opengraph-image.tsx`
  propio con «¡Nombre ganó Premio en Gadu Sorteos!». `LiveDrawAnimation` agrega el botón
  **Ver Resultados Oficiales** al terminar. Notas técnicas: `next/og` debe usar `runtime = "edge"`
  y Satori exige `display: flex` en divs con más de un hijo (los textos interpolados deben ir como
  un único string). Verificado en local: ambos endpoints OG devuelven `image/png` 1200×630.
- **Deuda menor:** `/en-vivo` toma el título del sorteo desde `raffles.status`; un sorteo
  multipremio ya sorteado muestra «Sorteo finalizado» correctamente, pero el subtítulo podría
  detallar «3 premios».

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

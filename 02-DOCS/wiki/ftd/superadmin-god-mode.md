---
author: Gadu
branch: main
status: done
---
# Superadmin God Mode — centro de control, analíticas, Modo Editor y denuncias

## Intent

Convertir `/admin/super` en el centro de control del producto: analíticas históricas de tráfico,
métricas financieras estimadas, gráficos, un «Modo Editor» (impersonación) auditado solo para
superadmin y un circuito de denuncias de sorteos con moderación y auditoría. Todo sin tocar la lógica
de compras ni el camino del dinero.

## Scope

**In:**

- `supabase/migrations/0064_page_views_and_audit.sql` (nueva): `page_views`, RPC
  `superadmin_daily_metrics`, tabla `raffle_reports` con RLS, refuerzo de `admin_audit_logs` y vista
  de lectura `audit_logs`.
- `app/api/track-visit/route.ts` + `components/PageViewTracker.tsx` + `lib/page-views.ts(+test)`:
  registro de visitas a la home y a la página de sorteo.
- `app/admin/super/page.tsx` (reescrito) + `components/SuperAdminDashboard.tsx` +
  `components/admin/{TrafficChart,MetricBarChart,ImpersonateButton,EditProfileButton,ImpersonationBanner,ReportActions}.tsx`:
  pestañas Dashboard / Usuarios / Sorteos / Denuncias / Auditoría, KPIs, MRR, gráficos recharts y
  botones de impersonar/editar en la tabla y en las cards móviles.
- `app/admin/super/actions.ts` (append): `startImpersonation`, `stopImpersonation`,
  `updateUserProfile`, `resolveReport`, `pauseReportedRaffle`, `deleteReport`.
- `lib/impersonation.ts(+test)` + `lib/impersonation-server.ts` + `app/layout.tsx`: cookie httpOnly de
  restauración y banner global del Modo Editor.
- `lib/reports.ts(+test)` + `app/sorteos/report-actions.ts` + `components/ReportRaffleButton.tsx` +
  2 líneas en `app/sorteos/[id]/page.tsx` y `app/page.tsx`: denuncia pública.
- `supabase/tests/verificar_esquema.sql`: checks 18-20 (RLS de `page_views` sin INSERT público, RPC y
  tabla de denuncias con UNIQUE, vista `audit_logs`).

**Out:** toda la lógica de compras (`app/api/checkout/**`, `app/api/webhooks/**`, `app/api/cron/**`,
`lib/payments.ts`, `lib/mercadopago.ts`, `supabase/migrations/0063_*`), devoluciones automáticas,
emails de denuncias, tests E2E de navegador y cualquier acción de moderación sobre pagos, reservas o
números vendidos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Visitas registradas de punta a punta | `page_views` en 0064 + API 204 + tracker montado en home y sorteo |
| 2 | El navegador no puede escribir `page_views` | Sin policy de INSERT; API con ruta validada, rate limit y `user_id` de sesión |
| 3 | Serie diaria solo para superadmin | RPC con guarda `is_superadmin()` y ventana 1–365 días |
| 4 | Dashboard con KPIs, MRR y 3 gráficos | `TrafficChart` + `MetricBarChart` + tarjeta MRR |
| 5 | Pestañas por `searchParams` con guard | `force-dynamic`, `pickAllowed`, redirect si no es superadmin |
| 6 | Se conservan TODAS las funciones previas | Solicitudes, KYC, precios, licencias, usuarios, sorteos, auditoría, simulador |
| 7 | Modo Editor solo superadmin y con reglas | `requireSuperadminSession` + `canImpersonateTarget` (self, superadmin, baneado, sin email) |
| 8 | Restaurar la sesión del admin y fail-closed | Refresh token en cookie httpOnly; si falla, signOut + clear |
| 9 | Auditoría de impersonación y edición de perfil | `IMPERSONATE_USER`, `IMPERSONATE_END`, `EDIT_PROFILE`; entrar/salir fallan cerrado si no se puede auditar |
| 10 | Una denuncia por usuario/sorteo, alta con el cliente del usuario | `UNIQUE (raffle_id, reporter_id)` + RLS de INSERT que fija `status`/fechas |
| 11 | Moderación auditada sin tocar compras | `REPORT_RESOLVE`, `REPORT_RAFFLE_PAUSE`, `REPORT_DELETE`; pausar solo `raffles.status` |
| 12 | 0064 idempotente, con ledger y vista de auditoría | `if not exists` / `drop policy` / `create or replace` + `insert into _applied_migrations` |
| 13 | Gráficos sin `window` en render | Componentes `"use client"` con `ResponsiveContainer` y altura fija |
| 14 | Compras intactas | `git status`/`git diff` sin archivos de pago |
| 15 | Gates verdes | typecheck / lint / test / build |
| 16 | Documento FTD | Este archivo |

## Evidence

**1 — observado.** `0064:29-57` crea `public.page_views` (defaults de `date` en hora de Argentina,
`path`, `user_id` nullable y `created_at`) con CHECK de rutas y dos índices. `app/api/track-visit/route.ts:46-101`
valida, resuelve sesión, inserta con service role y responde 204. El tracker se monta en
`app/page.tsx:214` (`path="/"`) y en `app/sorteos/[id]/page.tsx:298` (`path="/sorteos/<id>"`).

**2 — observado.** `0064:61-71`: RLS activo, sin policy de INSERT (solo select de superadmin), `revoke
all` y `grant select` a authenticated. El insert usa `createAdminClient()` (`route.ts:88-96`); la
identidad sale de `auth.getUser()` (`route.ts:76-86`), nunca del body. La ruta se normaliza en
`lib/page-views.ts:35-59` (solo `/` y `/sorteos/<uuid>`; rechaza traversal y URLs) y el rate limit es
`track-visit:<ip>` 60/60 s (`route.ts:57-74`).

**3 — observado.** `superadmin_daily_metrics` (`security definer`, `set search_path = public`, guarda
`is_superadmin()`, ventana `greatest(1, least(...,365))`) es la que consume el panel
(`app/admin/super/page.tsx:560-582`) y tolera que la migración no esté aplicada. Entrega
`day/views/visitors/new_users/revenue` con los días sin datos ya en 0.

**4 — observado.** Dashboard en `app/admin/super/page.tsx:1303-1483`: KPIs (`1119-1161`), tráfico
(`1346`), usuarios nuevos (`1358`), ingresos (`1382`), métricas del período (`1399-1453`), precios
(`1456-1466`) y licencias (`1469-1481`). MRR estimado en `794-838` (precio de `plan_prices` ×
suscripciones vigentes por plan). Los gráficos usan recharts dentro de contenedores `h-[260px]` y
`isAnimationActive={false}` (`components/admin/TrafficChart.tsx:98-169`).

**5 — observado.** `export const dynamic = "force-dynamic"` (`page.tsx:58`), guard por sesión de
Supabase + rol leído de `profiles` (`649-662`), y cada query param pasa por `normalizeParam` /
`pickAllowed` (`664-698`). Las pestañas son links que preservan filtros (`qs`, `1077-1105`); las
secciones se renderizan por separado (`1303`, `1487`, `1783`, `1904`, `2022`).

**6 — observado.** Se conservan: solicitudes de rol con pestañas y acciones (`862-881`, `1487-1601`),
KYC con URLs firmadas (`883-923`, `1706`), precios de planes, códigos de licencia, usuarios
(`SuperAdminDashboard` en `1763`, con impersonar/editar en tabla `components/SuperAdminDashboard.tsx:465-477`
y cards móviles `597-609`), sorteos (`936-974`, `1783`) y auditoría con filtro (`1063-1074`, `2022-2146`).
El header mantiene el link «Simulador de sorteo» (`1232-1238`) y el bloque de avisos `issues` (`1242-1260`).

**7 — observado.** `startImpersonation` (`app/admin/super/actions.ts:1544-1672`) exige
`requireSuperadminSession()` (`1547`), que lee el rol de `profiles` y rechaza suspendidos
(`lib/auth.ts:30-55,69-72`). Valida UUID (`1549`), carga el target con service role (`1552-1565`) y
aplica `canImpersonateTarget` (`lib/impersonation.ts:115-151`): no a sí mismo, no a otro superadmin,
no a suspendidos, email obligatorio. La UI ni siquiera muestra el botón para un superadmin
(`components/admin/ImpersonateButton.tsx:36`).

**8 — observado.** Antes de cambiar la sesión guarda `adminRefreshToken` en la cookie httpOnly
`gadu_impersonation` (`actions.ts:1601-1609`; flags en `lib/impersonation-server.ts:32-44`: httpOnly,
sameSite lax, `secure` en producción, maxAge 2 h). Restaura con `refreshSession` +
verificación de usuario y de rol en `profiles` (`actions.ts:1685-1718`); ante cualquier fallo hace
`signOut` local + borra la cookie y responde error. La cookie se borra también en cada fallo de
`generateLink`/`verifyOtp` (`1619`, `1628`, `1643`). Ningún token sale en la respuesta: solo
`{ ok: true, targetName }` (`1671`).

**9 — observado.** `IMPERSONATE_USER` se audita cuando la impersonación es efectiva; si el insert de
auditoría falla tras reintentar, se deshace la sesión del destino (`signOut` + borrar cookie) y se
devuelve error: no existe una impersonación efectiva sin rastro. `IMPERSONATE_END` se escribe **antes**
de restaurar la sesión (si no se puede auditar, no se toca nada y el admin sigue en modo editor, con
reintento); si la restauración falla después, la impersonación igual termina, así que la fila sigue
siendo exacta. `EDIT_PROFILE` guarda before/after en `updateUserProfile`. La edición solo toca
`full_name` y `phone` con guarda `.neq("role","superadmin")` y rechaza editar a otro superadmin o a sí
mismo. Las tres acciones nuevas figuran en el mapa de etiquetas del panel (`page.tsx:110-116`).

**10 — observado.** `0064:233` define `unique (raffle_id, reporter_id)`; la policy de INSERT
(`0064:246-258`) exige `auth.uid() = reporter_id`, sorteo `active` y `created_by is distinct from
auth.uid()`. El alta la hace `reportRaffle` con el cliente SSR del usuario (`app/sorteos/report-actions.ts:30-67`),
nunca con service role, con rate limit de 10/hora por cuenta (`54`) y errores traducidos
(`lib/reports.ts:124-138`).

**11 — observado.** `resolveReport` (`actions.ts:1949-2013`), `pauseReportedRaffle` (`2023-2097`) y
`deleteReport` (`2105-2159`) exigen `requireSuperadminSession` y auditan `REPORT_RESOLVE`,
`REPORT_RAFFLE_PAUSE` y `REPORT_DELETE`. Pausar solo hace `UPDATE raffles SET status='closed'` con
guarda `.eq("status","active")` (`2064-2074`): no toca pagos, reservas, números vendidos ni el motor de
sorteo. Eliminar borra únicamente la denuncia, con snapshot previo para la auditoría (`2116-2154`).

**12 — observado.** 0064 usa `create table if not exists`, `drop policy if exists` + `create policy`,
`create or replace function/view`, `create index if not exists` y `on conflict do nothing` en el ledger
(`0064:29,44-51,63,80,125,220,245,261,274,286-314`). La vista `audit_logs` (`292-302`) expone
`admin_id`, `action`, `target_user_id` y `created_at as "timestamp"` como alias de lectura, con
comentarios que explican por qué no se crea una segunda tabla (`277-278`, `304-305`). `lib/migrations.test.ts`
encontró el registro `0064` en `_applied_migrations` (test verde).

**13 — observado.** `TrafficChart.tsx:1` y `MetricBarChart.tsx:1` son `"use client"`; no tocan `window`
en render y recharts recibe el ancho tras hidratar. `ReportRaffleButton` y `EditProfileButton` solo
usan `window` dentro de efectos/handlers.

**14 — observado.** `git status --porcelain` y `git diff --name-only` no listan
`app/api/checkout/**`, `app/api/webhooks/**`, `app/api/cron/**`, `lib/payments.ts`, `lib/mercadopago.ts`
ni cambios sobre `supabase/migrations/0063_*`. Al momento de la verificación `0063` era un archivo
nuevo sin trackear de otro feature en curso; después se commiteó aparte (`93367bf`).

**15 — observado.** `npx tsc --noEmit` → 0. `npx next lint` (con `NODE_OPTIONS=--max-old-space-size=4096`)
→ `✔ No ESLint warnings or errors`. `npm test` → **11 files / 127 tests passed** (incluye
`lib/page-views.test.ts` 16, `lib/impersonation.test.ts` 20 y `lib/reports.test.ts` 21).
`npm run build` → exit 0 con `/api/track-visit` en la salida, corrido por el Lead sobre el árbol actual;
no se repitió acá porque el árbol está siendo editado en paralelo por otro agente (rediseño visual,
`.design/`).

**16 — observado (verificación negativa, 2026-11-04).** Con la anon key y sin sesión, PostgREST
rechaza toda escritura por permisos (401 / `42501`): INSERT en `page_views`, `raffle_reports`,
`admin_audit_logs`, `refunds` y `_applied_migrations`; UPDATE en `raffles`, `profiles` y `refunds`.
La URL pública del bucket KYC responde `NoSuchBucket` (es privado). Es decir: ni con la clave que
viaja al navegador se puede inflar el tráfico, escribir auditoría, marcar una devolución como pagada
ni cerrar un sorteo; eso solo pasa por las Server Actions con `requireSuperadminSession()`.

**17 — observado (smoke E2E real, 2026-11-04).** Sobre un build de producción (`next start`) y con
usuarios QA temporales (borrados al final), se ejecutaron los bloques 5, 6, 8 y 9 del smoke test:

- **Impersonación:** el botón «Entrar como usuario» existe en la fila; al confirmar, la app navega a
  `/` con el banner «Modo Editor: estás viendo la app como …»; con la sesión del target, `/admin/super`
  queda bloqueado; «Salir del modo editor» restaura la sesión del superadmin. Auditoría:
  `IMPERSONATE_USER` e `IMPERSONATE_END` con el admin y el target correctos (nunca invertidos).
- **Edición de perfil:** el diálogo actualiza nombre y teléfono; `profiles` refleja el cambio y
  `EDIT_PROFILE` guarda `before`/`after`.
- **Moderación:** una denuncia de prueba pasa a `resolved` con `resolved_at` y `resolved_by` del
  superadmin, y deja `REPORT_RESOLVE` con `report_id`, `raffle_id` y `reporter_id`.
- **Auditoría:** la pestaña lista las cuatro acciones con etiquetas legibles y la vista `audit_logs`
  devuelve lo mismo que `admin_audit_logs`.

Evidencia: [`.design/smoke/god-mode-2026-11-04.json`](../../../.design/smoke/god-mode-2026-11-04.json).
Los bloques 3 (tráfico), 4 (dashboard) y 7 (denuncia del usuario) se sumaron después: track-visit
inserta y rechaza rutas inválidas, el dashboard muestra KPIs y gráficos reales, y el flujo de denuncia
del usuario funciona con el aviso de duplicado. Detalle en el
[smoke test](superadmin-god-mode-smoke-test.md). Quedan sin ejecutar el bloque 10 (regresión), los
rechazos de impersonación y las acciones de pausar/eliminar.

**Árbol compartido.** Además de este feature hay cambios sin commitear del rediseño visual de páginas
públicas (`.design/`, `globals.css`, `app/page.tsx`, Navbar/Footer, etc.) y del feature de cancelación
(`0063`, `lib/types.ts`, `RefundMarkPaidButton`, `cancelacion-devoluciones.md`). No se cuentan como
hallazgos de este feature; los gates corren sobre el árbol mezclado y por eso quedan verdes igual.

## Decisiones de diseño

- **Una sola tabla de auditoría.** `audit_logs` es una **vista** de `admin_audit_logs`, no una segunda
  tabla. El panel ya escribe ahí desde 0012 y partir el rastro en dos es exactamente lo que un log de
  auditoría no puede permitir; la vista cumple el nombre y la forma pedidos (`admin_id`, `action`,
  `target_user_id`, `timestamp`) sin duplicar escrituras. La vista se lee solo con service role.
- **MRR estimado por plan.** Precio mensual de `plan_prices` × cantidad de perfiles con
  `plan_expires_at > now()` agrupados por plan (`organizador`/`premium`). Se muestra como estimación y
  con el número de suscripciones activas; no es contabilidad.
- **Ingresos estimados = números vendidos × precio.** La RPC suma `raffle_numbers` en `sold` por día y
  multiplica por `raffles.price_per_number`. Es la misma definición que ya usa el panel, no una segunda
  contabilidad: no lee webhooks ni pagos.
- **Visitantes = usuarios autenticados únicos del día.** `count(distinct user_id)`; las visitas anónimas
  se cuentan en `views` pero no tienen identificador (0026 decidió no guardar PII de visitante), y así
  se rotula en el gráfico.
- **Modo Editor con magic link server-side.** Se guarda el refresh token del admin en cookie httpOnly,
  se genera un `magiclink` con service role y se canjea con el mismo cliente SSR para que las cookies
  de sesión del destino se escriban en el navegador; al salir se restaura al admin con `refreshSession`
  y se revalida en `profiles` que siga siendo superadmin. El rol nunca sale del JWT/body.
- **Pausar una denuncia = cerrar la venta.** `active → closed` con guarda de estado; el sorteo se puede
  sortear como cualquier otro y las devoluciones siguen siendo manuales.
- **Una denuncia por usuario/sorteo la garantiza el UNIQUE**, no un chequeo previo (evita carreras
  entre dos pestañas); el rate limit solo frena el barrido de muchos sorteos.

## Hallazgos de la verificación y correcciones aplicadas

La verificación independiente dio **GO** (sin bloqueantes ni altos). Después de esa pasada el Lead
corrigió los hallazgos que se podían cerrar sin tocar compras; los que son inherentes al diseño
quedan documentados abajo.

**Resueltos después de la verificación**

- **Auditoría best-effort → fail-closed en impersonación.** `logAction` ahora reintenta una vez y
  devuelve `boolean`. `startImpersonation` deshace la sesión del destino si no pudo auditar y
  `stopImpersonation` audita la salida **antes** de restaurar la sesión (si no puede auditar, no
  cambia nada y se puede reintentar). En moderación, si el log falla, la respuesta lo dice en vez de
  quedar en silencio.
- **`IMPERSONATE_END` ausente al fallar la restauración.** Ya no: la fila se escribe antes y la
  impersonación termina igual (`signOut`) en esos caminos.
- **`raffle_reports` aceptaba columnas del cliente.** La policy de INSERT ahora exige
  `status='pending'`, `resolved_at`/`resolved_by` nulos y `created_at = now()`: el denunciante no
  puede auto-ocultar su denuncia ni elegir fechas.
- **Comentario desactualizado y RPC sin consumidor.** Se corrigió el comentario de
  `admin_audit_logs` (policy `is_superadmin()`) y se eliminó `page_views_daily`, que el panel no
  usaba.
- **Cobertura del verificador de esquema.** `verificar_esquema.sql` ahora tiene checks 18-20:
  `page_views` + RPC, `raffle_reports` (RLS/UNIQUE/estado) y `audit_logs`.

**Abiertos (inherentes o dependientes de infraestructura)**

- **MEDIO — las visitas se pueden inflar desde el navegador dentro del límite.** Cualquier cliente
  puede hacer POST a `/api/track-visit` hasta 60 veces por minuto por IP (≈86.400/día) con
  `path="/"`. La tabla no admite escritura directa y la identidad no se puede falsificar, pero el
  contador es estimable, no infalsificable. Además la IP sale de `x-forwarded-for`/`x-real-ip` y el
  rate limit es fail-open si la RPC falla. Cerrarlo del todo requiere un token de sesión firmado por
  el render del servidor; se dejó como pendiente porque el brief pedía medir tráfico, no
  anti-fraude.
- **BAJO — vista `audit_logs` sin `security_invoker`.** Hoy es segura porque solo tiene `select` para
  service role; si alguna vez se le da acceso a `authenticated`, correría como dueña y saltearía la
  RLS de la tabla base.
- **BAJO — ingreso histórico con precio actual.** La suma usa `raffles.price_per_number` de hoy, no
  el precio al momento de cada venta; si un organizador cambia el precio, el histórico se recalcula.
  Es una estimación y así se rotula.
- **Observación — botón de denuncia visible para anónimos.** `app/sorteos/[id]/page.tsx` lo
  renderiza también sin sesión y el modal ofrece «Iniciá sesión»; el alta igual está bloqueada en el
  servidor (`report-actions.ts`), así que el requisito «solo logueado» se cumple a nivel de
  enforcement.

*Nota: los números de línea de la sección Evidence corresponden a la revisión auditada; las
correcciones posteriores movieron líneas dentro de `app/admin/super/actions.ts` y 0064.*

## Limitaciones y pendientes

- **0064 aplicada y verificada (2026-11-04).** El script de auditoría confirma `page_views` con RLS
  y sin policy de INSERT, la RPC `superadmin_daily_metrics(integer)`, `raffle_reports` con UNIQUE y
  RLS, y la vista `audit_logs`. El panel ya no debería mostrar los avisos de degradación.
- **0065 aplicada y verificada (2026-11-04).** El mismo script confirma la política de INSERT del dueño
  admin en `raffles` y el ledger con **38 filas**, de `0028` a `0065`, sin faltantes.
- **Smoke test E2E de impersonación: hecho el camino feliz (2026-11-04).** Entrar, banner, panel
  bloqueado como target, salir y auditoría se probaron contra un build de producción con usuarios QA
  (ver evidencia 17). Quedan los **rechazos** (otro superadmin, suspendido, email sin confirmar) y
  pausar/eliminar denuncias desde la UI; las reglas puras ya están en `canImpersonateTarget`.
- **Email sin confirmar.** El flujo depende de `generateLink` + `verifyOtp`; si el destino no confirmó
  el email, la acción traduce el error (`actions.ts:1496-1521`) y limpia la cookie, pero no se probó
  contra Supabase real. El brief lo pedía como caso de rechazo: queda verificar el mensaje exacto.
- **Auditoría de `EDIT_PROFILE` best-effort.** A diferencia de entrar/salir del modo editor, la edición
  de perfil no se revierte si el insert en `admin_audit_logs` falla después del update: `logAction`
  reintenta dos veces y, si igual falla, la edición queda hecha sin fila y el mensaje no lo advierte.
  Es el mismo criterio que el resto de las acciones del panel; revertir un update de perfil a ciegas
  sería peor (podría pisar un cambio del usuario).
- **TTL de la cookie: 2 h.** Si el admin cierra el navegador o deja pasar ese tiempo, la sesión de
  superadmin no se restaura sola y hay que volver a pasar por `/admin/verify` (fail-closed
  deliberado). Si nunca usa «Salir del modo editor» queda la entrada auditada y no habrá
  `IMPERSONATE_END` hasta que el flujo de salida se complete.
- El MRR incluye planes manuales y canjes de licencia como si fueran suscripciones mensuales: es
  estimación, no facturación real.
- Los visitantes únicos solo cubren usuarios autenticados; no hay identificador anónimo por privacidad.
- `npm run build` se repitió sobre el árbol ya commiteado (`8615c55`) → exit 0, con `/api/track-visit`
  en la salida.

## Next

El feature está cerrado: `0064` y `0065` aplicadas en la base (ledger de 38 filas) y los bloques 3, 4,
5, 6, 7, 8 y 9 del [smoke test](superadmin-god-mode-smoke-test.md) verificados contra un build de
producción (evidencia 17). Quedan como verificación opcional, no bloqueante, el bloque 10 (regresión
responsive), los rechazos de impersonación y las acciones de pausar/eliminar denuncias. Después:
evaluar un token de sesión firmado para `/api/track-visit` si las métricas de tráfico van a guiar
decisiones de negocio, y revisar si conviene sumar al endpoint una deduplicación por sesión (hoy el
sessionStorage del navegador evita repetir la visita, pero un cliente propio puede ignorarlo).

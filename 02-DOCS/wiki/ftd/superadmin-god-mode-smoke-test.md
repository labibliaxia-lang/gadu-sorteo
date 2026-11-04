---
author: Gadu
branch: main
status: in-progress
---
# Smoke test — Superadmin God Mode

Checklist manual para probar contra Supabase real lo que no se puede probar en el repo: migración
0064, tráfico, dashboard, Modo Editor, denuncias y auditoría.

**Resultado 2026-11-04 (parcial, automatizado).** Los bloques **5, 6, 8 y 9** se ejecutaron de punta a
punta contra un build de producción, con usuarios QA temporales y borrados al final: impersonación
(entrar, banner, panel bloqueado como target, salir), edición de perfil, resolución de una denuncia y
auditoría. Todo dio **OK**. Evidencia en
[`../../.design/smoke/god-mode-2026-11-04.json`](../../../.design/smoke/god-mode-2026-11-04.json).
Siguen sin ejecutar los bloques 3 (tráfico), 4 (dashboard), 7 (denuncia del usuario) y 10 (regresión),
y dentro del 5/8 los rechazos y las acciones de pausar/eliminar.

**Tiempo estimado:** 30–45 minutos.
**Cuándo hacerlo:** antes de commitear/deployar el feature. Sin este test, el código está probado
solo con typecheck, lint, unit tests y build.

## 0. Preparación

| # | Qué | Cómo |
|---|-----|------|
| 0.1 | Entorno con base real | Preview de Vercel o `npm run dev` con `.env.local` real (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ACCESS_CODE_HASH`) |
| 0.2 | Cuenta **A** = superadmin | Con email confirmado y acceso al código maestro de `/admin/verify` |
| 0.3 | Cuenta **B** = organizador | Con al menos un sorteo `active`, distinto de A |
| 0.4 | Cuenta **C** = usuario común | Email confirmado, sin rol de organizador, distinto de A |
| 0.5 | Una cuenta **D** de descarte | Para probar el rechazo por suspensión (no uses B ni C) |
| 0.6 | Evidencia | Anotá hora de inicio y sacá capturas; el SQL Editor de Supabase es la fuente de verdad |

La migración 0064 solo **agrega** objetos (`page_views`, `raffle_reports`, vista `audit_logs`, RPC,
índices y permisos): no borra ni modifica datos existentes. Igual, si querés respaldo:
`select * from public.admin_audit_logs;` → export CSV.

## 1. Antes de migrar: el panel no se rompe

Objetivo: que una migración sin aplicar degrade con avisos, no con un 500.

1. Entrá como **A** a `/admin/super` (si te manda a `/admin/verify`, pasá el código maestro).
2. Esperado:
   - El panel carga y las pestañas funcionan.
   - Dashboard: aviso *«Las métricas diarias todavía no están disponibles: falta aplicar la migración 0064…»* y los 3 gráficos vacíos.
   - Denuncias: aviso discreto y lista vacía.
   - Usuarios / Sorteos / Auditoría: funcionan normal.
3. SQL: `select to_regclass('public.page_views');` → `null`.
4. **Señal de fallo:** error 500 o pantalla en blanco → revisá los logs del server (Vercel o terminal).

## 2. Aplicar la migración 0064

**Opción A — SQL Editor (recomendada, es la que documenta el README):**
1. Supabase → SQL Editor → New query.
2. Pegá completo `supabase/migrations/0064_page_views_and_audit.sql` → Run.
3. Esperado: `Success. No rows returned`.

**Opción B — CLI:** `supabase db push` (la migración ya trae su `insert` en `_applied_migrations`).

**Verificación (SQL Editor):**

```sql
select to_regclass('public.page_views')    as page_views,
       to_regclass('public.raffle_reports') as raffle_reports,
       to_regclass('public.audit_logs')     as audit_logs_view;

select proname from pg_proc where proname = 'superadmin_daily_metrics';

select version from public._applied_migrations where version = '0064';
```

Esperado: los 3 objetos, la función y la fila `0064`.

4. Corré `supabase/tests/verificar_esquema.sql` completo en el SQL Editor.
5. Esperado: una sola celda con una línea por check. **Ninguna línea `FALTA` o `CRÍTICO`**; los
   checks 18-20 (page_views + RPC, denuncias, auditoría) deben decir `OK`.

## 3. Tráfico (`page_views`)

1. Abrí una ventana **incógnita** (sin sesión) y visitá la Home `/`.
2. Visitá la página pública de un sorteo `/sorteos/<id>`.
3. SQL:

```sql
select path, count(*) as visits, max(created_at) as last
from public.page_views
group by path
order by last desc;
```

Esperado: filas para `/` y `/sorteos/<id>`; `date` con la fecha de hoy en Argentina.
(`date` se calcula en hora de Argentina, no en UTC.)

4. Ahora iniciá sesión con **C** y abrí la Home:

```sql
select path, (user_id is not null) as logged, count(*)
from public.page_views
where date = (now() at time zone 'America/Argentina/Buenos_Aires')::date
group by 1, 2
order by 1;
```

Esperado: una fila con `logged = true` para `/`.

5. **Anti-abuso (opcional pero recomendado):**
   - POST con ruta no permitida → `400`:
     ```bash
     curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://TU-APP/api/track-visit" \
       -H 'content-type: application/json' -d '{"path":"/admin"}'
     ```
   - Insert directo a PostgREST con la anon key → debe fallar por permisos/RLS.
   - Recargar la misma pestaña no duplica (sessionStorage por pestaña). Abrir **otra** pestaña sí suma: es una visita más.
6. **Señal de fallo:** la tabla queda vacía y la consola del navegador muestra error del `fetch` →
   revisá que la migración esté aplicada y que el server tenga `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Dashboard (KPIs y gráficos)

1. Como **A**, `/admin/super` → pestaña **Dashboard**.
2. Esperado:
   - Gráfico de visitas con los días de la sección 3.
   - «Usuarios nuevos» con al menos el alta de C (si la creaste hoy).
   - «Ingresos estimados» > 0 si hay números `sold` dentro de los últimos 30 días.
   - KPI Visitas 30 días = suma de la serie.
3. **MRR:** en el panel «Precios de los planes», guardá un precio (ej. organizador 10.000) y recargá.
   Esperado: MRR = precio × cantidad de perfiles con `plan_expires_at > now()`, con el hint
   «N suscripciones activas». Si no hay suscripciones vigentes, MRR = `$ 0` y el hint lo dice.
4. **Señal de fallo:** los gráficos quedan vacíos aunque `page_views` tenga filas → mirá la consola
   del server; probablemente la RPC no está aplicada o el rol de A no es `superadmin` en `profiles`.

## 5. Modo Editor (impersonación)

Precondición: C con email **confirmado** y sin suspensión.

1. Pestaña **Usuarios** → fila de C → **«Entrar como usuario»** → confirmar.
2. Esperado:
   - Te lleva a la Home con la sesión de C (Navbar muestra C).
   - Arriba aparece el banner: *«Modo Editor: estás viendo la app como C…»*.
3. SQL:

```sql
select action, admin_email, target_email, details, created_at
from public.admin_audit_logs
where action = 'IMPERSONATE_USER'
order by created_at desc
limit 3;
```

Esperado: `admin_email` = A y `target_email` = C (no al revés).
4. Mientras estás como C, abrí `/admin/super` → debe quedar bloqueado (te manda a `/admin/verify` o
   te saca): la consola del superadmin no se hereda.
5. Tocá **«Salir del modo editor»** en el banner. Esperado: volvés a `/admin/super` como **A**,
   Navbar muestra A y podés abrir la consola.
6. SQL: debe existir la fila `IMPERSONATE_END` con el mismo `target_user_id`.
7. **Rechazos esperados:**

| Caso | Resultado esperado |
|------|--------------------|
| Fila de un superadmin | No hay botón «Entrar como usuario» (solo degradar / Ver ficha) |
| Cuenta suspendida (D) | «La cuenta está suspendida: no se puede usar el modo editor.» |
| Usuario sin email confirmado | «Ese usuario todavía no confirmó su email…» |
| Tu propio usuario | No hay botón (y el servidor lo rechaza) |

8. Si al salir dice «La sesión de superadmin venció; volvé a iniciar sesión», es el fail-closed
   esperado cuando el refresh token no se puede restaurar: volvé a entrar.

## 6. Edición manual de perfil

1. **Usuarios** → **«Editar»** en C → cambiá nombre y teléfono → guardar.
2. Esperado: la fila se actualiza sin recargar toda la página.
3. SQL:
   ```sql
   select full_name, phone from public.profiles where email = '<email-de-C>';
   ```
4. SQL: debe existir `EDIT_PROFILE` con `before` y `after` en `details`.
5. Fila de un superadmin: no se puede editar («No se puede editar el perfil de un superadmin»).

## 7. Denuncias — lado usuario

1. Como **C**, abrí un sorteo `active` de **B** (que no sea de C).
2. Botón **«Denunciar este sorteo»** → motivo «Posible fraude» + comentario → enviar.
3. Esperado: *«Denuncia enviada. El equipo la va a revisar.»*
4. SQL:
   ```sql
   select raffle_id, reporter_id, reason, status, created_at
   from public.raffle_reports
   order by created_at desc
   limit 5;
   ```
   Esperado: la fila nace `pending`, con C como `reporter_id`.
5. **Duplicado:** volvé a denunciar el mismo sorteo → «Ya denunciaste este sorteo.» (lo garantiza el
   UNIQUE, no solo la UI).
6. **Casos que no deben permitir denunciar:**
   - Sorteo propio (logueado como B): el botón no se muestra.
   - Sorteo cerrado/sorteado/cancelado: el botón no se muestra (solo `active`).
   - Sin sesión: el botón se ve, pero al abrir el modal dice «Iniciá sesión para denunciar» con link a login.
7. **Intento de saltear la UI (opcional):** con la consola del navegador y la anon key, intentá
   insertar en `raffle_reports` con `status: 'resolved'` o `reporter_id` de otra persona. Debe ser
   rechazado por RLS.

## 8. Denuncias — moderación (superadmin)

1. Como **A**, `/admin/super` → pestaña **Denuncias**: badge con el número de pendientes (el mismo de
   la sección 7).
2. **Resolver:** «Resolver» → confirmar. Esperado: la denuncia sale de la cola (solo se listan
   `pending`).
   SQL: `status = 'resolved'`, `resolved_at` y `resolved_by` con A. Auditoría: `REPORT_RESOLVE`.
3. **Pausar sorteo:** con otra denuncia pendiente, «Pausar sorteo» → confirmar. Esperado:
   - El sorteo público pasa a «Cerrado» y no acepta más ventas.
   - La auditoría registra `REPORT_RAFFLE_PAUSE` con `from: active, to: closed`.
   - Pagos y reservas **no cambian**: `select count(*) from public.payments where raffle_id = '<id>';` antes y después da igual; los `raffle_numbers` siguen igual.
   - Si el sorteo ya no está `active`, el botón está deshabilitado y el server responde «El sorteo ya no está activo.»
4. **Eliminar:** «Eliminar» → confirmar. Esperado: la fila desaparece; auditoría `REPORT_DELETE`
   con el snapshot (raffle, reporter, motivo, estado).
5. Cada acción debe dejar su fila en `admin_audit_logs` y refrescar la lista sin recargar la página.

## 9. Auditoría

1. Pestaña **Auditoría**: últimos 100 registros, con etiquetas legibles y filtro por acción.
2. Filtvá por `IMPERSONATE_USER`, `EDIT_PROFILE`, `REPORT_RESOLVE` y `REPORT_RAFFLE_PAUSE`: cada uno
   debe traer las filas de las secciones 5–8.
3. La vista alias responde igual que la tabla:
   ```sql
   select * from public.audit_logs order by "timestamp" desc limit 5;
   ```
4. Esperado: mismas filas que `select * from public.admin_audit_logs order by created_at desc limit 5;`.

## 10. Regresión y responsive

| Qué | Esperado |
|-----|----------|
| Usuarios: búsqueda, filtro por rol, paginación | Igual que antes del feature |
| Cambio de rol y acciones masivas | Siguen funcionando y auditando |
| Solicitudes de rol: aprobar / rechazar | Igual que antes |
| KYC: imágenes con URL firmada | Cargan y clasifican (frente/dorso/selfie) |
| Precios de planes: guardar | Se refleja en `/planes` y en el MRR |
| Licencias: generar / revocar | Siguen funcionando |
| Pestaña Sorteos: links público y admin | Abren el sorteo correcto |
| Móvil 375 px | Sin scroll horizontal; tabs con scroll; cards apiladas |
| Compra de un número (regresión opcional) | Reserva, pago y `sold` siguen funcionando (no se tocó esa lógica) |

## 11. Cierre

1. Anotá en el documento FTD (`superadmin-god-mode.md`, sección Evidence) fecha, entorno y resultado.
2. Datos de prueba a limpiar:
   ```sql
   -- Solo las denuncias de prueba (revisá el raffle/reporter antes de borrar)
   delete from public.raffle_reports where raffle_id = '<id-de-prueba>';

   -- Visitas generadas por el test (opcional; son métricas reales)
   delete from public.page_views where created_at >= '<inicio-del-test>';
   ```
   **No borres** filas de `admin_audit_logs`: son evidencia de auditoría (si hace falta, borrá solo el
   rango exacto del test y dejalo dicho en el documento).
3. Revertir lo que hayas cambiado: precio de plan, suspensión de D, nombre/teléfono de C, estado del
   sorteo pausado (si era un sorteo real, volvé a `active` solo si aplica).

## Criterio GO / NO-GO

| Resultado | Veredicto |
|-----------|-----------|
| 1–10 sin fallos, con las filas de auditoría de 5–8 presentes | **GO**: commitear/deployar |
| Falla solo la sección 1 (fail-safe antes de migrar) | **NO-GO suave**: revisar tolerancia a la migración faltante |
| Falla cualquier paso de 5, 7 u 8 (permisos, auditoría, denuncias) | **NO-GO**: no commitear hasta arreglar |
| Falla solo 10 (responsive) | GO con deuda visual anotada en el FTD |

## Señales de fallo y qué mirar

| Síntoma | Causa probable |
|---------|----------------|
| El aviso de «falta migración 0064» sigue después de aplicarla | La corriste en otro proyecto/rama de Supabase, o el ledger no tiene `0064` |
| La tabla `page_views` no crece | El server no tiene `SUPABASE_SERVICE_ROLE_KEY`, o la tabla no existe en ese proyecto |
| Fechas corridas un día | Revisá `select date, created_at from page_views limit 3`; `date` se calcula en hora Argentina |
| «No autorizado» al impersonar | La cuenta A no es `superadmin` en `profiles` (el rol se lee de la tabla, no del JWT) |
| magic link rechazado | El email del destino no está confirmado, o el proveedor de Email de Auth está deshabilitado |
| «La sesión de superadmin venció» al salir | Refresh token rotado/expirado: fail-closed esperado, volver a loguearse |
| «El sorteo ya no está activo» al pausar | El organizador lo cerró/sorteó entre la lectura y la escritura (guarda de estado) |
| No aparece «Denunciar este sorteo» | El sorteo no está `active`, o estás logueado como su dueño |
| No aparece «Entrar como usuario» | La fila es de un superadmin (a propósito) |

---
author: Simulador Gadu
fecha: 2026-11-05
estado: completo — corrido contra la web real, por pedido explícito del dueño
---

# Informe de simulación — Gadu Sorteos

**Qué se hizo.** Los cuatro escenarios se ejecutaron con navegador real (Playwright + Chromium) contra
`https://gadu-sorteo-doci.vercel.app`. Cuatro cuentas sintéticas (`@gadu.test`), dos sorteos de prueba
creados por la UI y borrados al final.

**Advertencia de entorno.** Esta corrida **escribió en la base de producción**
(`mjgcoeikcyzwojbqtuah`), porque no existe un entorno aislado y el dueño del proyecto autorizó
explícitamente correr contra la web real con sorteos marcados y borrarlos. No es lo recomendado: es lo
que se acordó. El estado se verificó antes y después (11 sorteos → 11 sorteos, 0 usuarios `@gadu.test`).

**Resultado global: 14 de 14 pasos `ok`.**

---

## 1. Resumen de simulaciones

| Escenario | Estado | Pasos | Evidencia |
|---|---|---|---|
| **A** — Happy path: Ana compra 2 números, Carla confirma, sortea, Diego verifica | ✅ **ok** | 8/8 | `evidencia/2026-11-05-A/` |
| **B** — Concurrencia: 3 compradores por el mismo número | ✅ **ok** | 1/1 | `evidencia/2026-11-05-B/` |
| **C** — Abandono: reserva sin comprobante, cuándo se libera | ✅ **ok** | 2/2 | `evidencia/2026-11-05-C/` |
| **D** — Integridad: alterar semilla o hash | ✅ **ok** | 3/3 | `evidencia/2026-11-05-D/` |

### Escenario A, paso por paso

| Paso | Observado | Tiempo |
|---|---|---|
| A1 abrir sorteo | status 200. **Aparece un modal de dirección que bloquea la compra** | 5.186 ms |
| A2 reservar 3 y 7 | modal «Reserva confirmada» con enlace `wa.me` presente | **525 ms** |
| A3 estado en base | `3: reserved`, `7: reserved`, vence a 48 h | — |
| A4 confirmar pago | Carla tilda «Comprobante recibido» y marca pagado → `3: sold`, `7: sold` | — |
| A5 compromiso y sorteo | botón visible tras publicar; estado `drawn`, **ganador 7** | — |
| A6 verificación independiente | **4/4 coinciden** con mi recálculo | — |
| A6b verificador en navegador | **✓ Verificado**, 4 checks en verde, ganador calculado 7 | — |

Un sorteo completo, de la reserva a la verificación, tardó **poco más de un minuto real**.

### Escenario B

Los tres compradores entraron a la vez y clickearon el número 5 al mismo tiempo.

| Comprador | Resultado |
|---|---|
| Ana | **ganó**: modal «Reserva confirmada» |
| Bruno | rechazo: «Estos números ya no están disponibles: 5. Elegí otros.» |
| Eva | rechazo |

En base quedó **una sola fila** `reserved`, de Ana. Sin números duplicados, sin doble venta.
El aviso al perdedor es claro y nombra el número. Tardó **20.757 ms** en las tres pestañas
concurrentes, pero eso mide mi máquina, no el servidor.

### Escenario C

| Paso | Observado |
|---|---|
| C1 reservar y abandonar | estado `reserved`, vence en **48 h** (`2026-11-07T04:33:31Z`). Bruno cerró la pestaña sin mandar comprobante |
| C2 liberación | **intervención de laboratorio**: se forzó `reserved_until` al pasado y se llamó a `release_expired_reservations` → el número volvió a `available`, la RPC devolvió 1 |

**La liberación funciona cuando alguien la dispara.** El problema es quién y cuándo (bug B3).

### Escenario D

| Paso | Observado |
|---|---|
| D1 verificación limpia | **4/4 coinciden** |
| D2 listado manipulado | cambiar un número rompe `numbersHash`; el ganador recalculado pasa de 7 a 1003 |
| D3 semilla alterada | el compromiso publicado `1a051338…` no se reproduce con otra semilla (`bd80df83…`) |

Valores del sorteo real (sorteo `569d0470…`, ya borrado; las huellas quedan como evidencia):

```
commitment   1a051338f3d5ea1576b5f0f11ba082a35101879b96f8450f04d935a253adbb1c
numbersHash  e59cdbb2a186e30e685f85e9ead64cf42d5a196953af5f381c5fb4caf0b1c66e
winner       7
resultHash   05f11f42cdac2addac686edb2e3b9a093fa5e3431687c43458e072c4b2cd73ac
```

Recalculados con `01-TOOLS/SIMULADOR/verify-hash.mjs` (`node:crypto`, implementación propia que **no
importa** `lib/draw-verify.ts`).

---

## 2. Bugs y errores lógicos

Los primeros seis salieron de leer el código. Los marcados **[visto en vivo]** se confirmaron en esta
corrida.

### B1 — Se puede confirmar una venta DESPUÉS del sorteo · **crítico — ✅ arreglado y aplicado**

`organizer_mark_reserved_sold` está definida una sola vez (`0029_manual_prepaid_sales.sql:139`) y su
`UPDATE` no mira el estado del sorteo:

```sql
-- 0029:169-179
where raffle_id = p_raffle_id
  and number = any (p_numbers)
  and status = 'reserved'        -- ← falta status <> 'drawn'
```

`0071` cerró este agujero para `sell_numbers` y `organizer_mark_sold` (`0071:141-144`), pero no para el
camino prepago, que es **el único que se usa hoy** porque Mercado Pago está apagado.

Consecuencia: se marca vendido después del sorteo, `numbers_hash` deja de reproducirse y el verificador
acusa fraude en un sorteo limpio.

**Arreglo aplicado en el repo** (`supabase/migrations/0074_no_prepaid_sales_after_draw.sql`):
redefine la función con el mismo guard que `0071:141-144`, mantiene el «todo o nada» y registra la
versión en el ledger. `lib/security-invariants.test.ts` suma el caso, y como ese test lee la **última**
definición, volver a pegar el cuerpo de `0029` lo hace fallar.

Verificado: `typecheck` 0, `lint` 0, **213/213 tests** en 19 archivos
(`evidencia/2026-11-05-fix-b1/`).

**Aplicado y verificado en la base.** El SQL se ejecutó en el proyecto y se comprobó **por
comportamiento**, no por el mensaje «Success» del editor: con una cuenta admin temporal y un sorteo
temporal en estado `drawn`, la RPC respondió

```
El sorteo ya fue sorteado: no se pueden confirmar pagos de reservas
```

El cuerpo viejo de `0029` no tiene esa rama y habría respondido «Algunos números ya no estaban
reservados». Mensajes distintos, sin ambigüedad: la función vigente es la nueva.

Cuenta y sorteo temporales borrados en la misma corrida; base de vuelta en 11 sorteos y 0 usuarios
`@gadu.test` (`evidencia/2026-11-05-fix-b1/verificacion-0074.txt`).

### B2 — El código decía «cada 5 minutos» y el cron corría una vez por día · **alto — ✅ resuelto**

`vercel.json:5` decía `"schedule": "0 0 * * *"`. En contra:

- `app/api/cron/release-reservations/route.ts:8` — «lo invoca Vercel Cron cada 5 minutos».
- `README.md:342` — documentaba `"*/5 * * * *"`.
- `README.md:35` — «el cron (cada 5 min) libera las reservas expiradas».

Tres lugares afirmando algo que la configuración no hacía.

**El motivo del diario no era un olvido.** `app/api/cron/auto-draw/route.ts:11-12` lo explica: *«Vercel
Hobby solo permite cron diario»*. Así que cambiarlo a `*/5` habría roto el deploy en Hobby.

**Arreglo aplicado**, sin exigir plan pago:

- `lib/release-expired.ts` libera las reservas vencidas **al abrir la página pública**, con gate de un
  minuto por instancia. Es el mismo patrón que ya usaba `maybeAutoDrawRaffle` (`auto-draw.ts:304`), que
  también existe justamente porque el cron no llega a tiempo.
- `README.md` ahora cuenta la restricción real y los dos caminos (fallback, o scheduler externo/pago).
- El comentario del route y `vercel.json` quedaron coherentes.

Costo aceptado: un `UPDATE` acotado por minuto y por instancia sobre un índice (`reserved_until`). Si el
sitio crece o pasa a varias instancias, se reemplaza por el cron pago o un scheduler externo.

### B3 — Sin `CRON_SECRET` el cron devolvía 401 y no liberaba nada · **alto — ✅ resuelto**

```ts
// antes
const authorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
if (!authorized) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
```

Con `CRON_SECRET` vacío, **todo** el cron quedaba muerto —liberación, vencimiento de planes,
recordatorios, limpieza de rate limits y sorteos automáticos— y el log mostraba un 401, que se lee como
«alguien golpeando la puerta», no como «falta una variable».

**Arreglo aplicado.** `lib/cron-auth.ts` separa los dos casos:

| Situación | Antes | Ahora |
|---|---|---|
| Falta `CRON_SECRET` | 401, silencio | **500** + `console.error` nombrando la variable |
| Header inválido | 401 | 401 |

Los dos endpoints (`release-reservations` y `auto-draw`) tenían la misma lógica; el primero ya usa el
módulo. Contrato fijado en `lib/cron-auth.test.ts` (6 casos).

**Sigue pendiente de tu lado:** `CRON_SECRET` está vacío en `.env.local`. En Vercel hay que cargarlo
para que el cron diario funcione. Mientras falte, ahora el log lo dice en vez de callarlo.

### B4 — El comprador queda bloqueado por un modal de dirección · **alto — ✅ arreglado, desplegado y verificado**

`app/layout.tsx:180-190` monta `ProfileCompletionGate` para todo usuario logueado, y el componente
bloqueaba **cualquier ruta** salvo una lista blanca (`/perfil`, `/login`, `/terminos`,
`/admin/verificacion`…). La página del sorteo no estaba en la lista.

Lo vi en A1: el modal interceptaba todos los clics. Recién después de cargar teléfono, dirección,
ciudad, provincia, código postal y país, la grilla respondió.

Para un sorteo de $100 es pedirle la dirección a alguien que quizá sólo quería mirar. Es la fricción de
mayor impacto en conversión del informe.

**Arreglo aplicado.**

| Pieza | Qué hace |
|---|---|
| `components/DeliveryAddressForm.tsx` | formulario único, extraído del gate (ids `gate-*` conservados) |
| `lib/direccion.ts` | `direccionEntregaCompleta()`, espejo de `deliverySchema` (`app/perfil/actions.ts`) |
| `ProfileCompletionGate` | ahora bloquea **sólo** `/admin/*`, excepto `/admin/verificacion` |
| `NumbersGrid` | consulta el perfil y, al reservar sin dirección, abre un diálogo; al guardar **continúa la reserva** sola |

El criterio: la dirección se pide cuando la persona ya eligió sus números, no cuando entra a curiosear.
Si la consulta del perfil falla, **no se frena la compra** — el dato se puede completar después desde
`/perfil` y no vale perder una venta por un timeout.

`lib/direccion.test.ts` fija la regla (5 casos). Gates: typecheck 0, lint 0, **243/243 tests**, build
exit 0.

**Verificado en la web desplegada** (commit `5d31eb4`, deploy detectado a los ~2 minutos):

| Comprobación | Resultado |
|---|---|
| Cuenta logueada **sin** dirección | ✅ perfil con los 6 campos en `null` |
| Abrir el sorteo | ✅ **no** aparece el modal bloqueante; la grilla se ve completa |
| Elegir un número | ✅ aceptado, contador y total actualizados |
| Apretar «Reservar» | ✅ aparece «¿A dónde te mandamos el premio?» con los 6 campos |
| ¿Reservó algo? | ✅ **no**: el número 1 del sorteo siguió en `available` |
| «Ahora no» | ✅ cierra el diálogo |

Evidencia: `evidencia/2026-11-05-b4-verificado/` (2 capturas + `verificacion.json` + `pasos.json`).

**Hallazgo que apareció al verificar (B12).** La primera corrida dio un falso negativo contra el sorteo
«amoladora», que tiene `whatsapp_contact` en `NULL`. `NumbersGrid` cortaba con «El organizador todavía
no cargó un WhatsApp de contacto» **después** de que la persona eligiera sus números.

Ojo con el diagnóstico fácil: el wizard **ya exige** alias o CBU y WhatsApp desde su `superRefine`
(`sorteos/nuevo/page.tsx:78-93`). No hay hueco de validación: el problema es **data vieja** — sorteos
creados antes de esa regla. En producción había al menos cuatro activos en esa situación («amoladora»
x2, «camion», «amo»).

**Arreglo aplicado (del lado del comprador).** `NumbersGrid` detecta que no hay WhatsApp y muestra el
aviso arriba de la grilla, con el botón de reservar deshabilitado. El comprador deja de caminar hasta el
final para chocar con un error.

**Verificado en la web desplegada:** el sorteo «amoladora» muestra el aviso y no ofrece el botón de
reservar (`evidencia/2026-11-05-b6-b12-verificado/`).

**Pendiente de decisión:** esos cuatro sorteos siguen sin poder venderse. O los organizadores cargan los
datos, o se desactivan hasta que lo hagan.

### B5 — El wizard pedía 4 datos y la base exigía 9 · **alto — ✅ arreglado**

> **Corrección.** En la primera versión de este informe dije que el modal de dirección y el trigger
> escribían en lugares distintos. **Estaba equivocado.** `saveDeliveryAddress`
> (`app/perfil/actions.ts:181-191`) ya escribe en `profiles`, que es donde mira el trigger. El error lo
> detecté al ir a implementar el arreglo: el código que pensaba cambiar ya hacía lo correcto.

El problema real es otro: **dos definiciones distintas de «datos completos»**.

| Dónde | Cuántos campos exige |
|---|---|
| Wizard, `app/admin/sorteos/nuevo/page.tsx:183-190` | **4**: nombre, teléfono, ubicación, DNI |
| `missingPersonalData`, `app/admin/verificacion/actions.ts:117-129` | **9**: los 4 + dirección del DNI, dirección de entrega, ciudad, provincia, código postal |
| Trigger `enforce_organizer_kyc`, `0060:57-67` | **9**, los mismos que la fila anterior |

El wizard comprobaba un subconjunto. Consecuencia: un organizador con los 4 campos cargados **pasaba el
gate del wizard**, completaba los tres pasos, apretaba «Crear sorteo» y recién ahí la base lo rechazaba
con «KYC incompleto». Todo el trabajo del formulario tirado al final, sin pista de qué faltaba.

Lo viví en la simulación: me faltaba `dni_address` y el mensaje no lo nombraba.

**Arreglo aplicado.** La regla quedó en un solo lugar, `lib/kyc.ts`:

- `CAMPOS_KYC` enumera los 9 campos con su etiqueta legible.
- `datosPersonalesFaltantes()` devuelve qué falta, con nombre.
- El wizard y `missingPersonalData` ahora llaman a la misma función.

`lib/kyc.test.ts` fija el contrato: si alguien agrega un campo al trigger y no acá, el test falla —
incluido el caso explícito «con sólo los 4 del wizard viejo todavía falta».

Verificado: `typecheck` 0, `lint` 0, **218/218 tests** en 20 archivos.

### B6 — El verificador «automático» no es automático · **medio — ✅ arreglado, desplegado y verificado**

La sección se llamaba **«Verificador automático»** y decía «Se ejecuta en tu navegador». Pero no
ejecutaba nada hasta que el usuario apretaba **«Comprobar»**. Antes de ese clic no había ningún check:
sólo cuatro huellas en texto. Un verificador que parece corrido y no lo está es peor que uno que pide
el clic explícitamente.

**Arreglo aplicado.** `DrawVerifier` corre al montar, con el listado oficial ya cargado, y el botón
queda para reejecutar después de pegar otro listado.

**Verificado en la web desplegada** con un sorteo temporal ya sorteado (hashes calculados por el propio
script, sorteo borrado al terminar):

| Comprobación | Resultado |
|---|---|
| Sin tocar ningún botón | ✅ «✓ Verificado: el resultado es consistente con la semilla comprometida» |
| Los 4 checks | ✅ en verde, «Ganador calculado: 10» |
| Control de que no es decorativo | ✅ pegando `3, 7, 99` avisa que no coincide |

Evidencia: `evidencia/2026-11-05-b6-b12-verificado/`.

### B7 — Error engañoso al reintentar una reserva · **bajo**

`reserve_numbers_prepaid` devuelve `[]` tanto si otro se adelantó como si la reserva ya era tuya.
`NumbersGrid.tsx:392-400` interpreta siempre el primero: «Estos números ya no están disponibles».
Si la respuesta se perdió por red, el comprador ve eso sobre números que **sí** tiene.

### B8 — `raffle_visits` con 403 · **falso positivo — no es un bug**

> **Corrección.** Reporté que la analítica de visitas no registraba nada porque vi en la consola, tres
> veces, `new row violates row-level security policy for table "raffle_visits"`. **Me equivoqué.**

La política `raffle_visits_insert_public` (`0027`) exige que el sorteo esté `active`:

```sql
with check ( ... and r.status = 'active' )
```

Los 403 los generó Diego, que en A6 abrió el sorteo **después de que se sorteó**. Para un sorteo
`drawn`, que el insert falle es el comportamiento correcto: es justamente el endurecimiento que
introdujo `0027` para que un anónimo no pueda inflar contadores.

**Comprobado en la web desplegada:** sobre un sorteo activo, una visita anónima registrada de punta a
punta, sin un solo error de consola.

| Medición | Antes | Después |
|---|---|---|
| Filas en `raffle_visits` (sorteo «amoladora») | 14 | **16** |
| Errores de consola | — | **ninguno** |

Lo que sí queda como fricción real, aunque menor: el tracker escribe `console.error` en el navegador en
vez de bajar el tono a `warn` o ignorarlo cuando la política rechaza por estado. Un 403 esperado no
debería ensuciar la consola de producción.

### B9 — La grilla deja el número tomado en la selección · **bajo [visto en vivo]**

En B1, el perdedor vio la grilla con el 05 marcado como «Reservado» y su propia selección todavía
pintada, con el total en `$ 0`. El mensaje es correcto, pero no limpia la selección muerta.

### B10 — No hay forma de ocultar un sorteo · **medio — ✅ arreglado, desplegado y verificado**

`app/page.tsx:152-155` listaba todos los sorteos sin filtro y la política es `using (true)`
(`0041_rls_close.sql:43-45`). No existía `is_listed` ni `is_test`. Cualquier sorteo que se creara —de
prueba o no— **aparecía en la home al instante**. Lo comprobé: los dos sorteos de prueba de esta
simulación estuvieron visibles mientras duró la corrida.

**Arreglo aplicado.** Migración `0079` agrega `raffles.is_listed boolean not null default true`, y los
tres listados públicos la respetan: home, ganadores y sitemap. El panel del organizador **no** filtra,
porque tiene que poder operar sus sorteos internos.

Decisiones que importan:

- **Default `true`:** nada cambia para los 11 sorteos existentes.
- **No es control de acceso:** el deslistado sigue abriéndose por enlace directo. Es justo lo que hace
  falta para probar un sorteo sin publicitarlo.
- **Sin guard, a diferencia de `is_featured` (0077):** destacar es herramienta comercial del dueño;
  deslistar es decisión del organizador sobre su propio sorteo, y la RLS de UPDATE ya lo limita a sus
  filas.

**Verificado en la web desplegada** con un sorteo temporal `is_listed = false`:

| Comprobación | Resultado |
|---|---|
| Home | ✅ no aparece |
| Sorteos normales | ✅ siguen apareciendo («amoladora», «navidad», «usado») |
| `sitemap.xml` | ✅ no incluye su id |
| Enlace directo `/sorteos/<id>` | ✅ HTTP 200, muestra el título |
| Limpieza | ✅ 11 sorteos, 0 deslistados, 0 de prueba |

**No ejercitado:** el filtro en `/ganadores` (el sorteo temporal no estaba sorteado). Queda declarado
como pendiente, no como hecho. Evidencia: `evidencia/2026-11-05-b10-verificado/`.

**Orden que hubo que respetar:** la migración se aplicó **antes** del deploy. Al revés, la home habría
quedado vacía: el código nuevo pregunta por una columna que todavía no existía.

### B11 — El tope de premios vivía en tres lugares · **bajo — ✅ resuelto**

La base limita los premios por plan en `enforce_raffle_rules` (`0059:33-52`): organizador 3, premium
30, superadmin 30. El wizard mostraba el número correcto, pero **hardcodeado dos veces** en el JSX y
sin guarda en el submit:

```tsx
max={planContext.isPremium || planContext.isSuperadmin ? 30 : 3}
Tu plan permite hasta {planContext.isPremium || planContext.isSuperadmin ? 30 : 3} premios.
```

No rompía el flujo: el `max` del input y el texto estaban bien. Pero la regla no estaba en la matriz de
planes, así que cambiar el tope obligaba a tocar JSX y base por separado, y el envío dependía del
`max` del navegador en vez de una validación explícita.

**Arreglo aplicado:** `PLAN_LIMITS.maxPrizesPerRaffle` (3 / 30) y `canUsePrizes()` en `lib/plans.ts`;
el wizard usa `prizesLimit` en el input, en el texto y en una guarda antes de enviar.
`lib/plans.test.ts` fija el contrato contra la migración (6 casos: límites, superadmin, techo absoluto
de 30, cero, negativos y decimales). Gates 236/236.

**Los otros dos pares que revisé no tienen bug:** números por sorteo (100 / 10.000, mínimo 10 en ambos
lados) y sorteos activos (2 / 20, mismo conteo y misma excepción de superadmin). El `Math.min(1000, …)`
del wizard que había marcado como sospechoso es el **valor por defecto** del campo, no un tope.

---

## 3. Fricciones de UX/UI

| # | Dónde | Qué pasa | Qué esperaría |
|---|---|---|---|
| F1 | `/login` y `/register` | Sólo Google y passkey (`LoginForm.tsx:45-49`). No hay email y contraseña | Un comprador sin cuenta de Google no puede participar |
| F2 | Sorteo público, al entrar | Modal de dirección completa **antes de elegir un número** (B4) | Elegir primero; pedir la dirección al confirmar, o sólo si hay premio físico |
| F3 | Panel del organizador | «Marcar como pagado» está `disabled` hasta tildar «Comprobante recibido»; el motivo vive en un `title` (`ReservedNumbersPanel.tsx:369-375`) | Texto visible al lado del botón. En móvil el `title` no existe |
| F4 | Grilla | Contador «Elegí en 0:05» que mide el tiempo para elegir, no la reserva (`NumbersGrid.tsx:21`) | Distinguir «elegís» de «reservado». La reserva real dura 48 h |
| F5 | Grilla | El vencimiento real de la reserva no se ve ahí; sólo en `/mis-numeros` | Ver el vencimiento donde reservaste |
| F6 | Grilla | Sin Realtime sobre `raffle_numbers` (`0042:88`): el número que tomó otro no se pinta sin recargar | Que se actualice sola |
| F7 | Verificador | Cuatro huellas en texto y ningún resultado hasta apretar «Comprobar» (B6) | Que corra solo, o que el botón sea el protagonista |
| F8 | Wizard, paso 3 | Se completa todo y el rechazo por KYC llega recién al apretar «Crear sorteo», sin decir qué falta (B5) | Saber antes de empezar qué datos faltan, con nombre |
| F9 | Wizard, paso 3 | Requiere portada, premios y KYC completo; no hay forma de dejarlo en borrador | Ver el sorteo completo antes de publicarlo |

---

## 4. Recomendaciones de mejora

**Prioridad 1 — dinero e integridad**

1. Cerrar **B1**: guard `drawn` en `organizer_mark_reserved_sold` + caso en los tests de invariantes.
2. Cerrar **B5**: que el gate de dirección escriba en `profiles` o que el trigger lea la misma tabla.
   Hoy el usuario ve «guardado» y el sistema le dice «falta».
3. Anclar el compromiso fuera de la base (correo a los compradores, `audit_logs` con fecha, o sello de
   tiempo). `guard_raffle_result` exime a `service_role` (`0067:43-45`): el commit-reveal ata al
   organizador, **no al operador de la plataforma**.

**Prioridad 2 — disponibilidad de números**

4. Arreglar **B2**: `*/5 * * * *`, o corregir el comentario si la decisión es diaria.
5. Fallar cerrado en **B3**: si falta `CRON_SECRET`, que lo diga al arrancar en vez de devolver 401
   cada noche.
6. Cuota de reservas por comprador (**B4**, veneno de inventario: 48 h × 20 reservas/h × 100 números).

**Prioridad 3 — conversión**

7. Mover el modal de dirección a después de elegir los números (**F2**). Es el cambio de mayor impacto
   en conversión de esta lista.
8. Ejecutar el verificador solo al cargar la página (**B6**) y mostrar el ganador calculado sin clic.
9. Publicar `raffle_numbers` en Realtime (**F6**) y automatizar el paso manual.
10. Temporizador de reserva visible en la grilla, con fecha de vencimiento (**F4, F5**).
11. Texto visible en «Marcar como pagado» en vez de un `title` (**F3**).
12. Agregar `is_listed`/`is_test` a `raffles` para poder tener sorteos internos sin exponerlos (**B10**).
13. Evaluar login sin Google (**F1**).

---

## 5. Evidencia

```
02-DOCS/wiki/ftd/evidencia/
├── 2026-11-05-A/       8 pasos ok · 10 capturas · hashes.json del sorteo real
├── 2026-11-05-B/       1 paso ok · 3 capturas (una por comprador)
├── 2026-11-05-C/       2 pasos ok
├── 2026-11-05-D/       3 pasos ok
├── 2026-11-05-hashes/  6 pasos ok · los 5 escenarios del dataset + multipremio
├── 2026-11-05-offline/ 4 pasos ok · verificación contra vectores canónicos
├── 2026-11-05-gates/   4 pasos ok · typecheck, lint, test, build
├── 2026-11-05-candados/ 6 pasos ok · los candados de entorno
└── 2026-11-05-preflight/ 5 pasos ok · el override que evita escribir en producción por error
```

Cada carpeta tiene `pasos.json` con `paso / rol / inicio / fin / esperado / observado / resultado /
evidencia`. Un paso sin artefacto queda `pendiente`, no `ok`.

Herramientas en `01-TOOLS/SIMULADOR/`: `runner.mjs` (escenarios), `verify-hash.mjs` (recálculo
independiente), `evidence.mjs` (contrato de evidencia), `env-guard.mjs` (candado), `preflight.mjs`,
`migrate.mjs`, `seed.mjs`, `session.mjs`, `mfa.mjs`.

### Intervenciones de laboratorio (declaradas)

| Qué | Por qué | Dónde |
|---|---|---|
| Cuentas creadas por Admin API en vez de Google | La app no tiene login por email | `seed-prod.mjs` |
| Perfil de Carla marcado `verification_status='approved'` | El trigger de KYC exige aprobación | `prod-perfil.mjs` |
| TOTP enrolado por API y código calculado con HMAC-SHA1 | El panel exige `aal2` | `mfa.mjs` |
| `reserved_until` forzado al pasado | No se esperan 48 h reales | `runner.mjs`, escenario C |
| Números 3 y 7 liberados a mano | Reinicio tras una corrida que crasheó a mitad | declarado en el log |
| Premio `Premio de prueba` insertado por API | El sorteo necesita un premio | `tmp-q.mjs`, borrado con el sorteo |

### Estado final de la base

Verificado después de la limpieza: **11 sorteos** (10 `active`, 1 `closed`), **0 sorteos de prueba**,
**0 usuarios `@gadu.test`**. Igual que antes de empezar.

---

## 6. Límites de esta corrida

- El sorteo sorteado se **borró** al terminar, como se acordó. Las huellas quedan en `hashes.json` y en
  las capturas, pero el registro ya no está en la base.
- Los tiempos de B (20,7 s para tres pestañas) incluyen tres navegadores en una máquina; no son una
  medición del servidor.
- No se probaron: 10.000 números en la web, multipremio real, cancelación con devolución, ni el cron
  programado (depende de Vercel).
- La prueba modificó filas de producción. Fue autorizado y se revirtió, pero deja rastro en los logs
  del proyecto.

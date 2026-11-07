# Barrido visual con el plugin de Playwright — 2026-11-07

Base: `http://localhost:3000` (dev server propio, `npm run dev`).
Herramienta: plugin de navegador del harness (`browser_navigate` / `browser_screenshot` / `browser_resize`).
Páginas pedidas: Home, Planes, Ganadores, un Sorteo.

**Sólo lectura.** No se reservó, no se autenticó, no se escribió en la base.

## Capturas archivadas

| Archivo | Página | Ancho |
|---|---|---|
| `home-1280.jpg` | `/` | 1280 |
| `planes-1280.jpg` | `/planes` | 1280 |
| `ganadores-1280.jpg` | `/ganadores` | 1280 |
| `sorteo-1280.jpg` | `/sorteos/df7c3431-babd-403b-988d-806373d2365a` | 1280 |
| `sorteo-375.jpg` | idem | 375 |

Medición reproducible: `01-TOOLS/SIMULADOR/medir-grilla.mjs`
(lee el DOM hidratado a 375 y 1280 y emite JSON; no escribe nada).

## Hallazgos confirmados

### 1. Mojibake en la calificación del organizador — `sorteo`

La página del sorteo muestra **`5.0 Ã‚· 2 reseñas`**. El separador `·` está
doble-codificado (UTF-8 leído como Latin-1 y vuelto a codificar).

- Observado en el árbol de accesibilidad: `"name": "5.0 Ã‚· 2 reseñas"`.
- Observado en la captura `sorteo-1280.jpg` y `sorteo-375.jpg`.
- Medido: `mojibake: true` en 375 y 1280.
- Enlace afectado: `/organizador/franco-maldonado#resenas`.

### 2. Datos de pago de prueba en una página pública — `sorteo`

El bloque "Datos para transferir cuando reserves" muestra **el mismo texto en
Alias, CBU y Banco**: `sorteo de prueba. no transferir`.

Un comprador real no puede transferir: no hay alias, no hay CBU, no hay banco.
Es dato semilla, pero se publica como si fuera el dato de cobro.

### 3. "Modo simulación de pagos activo" a la vista — `sorteo`

El estado interno de la app se renderiza como badge junto a "Elegí tus números".
Medido: `simulaciónVisible: true` en ambos anchos.

### 4. Sorteo activo sin premios — `sorteo`

Sección Premios: `Los premios se publicarán pronto.` en un sorteo que está
`Activo`, con precio y compromiso publicado.

### 5. Faltó un espacio — `sorteo`

`Tocá un número para elegirlo· los vendidos y reservados están bloqueados`
Medido: `puntoSinEspacio: true` en ambos anchos.

### 6. Sub-rutas por slug devuelven 404 — global

La ruta `[slug]` resuelve slugs, pero sus sub-rutas no:

| URL | Estado |
|---|---|
| `/sorteos/auto-2026-demo` | 200 |
| `/sorteos/auto-2-demo` | 200 |
| `/sorteos/df7c3431-…` (uuid) | 200 |
| `/sorteos/auto-2026-demo/verificar` | **404** |
| `/sorteos/auto-2-demo/verificar` | **404** |
| `/sorteos/sorteo-auto-demo/verificar` | **404** |
| `/sorteos/auto-2026-demo/en-vivo` | **404** |
| `/sorteos/a925dacd-…/verificar` (uuid) | 200 |
| `/sorteos/a925dacd-…/en-vivo` (uuid) | 200 |

Hoy la UI emite UUID en esos enlaces, así que el 404 es **latente**: aparece en
cuanto una pantalla arme el enlace con el slug (que es lo que usa el resto del
sitio, por ejemplo el enlace de referidos).

### 7. Planes: salto de encabezado H1 → H3 — `planes`

`Planes para organizadores` es H1. Los cinco planes (`Free`, `Starter`, `Pro`,
`Premium`, `Social / ONG`) son **H3**. El único H2 (`¿Preferís pagar por
comisión?`) aparece **después** de los H3. Un lector de pantalla recorre la
página fuera de orden.

### 8. Planes: precio con un decimal — `planes`

`Equivale a $ 1.545,4 por mes` (Free) convive con `$ 7.726,99`, `$ 23.180,96`,
`$ 54.088,91`. Formato inconsistente en la misma tarjeta comparativa.

### 9. Planes: los CTA de venta no llegan a WhatsApp — `planes`

El copy promete "la comisión se acuerda por WhatsApp" y cada plan ofrece
`Hablar con ventas`, pero:

- `Hablar con ventas` → `/ayuda`
- footer `WhatsApp de ventas` → `/planes`
- footer `WhatsApp de Gadu Sorteos` → `/planes`

Ningún CTA de venta abre `wa.me`. El único WhatsApp real está en la página del
sorteo (`https://wa.me/543547469000`).

El footer con `WhatsApp → /planes` se repite en Home, Ganadores y Sorteo.

### 10. Planes: quinto plan huérfano — `planes`

Cinco tarjetas en grilla de dos columnas: `Social / ONG` queda sola en la
tercera fila con el hueco derecho vacío.

## Descartado tras medir (no son bugs)

Tres cosas que parecían problemas en la captura y la medición desmintió:

- **"Denunciar este sorteo" no desborda.** `left: 16, right: 187, ventana: 375`.
- **La paginación no está mal.** A 375: `1–54 de 500`, `Página 1 de 10`
  (9×54=486, +14). A 1280: `1–180 de 500`, `Página 1 de 3` (2×180=360, +140).
  El tamaño de página es responsivo; el total (500) y los disponibles (479)
  son idénticos en ambos anchos.
- **La fecha no está duplicada por error.** El bloque muestra valor + cuenta
  regresiva (`Faltan 2d 00:54:13 · 9 nov 2026, 11:20 a. m.`).

## Sin observaciones — `home`, `ganadores`

Home y Muro de Ganadores se ven correctos a 1280: jerarquía clara, una sola H1,
tarjetas alineadas, sin desbordes ni texto roto. A 375 revisé sólo el detalle
del sorteo (ver más abajo), no estas dos.

Nota: no medí contraste de color con herramienta. La corrida paralela detectó
textos bajo contraste en Home; yo **no lo verifiqué** y no lo reporto como mío.

## Referidos: primer paso probado (sin escrituras)

Script: `01-TOOLS/SIMULADOR/medir-referido.mjs`. No autentica, no escribe:
`ReferralCapture` sólo guarda en `localStorage` y recién inserta en `referrals`
cuando hay sesión.

| Caso | URL | `localStorage.gadu_referral` | Errores consola |
|---|---|---|---|
| sin `ref` | `/sorteos/df7c3431-…` | `null` (sin claves) | 0 |
| con `ref` | `/sorteos/df7c3431-…?ref=1111…5555` | `11111111-2222-3333-4444-555555555555` | 0 |

Veredicto medido: `capturaOk: true`, `contaminaSinRef: false`.
La captura del código de referido funciona y no ensucia la sesión cuando el
parámetro no está.

## Bloqueo del E2E completo de referidos

Lo que falta del flujo es todo lo que **escribe**:

1. `referrals.insert` con el vínculo (require sesión autenticada).
2. `reserve_numbers_prepaid` del invitado.
3. `organizer_mark_reserved_sold` del organizador.
4. El número gratis del invitador (`origin: premio`).

Dos impedimentos, ambos verificados:

- **Login sólo con Google.** `components/LoginForm.tsx` no tiene email/contraseña.
  El HTML servido dice: «Iniciá sesión con tu cuenta de Google», «Continuar con
  Google», «Se crea automáticamente con Google». Google bloquea navegadores
  automatizados, así que la UI no sirve para entrar.
- **No hay entorno de prueba.** No existe `.env.test.local`. La app apunta a
  `mjgcoeikcyzwojbqtuah`, que es la base viva (documentado en
  `02-DOCS/wiki/ftd/crear-sorteo-rls.md`).

Existe el mecanismo para el punto 1: `01-TOOLS/SIMULADOR/session.mjs` crea el
usuario con `service_role`, hace `signInWithPassword` e inyecta la cookie
`sb-<ref>-auth-token` en Playwright. Pero usarlo implica crear usuarios, reservar
números e insertar referidos **en producción**. No se ejecutó.

Estado: **pendiente por decisión pendiente**, no por falta de herramienta.

## Hallazgo estático: dos caminos confirman el pago, sólo uno premia al referente

Leído en el código, **no observado en ejecución**. Vale como sospecha fuerte, no
como defecto probado.

El número gratis del referente lo otorga `reward_referral`, que es
`service_role` y no se llama desde ningún trigger. Tiene **dos** invocadores:

| Invocador | Camino | Estado |
|---|---|---|
| `app/api/webhooks/mercadopago/route.ts:370` | webhook de Mercado Pago | **muerto en esta operación**: MP está apagado y el pago es prepago manual |
| `app/admin/notificaciones/actions.ts:187` | `premiarReferidos()`, dentro de `aprobarReserva` | vivo |

Y `organizer_mark_reserved_sold` (la RPC que corre el botón «Marcar como Pagado»
del panel del sorteo, `ReservedNumbersPanel.tsx`) **no menciona referidos**: en
sus 200 líneas no hay ninguna referencia a `reward`, `referr` ni `origin`.

Conclusión a verificar: si el organizador confirma el pago desde el **panel del
sorteo**, los números pasan a `sold` pero el referente **nunca cobra**. El premio
sólo sale si confirma desde **`/admin/notificaciones`** (bandeja), que es otra
pantalla con otro botón.

Es el mismo agujero que describe la cabecera de `0102_referral_per_raffle.sql`
(«con prepago manual además nunca se disparaba… el cartel prometía algo que no
pasaba»): se arregló para la bandeja, no para el panel.

**Predicción falsable para el E2E:** confirmar por `/admin/notificaciones` deja
`referrals.rewarded = true` con `rewarded_number`; confirmar por el panel del
sorteo deja `rewarded = false` para siempre. Hay que correr las dos y comparar.

---

# Entorno de prueba creado (2026-11-07 11:00–11:10)

## Proyecto

| Ítem | Valor |
|---|---|
| Nombre | `gadu-simulador-test` |
| Ref | `dolxvoxyespguvixhkku` |
| Región | `us-east-1` |
| Estado | `ACTIVE_HEALTHY` |
| URL | `https://dolxvoxyespguvixhkku.supabase.co` |
| Conexión | `aws-0-us-east-1.pooler.supabase.com` (el host directo `db.<ref>` da ENOTFOUND: los proyectos nuevos no tienen IPv4 directa) |

Creado con `01-TOOLS/SIMULADOR/crear-entorno-test.mjs` (nuevo). Escribe
`.env.test.local` con `SIM_PORT=3001` y `NEXT_PUBLIC_URL=http://localhost:3001`
porque el 3000 está tomado por un `next dev` de otra sesión apuntando a producción.

## Migraciones

`node 01-TOOLS/SIMULADOR/migrate.mjs` → **118 de 118 `ok`**.
Ledger: `total: 89, última: 0117, salteadas: 0`.

## Cuentas

`node 01-TOOLS/SIMULADOR/seed.mjs` → 4 cuentas:

| Cuenta | Email | Rol |
|---|---|---|
| ana | `ana.ficticia@gadu.test` | user |
| bruno | `bruno.ficticio@gadu.test` | user |
| eva | `eva.ficticia@gadu.test` | user |
| carla | `carla.ficticia@gadu.test` | admin |

## Aislamiento verificado (dos direcciones)

Conteos en la base de prueba:

```
raffles          0
raffle_numbers   0
profiles         4      <- los del seed
referrals        0
prizes           0
```

App en `http://localhost:3001` contra esas variables: `GET /` → **200**, y el
HTML servido:

- NO contiene `sorteo auto` (el título que sólo existe en producción);
- NO contiene la ref de producción `mjgcoeikcyzwojbqtuah`.

O sea: la base de prueba está limpia y la app que corre en 3001 no ve un solo
dato de producción.

## Tres bugs de herramienta encontrados en el camino

### 1. Token con un carácter de más

`.env.secrets.local` tenía `SUPABASE_ACCESS_TOKEN_WRITE` de **45** caracteres.
Un PAT de Supabase mide 44 (`sbp_` + 40 hex). El carácter 41 era una `Z`
colgada, casi seguro basura de pegado. Con la `Z`: `401 {"message":"JWT could
not be decoded"}`. Sin ella: `200` y `/v1/organizations` devuelve la org.

No toqué el archivo: corrí el script con el token corregido en la variable de
proceso. **Conviene que borres esa `Z` del archivo**, o el próximo que lo use
va a chocar con el mismo 401.

### 2 y 3. `0073` hardcodeado en dos scripts

`migrate.mjs:117` y `preflight.mjs:78` comparaban la última versión del ledger
contra la constante `"0073"`. El repo ya va por **0117**, así que:

- `migrate.mjs` aplicaba las 118 migraciones, imprimía 118 `ok` y después
  terminaba con `FALLA: el ledger no llegó a 0073 (última: 0117)` y exit 1;
- `preflight.mjs` bloqueaba el arranque con `FALLA migraciones — 89
  migraciones, última 0117`.

Ambos se declaraban en falla sobre una base perfectamente migrada. Arreglado en
los dos: la versión esperada ahora se calcula leyendo `supabase/migrations` y
comparando numéricamente. `preflight` pasó de `4/5` a `5/5`.

## Estado del E2E de referidos

**No corrido todavía.** Falta el escenario E. Lo que sí está listo: entorno,
cuentas, servidor que habla con la base de prueba y el mecanismo de sesión
inyectada (`session.mjs`).

---

# Colisión con otra sesión: E2E de referidos ya existía y corrió contra producción

Mientras armaba el escenario E encontré que `01-TOOLS/SIMULADOR/e2e-referidos.mjs`
ya existía (29.734 bytes, 11:03), escrito por otra sesión. **No lo toqué.**

Ese script no tiene `env-guard` y está fijado a producción:

```js
const BASE = "http://localhost:3000";          // el dev server de producción
const REF_PROYECTO = "mjgcoeikcyzwojbqtuah";   // ref de producción
const env = leerEnv(".env.local");             // credenciales de producción
```

Y **se ejecutó** a las 11:03. Su `estado.json` y su informe
(`02-DOCS/wiki/ftd/e2e-referidos.md`) registran que creó en la base viva:

- 2 cuentas (`e2e.organizador@gadu.test`, `e2e.invitado@gadu.test`);
- 2 sorteos deslistados (`b34847fe…` y `7a17e4db…`, slug `e2e-referidos-principal-bbe0`);
- 2 números vendidos.

Está declarado como intervención de laboratorio, pero ocurrió en paralelo, sin
que yo lo autorizara ni lo ejecutara.

## Contribución del entorno aislado: H1 no se reproduce

El informe de esa sesión marca como **crítico (H1)** que la tabla `referrals` no
tiene grants ni políticas, que el POST de `ReferralCapture` devuelve 403 y que
por eso «ningún usuario real puede generar un vínculo de referido».

Medido en el proyecto de prueba recién migrado con los mismos 118 archivos:

```
== privilegios sobre public.referrals (base de PRUEBA) ==
  anon            select=true insert=true update=true
  authenticated   select=true insert=true update=true
  service_role    select=true insert=true update=true

== políticas RLS ==
  referrals_insert_referred [INSERT]
  referrals_select_own      [SELECT] ((auth.uid() = referrer_id) OR (auth.uid() = referred_id))

== row_security = true ==
```

O sea: **partiendo de las migraciones del repo, `authenticated` sí puede
insertar y las dos políticas existen**. H1 no es un bug del repositorio.

Reformulación correcta: **producción está desincronizada del repo.** La 0102 ya
lo sospechaba por escrito («la tabla `referrals` real no coincide con la 0007
del repo»). El 403 de producción es un desvío de esa base, no del código.

Consecuencia para el arreglo: antes de escribir una migración nueva hay que
**diffear el esquema real de producción contra una migración limpia**. Este
proyecto de prueba es exactamente la referencia para ese diff. Aplicar el
`GRANT` propuesto a ciegas arreglaría el síntoma sin saber qué más falta.

Dato extra del mismo chequeo, más laxo de lo que se creía: en la base limpia
`anon` y `authenticated` tienen **todos** los privilegios de tabla
(`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`). RLS con las
políticas de arriba impide el abuso de filas, pero la 0041 («rls_close») no los
dejó cerrados como su nombre sugiere.

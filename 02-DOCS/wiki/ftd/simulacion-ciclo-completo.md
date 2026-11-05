---
author: Gadu
branch: main
status: in-progress
---
# Simulación de ciclo completo con usuarios sintéticos

## Intent

Recorrer el ciclo entero de un sorteo —reserva → transferencia → comprobante → confirmación →
sorteo → verificación → entrega— actuando como cuatro roles distintos, en un entorno aislado y con
evidencia auditable, para saber qué funciona y dónde se traba.

Hoy la base configurada tiene 11 sorteos y **ninguno sorteado**: el compromiso, la semilla y las
huellas nunca se observaron de punta a punta en producción. La verificación es el corazón de la
propuesta y todavía no tiene una prueba de ciclo completo.

## Entorno decidido (2026-11-04)

Proyecto Supabase de prueba, separado de la base viva. Razón: `.env.local` apunta al proyecto real
(`mjgc…`), no hay entorno de prueba en el repo y no hay Docker para levantar Supabase local. Cualquier
compra u organizador simulado contra esa base escribe filas reales.

**Bloqueado hasta tener las credenciales del proyecto de prueba**: URL, anon key, service_role y una
forma de aplicar las migraciones `0001`–`0073`. Hasta entonces, nada de este documento toca la base
viva.

## Scope

**In:**

- Agente `Simulador Gadu` (preset de DSH `gadu-sim`) + skill `gadu-simulador` con personas, task
  cards, escenarios y contrato de evidencia.
- `sim/dataset.ts`: personas, escenarios y semilla fija, con datos ficticios reutilizables.
- `lib/draw-verify.simulacion.test.ts`: verificador externo independiente (`node:crypto`) que
  recalcula lo publicado y lo compara con `lib/draw-verify.ts`, en los escenarios chico, grande, un
  participante, multipremio, listado manipulado y semilla cambiada.
- Runner del ciclo completo sobre el proyecto de prueba (Playwright como devDependency): comprador
  individual, comprador múltiple, organizador y verificador.
- Evidencia por paso: JSON con esperado/observado, capturas de pantalla, logs de red y hashes.
- Informe de fricciones y dataset reutilizable para la próxima iteración.

**Out:**

- No escribe en `raffles`, `raffle_numbers` ni `payments` de producción.
- No cambia la lógica de dinero, el motor de sorteo ni la fórmula de hash.
- No instala plugins DSH sin aprobación explícita (cambian el perfil de todas las sesiones).
- No simula una transferencia real: Mercado Pago está apagado, el "pago" es el comprobante que el
  organizador confirma a mano.

## Personas

| Persona | Rol | Objetivo en la simulación | Dónde suele trabarse |
|---|---|---|---|
| Ana, compradora individual | comprador | Reservar 2 números y mandar el comprobante | ¿entiende que debe pagar por transferencia y avisar por WhatsApp? |
| Bruno, comprador múltiple | comprador | Reservar 8 números y comprobar que no se liberan | reserva parcial, números que se ocupan mientras elige, vencimiento del hold |
| Carla, organizadora | organizador | Crear sorteo, cobrar y sortear | publicar el compromiso, marcar pagos, encontrar el botón de sortear |
| Diego, verificador externo | verificador | Recalcular el hash con la semilla pública | que el verificador se entienda y que una manipulación se delate |

Datos: nombres y teléfonos ficticios (`+54911555501xx`), correos `@gadu.test`. Nada de PII real.

## Matriz de escenarios

| Escenario | Qué prueba | Cómo se evidencia |
|---|---|---|
| Chico (10 números) | flujo feliz completo | hashes + captura del verificador con todos los checks |
| Grande (10.000 números) | la grilla virtualizada y el mismo motor | mismo resultado, sin degradar el verificador |
| Un solo participante | el ganador se elige aunque no haya competencia | el único número vendido es el ganador |
| Multipremio (50 premios) | premios sin repetir y `results_hash` | verificador multi-premio por puesto |
| Concurrente (2 compradores) | reserva atómica del mismo número | uno gana la reserva, el otro recibe el número ocupado |
| Manipulado | cambiar el resultado se delata | huellas o ganador no coinciden; el check falla |
| Cancelado o reprogramado | cómo se refleja en la web | estado público y números liberados/devueltos |

## Contrato de evidencia

Cada paso produce una fila:

```json
{
  "paso": "reserva",
  "rol": "comprador",
  "inicio": "2026-11-05T12:00:00-03:00",
  "fin": "2026-11-05T12:00:07-03:00",
  "esperado": "2 números reserved, total $X",
  "observado": "2 números reserved, total $X",
  "resultado": "ok",
  "evidencia": ["capturas/02-reserva.png", "red/02-checkout.har", "hashes.json"]
}
```

Los hashes van en el JSON, no solo en una captura. Un paso sin evidencia queda `pendiente`.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Dataset de personas y escenarios | `sim/dataset.ts` con datos ficticios y semilla fija |
| 2 | Verificador externo independiente | Recalcula con `node:crypto` y coincide con `lib/draw-verify.ts` |
| 3 | Escenarios 10 / 10.000 / un participante | `npm test` verde |
| 4 | Manipulación y semilla cambiada detectadas | El test falla si la comparación se relaja |
| 5 | Multipremio sin repetidos | 50 premios sobre 100 números, ganadores únicos |
| 6 | Proyecto de prueba migrado | `_applied_migrations` hasta `0073` |
| 7 | Ciclo comprador individual | captura + fila `sold` en el proyecto de prueba |
| 8 | Comprador múltiple y concurrencia | reserva parcial reportada + número ocupado por el otro |
| 9 | Organizador confirma pagos y sortea | sorteo `drawn` con compromiso y semilla revelada |
| 10 | Verificador en el navegador | captura con los checks en verde |
| 11 | Entrega del premio registrada | fila de evidencia con ganador notificado |
| 12 | Gates del repo | typecheck, lint, test y build limpios |
| 13 | Agente creado y verificado | preset `gadu-sim` instalado + sesión de prueba que responde con su persona |

## Evidence

**0 — observado en la base configurada (solo lectura, 2026-11-04).** 11 sorteos: 10 `active`, 1
`closed`, 0 `drawn`. Cero `draw_commitment`, cero `draw_seed`, cero `numbers_hash`. Ningún sorteo
destacado. Hay sorteos `active` con `draw_date` ya pasada y sin sortear.

**0 — plugins.** `software-design-test`, `dsh-user-experience`, `dsh-browser-harness` y `agent-qa`
existen en npm; `dsh-browser-agent` solo como `@logictan/dsh-browser-agent`; `dsh-social-simulation`
no existe. Ninguno está instalado. `dsh-browser-harness` y `dsh-user-experience` declaran
`dsh >=0.1.0-rc.6 <0.2.0` y este harness es `0.2.1-rc.5`: instalar exige exención de versión.

**1 — observado.** `sim/dataset.ts`: 4 personas ficticias (`@gadu.test`, teléfonos `+54911555501xx`),
5 escenarios y semilla fija de 64 hex. El id de sorteo es fijo para que los hashes se puedan
reproducir a mano.

**2–5 — observado.** `lib/draw-verify.simulacion.test.ts` implementa el verificador externo con
`node:crypto` sin importar `lib/draw-verify.ts`, y compara los dos caminos.

- `npx vitest run lib/draw-verify.simulacion.test.ts` → **12/12** en 53 ms.
- `npm test` → **198/198 en 17 archivos** (antes 186 en 16).
- `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or errors`.
- `npm run build` → exit 0, 28 rutas compiladas (con `NODE_OPTIONS=--max-old-space-size=4096`).

Muestra calculada con el dataset fijo (sorteo `1111…`, semilla `0123…` repetida 4 veces):

| Escenario | `numbersHash` | Ganador | `resultHash` |
|---|---|---|---|
| 10 números | `56e07db75d445f043d6b0ee9bbb565c1d9d991a9be67712f949a89d018943648` | 2 | `7fa665bb29421e8ff1315f5d837288560c89f471c1fa484f00363263f0a0d72d` |
| 10.000 números | `3654f20aecf715870c8744faf3943e0419e4b3df4550980c278b112e17f9ce16` | 7691 | `2c677f22dd3e2f9aa5724d2fa01ac56c00b2233a440f0e84cca69bf9ec8c5dbb` |

El compromiso es el mismo en los dos casos (`7ccb8442…`) porque depende solo del sorteo y la semilla:
por eso una manipulación del listado la delatan las huellas y el ganador, no el compromiso.

- Manipulación: cambiar el número en el índice 3 cambia `numbersHash` y `resultHash`; un ganador
  inventado no reproduce la huella; una semilla distinta cambia el compromiso.
- Multipremio: 50 premios sobre 100 números, ganadores únicos, posiciones 1–50 y coincidencia exacta
  con el verificador externo. Determinista entre corridas.
- Un participante: el único número vendido (7) es el ganador, índice 0.
- Cualquier semilla: el ganador siempre pertenece al listado vendido (60 combinaciones probadas).

**Límite observado.** Esto verifica la fórmula en Node. Falta el mismo check dentro del navegador
(`DrawVerifier`) y el ciclo real de reserva y confirmación.

**13 — observado.** Preset `gadu-sim` («Simulador Gadu») instalado como bundle
`@local/dsh-gadu-sim-preset`; `cordis_inspect_query` lo lista como `include:preset-gadu-sim`. Skill
`gadu-simulador` publicada en `.dsh/skills/gadu-simulador/` (con `references/personas.md`,
`escenarios.md` y `evidencia.md`). Sesión de prueba abierta con ese preset
(`sb-e277e5b6-4f27-426d-abed-307da7a68e59`): respondió con su identidad, dijo que puede cargar la
skill y pidió `.env.test.local`, la web local y el escenario antes de arrancar.

**6–11 — bloqueado**: faltan las credenciales del proyecto de prueba.

## Corrida 2026-11-05 (offline)

Informe completo en [`informe-simulacion-2026-11-05.md`](informe-simulacion-2026-11-05.md).
Evidencia en `evidencia/2026-11-05-offline/`.

**Observado.** Escenario D cerrado en su capa criptográfica: 4/4 pasos `ok` con artefactos en disco.
`01-TOOLS/SIMULADOR/verify-hash.mjs` reimplementa la fórmula con `node:crypto` **sin importar**
`lib/draw-verify.ts` y reproduce los 4 vectores canónicos del repo. Manipular el listado rompe
`numbersHash` y `resultHash`; cambiar la semilla rompe el compromiso y deja `numbersHash` intacto.
Suite del repo: 20/20. Playwright 1.64.1 + Chromium 156 instalados con smoke test pasado.

**Escenario D ampliado (2026-11-05).** `evidencia/2026-11-05-hashes/`: 6/6 pasos `ok`. Mi
implementación independiente reproduce los valores publicados para **10.000 números**
(`numbersHash 3654f20a…`, ganador 7691, `resultHash 2c677f22…`) y el vector multipremio del repo
(ganadores 2, 9, 7; `resultsHash a48cf567…`). El sorteo de un solo participante da ese número.
El multipremio de 50 sobre 100 da 50 ganadores distintos en posiciones 1–50.

**Dato de rendimiento.** Recalcular 10.000 números tarda **4 ms**; 50 premios, 1,9 ms. La fórmula no
es el cuello de botella del verificador en sorteos grandes: lo es traer el listado y pintarlo.

**Escenarios A, B y C en esa corrida: `pendiente`.** Sin base de prueba no se ejecutaron. Se corrieron
después, contra la web real y por autorización del dueño — ver «Corrida 2026-11-05 — completa» abajo.

**Hallazgos nuevos, verificados leyendo el código:**

- `organizer_mark_reserved_sold` (`0029:169-179`) no tiene el guard `drawn` que sí tienen
  `sell_numbers` y `organizer_mark_sold` (`0071:141-144`). El camino de venta que se usa hoy permite
  confirmar un pago después del sorteo y romper `numbers_hash`.
- `vercel.json:5` programa el cron a `0 0 * * *`; el comentario de `route.ts:8` dice «cada 5 minutos».
  Con `CRON_SECRET` vacío el endpoint devuelve 401 siempre (`route.ts:15-19`) y los holds vencidos de
  otros compradores nunca se liberan.
- `guard_raffle_result` exime a todo lo que no sea `authenticated`/`anon` (`0067:43-45`): el
  commit-reveal ata al organizador, no al operador de la base.
- La app sólo autentica con Google o passkey (`components/LoginForm.tsx`). Las personas sintéticas
  necesitan inyección de sesión, declarada como intervención de laboratorio.

**Preparado.** `migrate.mjs` (aplica `0001`–`0073` con `pg`, sin Docker) probado en `--dry-run`;
`env-guard.mjs` probado contra 4 formas de apuntar a producción (`evidencia/2026-11-05-candados/`).
Sin probar contra base real: `session.mjs` (cookie `sb-<ref>-auth-token`), `seed.mjs` (cuentas + rol
`admin` para Carla) y `runner.mjs` (escenarios A–D con capturas y tiempos).

**Dos defectos propios corregidos antes de confiar en las herramientas.** El guard de `env-guard.mjs`
no se ejecutaba como CLI (exit 0 sin chequear), y el chequeo de producción de `migrate.mjs` sólo
miraba el host directo, dejando pasar una URI de pooler de producción. Ambos tienen caso de prueba.

**12 — observado (gates del repo).** Evidencia en `evidencia/2026-11-05-gates/`:

| Gate | Resultado |
|---|---|
| `npm run typecheck` | exit 0, sin errores |
| `npm run lint` | `✔ No ESLint warnings or errors` |
| `npm test` | **198/198** en 17 archivos |
| `npm run build` | exit 0, compila y lista rutas |

El build necesita `NODE_OPTIONS=--max-old-space-size=8192`: con el valor por defecto el worker de Next
aborta con exit 134 (agotamiento de heap), no con un error de código. Vale anotarlo porque el síntoma
parece un build roto y es memoria.

**Hallazgo operativo que bloqueaba el plan (2026-11-05).** `next dev` **no lee `.env.test.local`**:
su orden es `.env.development.local` → `.env.local` → `.env.development` → `.env`
(verificado en `node_modules/@next/env/dist/index.js`). Como `.env.local` apunta a producción, crear
el archivo de prueba y correr `npm run dev` habría escrito en la base viva creyendo que no. Las
variables de `process.env` sí ganan sobre los archivos, así que la corrida segura exporta primero.

Mitigado con `preflight.mjs` (verifica el override y lee el HTML servido para comprobar con qué ref
habla el server) y `correr-live.mjs` (exporta y arranca). Cinco casos probados en
`evidencia/2026-11-05-preflight/`, incluido el peligroso: entorno de prueba en el archivo pero sin
exportar al proceso → **bloquea**.

## Corrida 2026-11-05 — completa, contra la web real

Informe en [`informe-simulacion-2026-11-05.md`](informe-simulacion-2026-11-05.md).
Evidencia en `evidencia/2026-11-05-{A,B,C,D}/`.

**Los cuatro escenarios corrieron. 14 de 14 pasos `ok`.**

| Escenario | Resultado |
|---|---|
| A — happy path | ✅ reserva (525 ms) → `sold` → `drawn` (ganador 7, Ana) → verificación independiente 4/4 |
| B — concurrencia | ✅ 3 compradores por el número 5: 1 ganó, 2 recibieron «Estos números ya no están disponibles: 5» |
| C — abandono | ✅ hold de 48 h; forzando el vencimiento y llamando a `release_expired_reservations` el número volvió a `available` |
| D — integridad | ✅ 4/4 limpio; manipular el listado rompe `numbersHash` y cambia el ganador; otra semilla rompe el compromiso; el verificador del navegador muestra **✓ Verificado** |

**Entorno.** Se escribió en producción (`mjgcoeikcyzwojbqtuah`) por autorización explícita del dueño,
ante la ausencia de un entorno aislado. Dos sorteos marcados «PRUEBA INTERNA — NO PARTICIPAR», creados
por la UI como Carla y **borrados al terminar**. Estado verificado antes y después: 11 sorteos
(10 `active`, 1 `closed`), 0 usuarios `@gadu.test`.

**Hallazgos nuevos, vistos en vivo:**

- **B4** El comprador queda bloqueado por un modal que exige dirección completa **antes de elegir un
  número**. Es la fricción de mayor impacto en conversión.
- **B5** El modal guarda la dirección en un lugar y el trigger `enforce_organizer_kyc` la valida en
  `profiles`: el organizador ve «guardado» y después «KYC incompleto». Dos fuentes de verdad.
- **B6** El «Verificador automático» no corre hasta que el usuario aprieta «Comprobar».
- **B8** `raffle_visits` falla con 403 por RLS en cada visita: la analítica no registra.
- **B9** Al perdedor de la carrera le queda el número tomado pintado como selección, con total `$ 0`.
- **B10** No hay forma de ocultar un sorteo: `is_listed` no existe y la política es `using (true)`.
- El panel `/admin` exige **aal2**: sin TOTP enrolado, el organizador no entra (`admin/layout.tsx:36-49`).

**Gates del repo.** `typecheck` exit 0 · `lint` limpio · `test` **198/198** · `build` exit 0 (con
`NODE_OPTIONS=--max-old-space-size=8192`; con el default aborta por heap con exit 134).

**Hallazgo operativo.** `next dev` no lee `.env.test.local`: su orden es `.env.development.local` →
`.env.local` → `.env.development` → `.env`. Como `.env.local` apunta a producción, la corrida segura
exporta las variables en el proceso (`preflight.mjs` + `correr-live.mjs`).

## Next

1. ~~Cerrar **B1**~~ — **hecho y aplicado**. `0074_no_prepaid_sales_after_draw.sql` + caso en
   `lib/security-invariants.test.ts`; gates 213/213. Verificado en la base por comportamiento: la RPC
   devuelve «El sorteo ya fue sorteado: no se pueden confirmar pagos de reservas», mensaje que el
   cuerpo viejo de 0029 no tiene (`evidencia/2026-11-05-fix-b1/verificacion-0074.txt`).
2. ~~Cerrar **B5**~~ — **hecho, con corrección de diagnóstico**. No eran «dos fuentes de verdad»: el
   modal ya escribía en `profiles`. El wizard pedía 4 datos y el trigger 9, así que el organizador
   completaba todo y la base le rechazaba el alta al final. La regla quedó en `lib/kyc.ts`, compartida por
   el wizard y el KYC, con contrato en `lib/kyc.test.ts`. Gates 218/218
   (`evidencia/2026-11-05-fix-b5/`).
3. ~~Mover el modal de dirección a después de elegir los números (**B4**)~~ — **hecho, desplegado y
   verificado en la web** (commit `5d31eb4`). El gate global sólo bloquea `/admin/*`; la dirección se
   pide en `NumbersGrid` al reservar, con formulario compartido (`DeliveryAddressForm`) y regla única en
   `lib/direccion.ts`. Verificado con una cuenta sin dirección: la grilla abre sin modal, el diálogo
   aparece al reservar y no se escribió nada (`evidencia/2026-11-05-b4-verificado/`, 6/6 ok).
4. ~~Corregir el `schedule` del cron (**B2**) y fallar cerrado sin `CRON_SECRET` (**B3**)~~ — **hecho,
   pero no como estaba planeado.** El `*/5` habría roto el deploy: Vercel Hobby sólo permite cron
   diario (`auto-draw/route.ts:11-12`). Se resolvió con un fallback perezoso
   (`lib/release-expired.ts`, gate de 60 s) más `lib/cron-auth.ts`, que responde 500 —no 401— cuando
   falta la variable. README corregido para no documentar un cron que no existe. Gates 230/230
   (`evidencia/2026-11-05-fix-b2-b3/`). **Pendiente humano:** cargar `CRON_SECRET` en Vercel.
5. ~~Auditar los pares de límites cliente/base~~ — **hecho**. Números y sorteos activos coinciden;
   el tope de premios vivía en tres lugares y se unificó en `lib/plans.ts`
   (`maxPrizesPerRaffle` + `canUsePrizes`, contrato en `lib/plans.test.ts`). Gates 236/236
   (`evidencia/2026-11-05-plan-limites/`).
6. Quedan de menor riesgo: **B4** (modal antes de comprar), **B6** (verificador «automático» que
   necesita un clic), **B8** (`raffle_visits` con 403, la analítica no registra), **B9** (selección
   muerta en la grilla) y **B10** (`is_listed` para sorteos internos).
7. Darle al equipo un entorno de prueba real: es la razón por la que esta corrida terminó escribiendo
   en producción.

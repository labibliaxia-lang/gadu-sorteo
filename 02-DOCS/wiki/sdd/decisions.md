# SDD decisions

Append-only. Every significant decision gets a date, the options considered, and the why.

## 2026-11-02 â€” Constitution v1.0.0 ratified

- **Context.** `rsc onboard` wrote a draft constitution holding only onboarding facts. The first SDD
  feature needs ratified guardrails.
- **Options considered.**
  1. Full SDD ceremony: specify â†’ clarify â†’ plan before writing principles. Rejected â€” the
     constitution is the guardrail the chain runs on, not a product of it.
  2. Ratify the detected stack as-is with no security floor. Rejected â€” payments and RLS are the
     risk surface of this project.
  3. Infer the principles from the code, ask only what genuinely changes one, then ratify.
     **Chosen.**
- **Decisions taken in the interview.**
  - Merge bar = `npm run typecheck` + `npm run build` + observed proof on money paths. No test
    runner and no ESLint config exist, so `test`/`lint` are not gates (principle 8).
  - Accessibility = WCAG 2.1 AA checked by hand; no automated axe run until an e2e harness exists
    (principle 21).
  - Secrets = fail closed, no default fallback; the hardcoded hash at `middleware.ts:11` becomes
    named debt (principle 19).
- **Why.** A principle the repo cannot check is decoration; a principle that permits the current
  defects is worse. The violations are recorded in the file's debt table with their owning phase.
- **Consequences.** Two known security defects are now constitutional debt against principles 16 and
  19, to be closed by `ftd` before the first real sale.

## 2026-11-02 â€” Fail closed on missing credentials (FTD)

- **Context.** Constitution v1.0.0 named two defects: checkout mock auto-approval in any environment,
  and a repository-resident admin hash usable in production.
- **Options considered.**
  1. Remove every fallback, development included. Rejected â€” `.env.local` has no
     `ADMIN_ACCESS_CODE_HASH`, so the owner would be locked out of their own panel while developing.
  2. Keep a development fallback but gate it on `NODE_ENV`, and fail closed in production with a
     diagnosable error. **Chosen**, because it is what the ratified principle says: *outside
     development the app fails closed*.
  3. Make the checkout mock route a separate dev-only module. Rejected â€” larger diff for the same
     guarantee at this size.
- **Why.** The credential is a deployment fact, not a code fact. When it is missing in production the
  correct behaviour is to refuse the sale, not to invent one.
- **Consequences.** Production deploys now need `ADMIN_ACCESS_CODE_HASH` set, or `/admin` shows
  Â«El cÃ³digo maestro no estÃ¡ configurado en el servidorÂ». A production deploy also needs
  `MP_ACCESS_TOKEN`, or checkout answers `503`. Both are documented in the README.
- **Evidence and open checks.** `02-DOCS/wiki/ftd/fail-closed-payments-and-admin.md`.

## 2026-11-02 â€” Webhook signature follows MP's manifest (FTD)

- **Context.** Principle 18 carried a "to verify": MP signs the manifest
  `id:[data.id];request-id:[x-request-id];ts:[ts];`, while `verifyWebhookSignature` hashed
  `${ts}.${rawBody}`. Two independent sources agreed on the manifest: MP's documentation and the
  installed SDK's own validator (`mercadopago` 2.13.0).
- **Options considered.**
  1. Implement the manifest by hand in `lib/mercadopago.ts`. Rejected â€” it re-implements what the
     vendor ships and would drift the next time they change it.
  2. Delegate to `WebhookSignatureValidator` from the installed SDK and raise the declared range to
     `^2.13.0` so no install can resolve to a version without it. **Chosen.**
  3. Add a `toleranceSeconds` window. Rejected for now: MP retries the same notification every 15
     minutes with the same `ts`, so a short window would reject legitimate retries and reintroduce
     the failure; `payments` idempotency already blocks double selling.
- **Why.** A signature check that rejects authentic traffic is not "safe": it silently breaks the
  money path, because `sell_numbers` never runs and the cron frees the paid buyer's numbers.
- **Consequences.** Production requires a correct `MP_WEBHOOK_SECRET`; a wrong or missing one answers
  `401` with the reason in the log. The replay window stays open by decision, not by oversight.
- **Evidence.** `02-DOCS/wiki/ftd/mercadopago-webhook-signature.md` â€” both directions observed
  against the real module and against the running route.

## 2026-11-02 â€” ESLint and Vitest become real gates (FTD)

- **Context.** Principle 6 named a quality bar, but `npm run lint` had no config and no dependency, and
  there was no test runner. The bar was declared and unverifiable â€” exactly what the harness's own
  "a gate that checks nothing is worse than no gate" warns about.
- **Options considered.**
  1. Leave the bar as typecheck + build and stop claiming lint/tests. Rejected â€” the money logic is
     the risk surface and it was reachable without touching a route.
  2. Add ESLint only. Rejected â€” lint catches style and hooks, not a rounding bug.
  3. Add ESLint `next/core-web-vitals` **and** Vitest, extracting the money arithmetic and the MP
     status mapping into `lib/payments.ts` so they can be tested without Supabase. **Chosen.**
   4. Add coverage thresholds now. Rejected as premature: without route-level tests a percentage
     measures the easy files only.
- **Why.** A test that needs a database to run does not run. The arithmetic and the status mapping are
  the parts that silently lose money, and they are pure.
- **Consequences.** `npm run lint` and `npm test` are part of done (constitution v1.1.0). New money
  logic must ship with its unit test. Still open: no coverage floor, no route-level tests.
- **Evidence.** `02-DOCS/wiki/ftd/quality-gates-eslint-vitest.md`.

## 2026-11-02 â€” Superadmin degradable y KYC borrado en orden (FTD)

- **Context.** AuditorÃ­a del panel `126fe20`: `deleteUsers` borraba los archivos KYC antes de borrar la
  cuenta, y `superadmin` no se podÃ­a degradar desde el panel en ningÃºn camino.
- **Options considered.**
  1. Dejar la degradaciÃ³n como operaciÃ³n manual por SQL. Rejected â€” el dÃ­a que alguien se va o una
     cuenta se compromete, la respuesta no puede ser "abrÃ­ el SQL Editor".
  2. Permitir degradar sin guarda. Rejected â€” el sistema puede quedarse sin ningÃºn superadmin y
     nadie podrÃ­a volver a entrar al panel.
  3. Degradar con doble control (conteo previo + reversiÃ³n posterior) y regla pura testeada.
     **Chosen.**
  4. AÃ±adir una funciÃ³n SQL `demote_superadmin` con `for update` para cerrar la carrera por completo.
     Rejected *for now*: exige una migraciÃ³n nueva que hay que aplicar antes de que el panel funcione;
     la doble comprobaciÃ³n cubre el caso real (un solo operador) y queda anotada como el siguiente
     paso si el equipo crece.
- **Why.** Un privilegio que no se puede revocar es un problema de seguridad; dos operaciones cuyo
  orden decide si se pierde evidencia es un problema de datos. Ninguno de los dos se arregla con
  documentaciÃ³n.
- **Consequences.** El panel puede degradar a un superadmin (nunca a sÃ­ mismo, nunca al Ãºltimo) y la
  fila de superadmin ya no es un callejÃ³n sin salida. El borrado de un usuario elimina primero la
  cuenta y despuÃ©s sus archivos KYC, con `kycPurged` en la auditorÃ­a.
- **Evidence.** `02-DOCS/wiki/ftd/superadmin-demote-and-kyc-purge-order.md`: regla pura con tests,
  orden de llamadas verificado por lectura, y los cuatro gates en verde. La ejecuciÃ³n real contra
  Supabase queda pendiente y estÃ¡ declarada como no observada.

## 2026-11-02 â€” El trigger de profiles no mira el rol de conexiÃ³n (FTD)

- **Context.** Hallazgo #2 de la auditorÃ­a: la versiÃ³n sin commitear de `0025` eximÃ­a por nombre de rol
  (`current_user not in ('anon','authenticated','service_role')`). Con PostgREST funciona, pero si el
  proyecto conecta con otro rol la protecciÃ³n del paywall y del KYC desaparece sin ningÃºn error.
  AdemÃ¡s, git y el working tree tenÃ­an versiones distintas del mismo archivo.
- **Options considered.**
  1. Volver a `SECURITY DEFINER` con `auth.uid()` (lo que estaba commiteado). Rejected â€” un trigger
     `SECURITY DEFINER` corre con privilegios del dueÃ±o y es superficie de escalada que aquÃ­ no compra
     nada.
  2. Mantener la exenciÃ³n por `current_user` y aÃ±adir sÃ³lo el script de prueba. Rejected â€” deja el modo
     de fallo silencioso; el test lo detectarÃ­a el dÃ­a que se corra, no antes.
  3. Quitar la exenciÃ³n por rol y decidir por `auth.uid() is null`, conservando `SECURITY INVOKER`.
     **Chosen**: la protecciÃ³n depende de si hay un usuario final, no del nombre del rol.
- **Why.** Un control que deja de controlar sin avisar es peor que no tenerlo. El camino del canje de
  licencias sigue exento por la vÃ­a correcta: `0022` limpia los claims antes de escribir.
- **Consequences.** El comportamiento ya no depende de cÃ³mo se conecte el cliente. Se aÃ±ade
  `supabase/tests/0025_profiles_hardening.sql` (7 casos, termina en `ROLLBACK`) para probarlo en el SQL
  Editor. **No se ejecutÃ³**: no hay Postgres local y no se corren pruebas contra la base remota sin
  permiso explÃ­cito.
- **Evidence.** `02-DOCS/wiki/ftd/profiles-trigger-role-independent.md`.

### Resultado observado (mismo dÃ­a)

El script de prueba devolviÃ³ cuatro `FALLO` â€”el usuario sÃ­ podÃ­a cambiarse el plan, aprobarse el KYC y
aprobarse la solicitudâ€” y el diagnÃ³stico mostrÃ³ por quÃ©: **la funciÃ³n existÃ­a y el trigger no estaba
enganchado**. `0025` se habÃ­a aplicado a medias, y sin ledger de migraciones nada lo delataba.

- Se aplicÃ³ `0025` completo y `pg_trigger` muestra ahora los dos triggers sobre `public.profiles`.
- Tras aplicarlo: `A OK -> No tenÃ©s permisos para cambiar tu plan` (con rol privilegiado y claims de
  usuario), `B OK` (cambio legÃ­timo), `C OK` (servidor).
- **CorrecciÃ³n de una afirmaciÃ³n previa de esta misma auditorÃ­a:** dije que el *harden* de `profiles`
  era cierto leyendo la migraciÃ³n. La migraciÃ³n decÃ­a eso; la base no. Una migraciÃ³n sin aplicar no
  protege nada, y sin ledger no hay forma de detectarlo leyendo el repositorio.

**Deuda abierta de proceso:** `supabase_migrations` no existe. Cualquier migraciÃ³n es Â«probablemente
aplicadaÂ» hasta que alguien consulta el catÃ¡logo. Propuesta: `supabase link` + `db push`, o una tabla
`_applied_migrations` que cada archivo inserte al final.

## 2026-11-02 â€” Visitas: no inflar y no prometer lo que no mide (FTD)

- **Context.** Hallazgo #5: la pÃ¡gina pÃºblica insertaba una visita en cada render (con
  `force-dynamic`), la polÃ­tica de `0026` era `with check (true)` y la UI lo rotulaba Â«conversiÃ³nÂ». El
  `try/catch` no atrapaba nada porque el cliente de Supabase devuelve `{ error }` en vez de lanzar.
- **Options considered.**
  1. SÃ³lo cambiar el rÃ³tulo. Rejected â€” deja el contador inflable desde fuera.
  2. Filtrar renders que no son navegaciÃ³n, restringir la polÃ­tica a sorteos activos, leer el error y
     rotular Â«por renderÂ». **Chosen.**
  3. Deduplicar por visitante con hash diario de IP+UA. Rejected *por ahora*: guarda un dato pseudÃ³nimo
     y contradice la promesa explÃ­cita de `0026` (Â«no guarda datos personalesÂ»). Es una decisiÃ³n del
     dueÃ±o del producto, no del agente.
  4. Sustituir la mÃ©trica por analÃ­tica del hosting. Deferred â€” cuesta dependencia externa.
- **Why.** Un nÃºmero que se puede inflar desde fuera y se presenta como medido es peor que no tenerlo:
  el organizador decide con Ã©l. Arreglar el rÃ³tulo y cerrar la puerta de inserciÃ³n se puede hacer sin
  tocar la privacidad; deduplicar de verdad, no.
- **Consequences.** La mÃ©trica se llama Â«por renderÂ» en UI y CSV, y no se usa para precios ni comisiones.
  `0027` queda pendiente de aplicar; el verificador la delata.
- **Evidence.** `02-DOCS/wiki/ftd/raffle-visits-integrity.md`. La caÃ­da real del contador y el rechazo de
  inserciones ajenas quedan como no observados hasta la prueba en la base.

## 2026-11-02 â€” Licencias: Â«anularÂ» y Â«quitar beneficioÂ» son cosas distintas (FTD)

- **Context.** Hallazgo #4: Â«RevocarÂ» sÃ³lo marcaba el cÃ³digo como `revoked`; el plan o el rol ya
  otorgados quedaban para siempre. El modal era honesto (Â«Ya no podrÃ¡ canjearseÂ»), el nombre del botÃ³n no.
- **Options considered.**
  1. Renombrar a Â«Anular cÃ³digoÂ» y no ofrecer reversiÃ³n. Rejected â€” deja al dueÃ±o sin herramienta el dÃ­a
     de un reembolso o un fraude.
  2. **Dos acciones separadas**: Â«Anular cÃ³digoÂ» (lo de hoy) y Â«Quitar beneficioÂ» (revierte
     `premium â†’ organizador`, `admin â†’ user`), con confirmaciÃ³n que enumera los lÃ­mites. **Chosen.**
  3. Registrar `granted_plan`/`previous_plan` al canjear y restaurar exacto. Deferred â€” exige migraciÃ³n y
     tocar `0022`, que ya estÃ¡ probada, y no arregla los canjes viejos.
- **Why.** La ambigÃ¼edad era el bug. Separar los verbos la elimina sin adivinar nada; y lo que no se puede
  hacer bien (restaurar el estado previo) se dice antes de confirmar, no despuÃ©s.
- **Consequences.** El rol sÃ³lo se revierte `admin â†’ user`: un `superadmin` nunca entra en la guarda. Un
  plan desconocido no revierte nada (`licenseBenefit` devuelve null). Queda registrado en la auditorÃ­a con
  `applied`, incluido el caso Â«ya no tenÃ­a el beneficioÂ». **No ejecutado contra la base**: la regla estÃ¡
  testeada, el efecto sobre datos no.
- **Evidence.** `02-DOCS/wiki/ftd/license-void-vs-revoke-benefit.md`.

## 2026-11-02 â€” Los gates corren en CI, no cuando alguien se acuerda (FTD)

- **Context.** Typecheck, lint, tests y build pasaban, pero sÃ³lo si una persona los corrÃ­a. El hallazgo #2
  fue exactamente eso un nivel mÃ¡s abajo: una garantÃ­a que dependÃ­a de la memoria.
- **Options considered.**
  1. Dejarlo documentado en el README. Rejected â€” es lo que ya habÃ­a y no ejecuta nada.
  2. `npm run verify` + workflow de GitHub Actions con los cuatro gates. **Chosen.**
  3. Incluir tambiÃ©n `verificar_esquema.sql` en CI. Rejected â€” necesita acceso a la base; darle secretos de
     producciÃ³n a un runner es peor que correrlo a mano.
- **Why.** Una regla sin mecanismo que la ejecute es una intenciÃ³n. El CI no juzga: corre `npm test`, que
  ya incluye el contrato entre cÃ³digo y migraciones.
- **Consequences.** Todo push a `main` y todo PR pasan por los cuatro gates. El build usa variables de
  mentira, asÃ­ que no depende de secretos. Lo que sigue siendo manual y por eso mÃ¡s frÃ¡gil: el verificador
  de esquema y el ledger de migraciones.
- **Evidence.** `02-DOCS/wiki/ftd/gates-enforced-ci.md`. El workflow no se ejecutÃ³ en Actions todavÃ­a.

## 2026-11-02 â€” Ledger de migraciones, sin inventar el pasado (FTD)

- **Context.** Ãšltimo `AVISO` del verificador. Sin registro de ejecuciÃ³n, Â«estÃ¡ en el repoÂ» no prueba que
  estÃ© en la base â€” es lo que dejÃ³ pasar el hallazgo #2.
- **Options considered.**
  1. `supabase link` + `db push`. Mejor soluciÃ³n de fondo, pero exige credenciales y cambiar el flujo de
     trabajo del dueÃ±o.
  2. Tabla `_applied_migrations` + `insert` al final de cada migraciÃ³n desde `0028`, con un test que obliga
     a no olvidarlo. **Chosen.**
  3. Backfill de 0001-0027 Â«porque los objetos estÃ¡nÂ». Rejected â€” nadie observÃ³ esas ejecuciones; un
     ledger que inventa filas miente y deja de servir para lo Ãºnico que sirve: saber quÃ© corriÃ³.
- **Why.** El ledger tiene que registrar hechos, no expectativas. El pasado lo cubre el verificador por
  objetos, que es una prueba mÃ¡s fuerte que una fila autoinformada.
- **Consequences.** La tabla no es legible por `anon`/`authenticated` (RLS sin polÃ­ticas + `revoke`).
  Toda migraciÃ³n desde `0028` que no se registre rompe `npm test` y el CI. Los canjes de 0001-0027 quedan
  sin fila, y eso estÃ¡ escrito en la propia migraciÃ³n.
- **Evidence.** `02-DOCS/wiki/ftd/migration-ledger.md` â€” test mutado a propÃ³sito para verlo fallar.
- **Operational note recorded, because it cost two failed builds:** `.next` is one shared directory and
  two `next build` runs in the same folder corrupt it. It happened twice: once from a build of this
  session that stayed alive after its pipeline returned an error, and once with **another session
  building the same project concurrently** (that session was also rewriting `lib/superadmin.ts`,
  `app/admin/super/*` and adding migration `0025`). Rule: one build per tree at a time, or one worktree
  per session.

## 2026-11-03 â€” Identidad "Mesa de sorteo": dark SaaS con Ã¡mbar, no lavanda (FTD)

- **Context.** La interfaz pÃºblica funcionaba pero se leÃ­a como plantilla: hero oscuro flotante,
  tres tarjetas de mÃ©tricas idÃ©nticas, "cÃ³mo funciona" escondido en un acordeÃ³n y una grilla de
  tarjetas iguales. El brief del dueÃ±o pedÃ­a confianza, transparencia y emociÃ³n, sin clichÃ©s de IA.
  El diagnÃ³stico inicial esperaba degradÃ©s violeta; el degradÃ© violeta existÃ­a, pero en el panel
  premium (`planes`, `PremiumGate`, `LicenseCodesPanel`), no en la home.
- **Options considered.**
  1. Aplicar `dark-saas` con sus tokens exactos, incluido el acento lavanda `#5E6AD2`. Rejected â€” es
     el violeta que el brief seÃ±ala como clichÃ© de IA y borra la marca.
  2. Aplicar `bento-grid`. Rejected â€” el contenido de la cartelera es variable y el grid estricto
     deja huecos muertos; su paleta pastel es el look "Apple clone".
  3. Adoptar la **estructura** de `dark-saas` (superficies en escalones, hairlines de 1px, densidad
     tÃ©cnica, tÃ­tulos con tracking negativo, un solo acento) y conservar el Ã¡mbar de Gadu como
     acento, con el mono para precios, nÃºmeros y hashes. **Chosen.**
- **Why.** El Ã¡mbar ya era la identidad y significa "boleto / luz de mesa de sorteo"; el sistema
  dark-saas le da el marco de instrumento de precisiÃ³n que la promesa de verificaciÃ³n necesita. Un
  solo acento hace que el CTA de compra sea el Ãºnico objeto que brilla.
- **Consequences.** El sitio pasa a oscuro por defecto y deja de seguir el tema del sistema
  (`enableSystem: false`); el modo claro queda como alternativa accesible con acciÃ³n primaria en
  tinta. Todos los componentes heredan del contrato shadcn, asÃ­ que el panel admin tambiÃ©n cambia
  de piel y hubo que quitarle sus degradÃ©s violeta. La firma visual es la card-ticket con
  perforaciÃ³n.
- **Evidence.** `02-DOCS/wiki/ftd/rediseno-mesa-de-sorteo.md` + `.design/direction.md` +
  `.design/shots/final-*.png` (Chrome headless vÃ­a DevTools Protocol, 1440/390, oscuro y claro).
  Gates: typecheck 0, lint 0 warnings, 127 tests, build 0; contrastes AA verificados con
  `.design/contrast.mjs` y overflow horizontal con `.design/audit.mjs`.

## 2026-11-04 â€” bug: alta de sorteo rechazada por RLS en raffles  (feature: crear-sorteo-rls)
Repro      â€” /admin/sorteos/nuevo â†’ Â«Crear sorteoÂ» en gadu-sorteo-doci.vercel.app; error literal: new row violates row-level security policy for table "raffles".
Cause      â€” la sesiÃ³n pasa el portÃ³n del panel (lee profiles.role) pero la polÃ­tica de INSERT de raffles no la reconoce: la base no coincide con lo declarado en 0014/0030/0041. Las migraciones se aplican a mano y 0025 ya se habÃ­a aplicado a medias; no es el frontend, que manda created_by desde el commit inicial.
Fix        â€” 0065 reafirma is_admin/is_superadmin/owns_raffle y las polÃ­ticas de 0041 (idempotente); diagnostico_crear_sorteo.sql dice quÃ© pieza falta; el formulario revalida el rol al enviar y traduce el 42501.
Why missed â€” una migraciÃ³n a medias no rompe la lectura ni el portÃ³n, sÃ³lo la escritura, y no hay runner que aplique las migraciones.
- **Confirmado (2026-11-04, diagnÃ³stico en el SQL Editor).** `is_admin()` en la base es la versiÃ³n de 0001 (sÃ³lo `admin`); 0014 quedÃ³ a medias. 0041 estÃ¡ entero (polÃ­tica `raffles_insert_owner`, grants y `owns_raffle` en OK). El dueÃ±o entra como `superadmin`, pasa el portÃ³n del panel y la polÃ­tica lo rechaza. Fix pendiente: aplicar 0065.
- **0065 aplicada y verificada (2026-11-04).** El diagnostico posterior da todas las lineas en OK (is_admin() ya incluye superadmin, la politica raffles_insert_owner sigue en su lugar, ledger ultima: 0065). Falta el alta de prueba desde el panel para cerrar el caso.

## 2026-11-04 â€” bug: subir la portada creaba el sorteo sin portada  (feature: crear-sorteo-rls)
Repro      â€” Paso 3 â†’ Â«ContinuarÂ» (deja el foco en ese botÃ³n) â†’ click en el recuadro de portada â†’ elegir el archivo â†’ Enter en el diÃ¡logo. La pÃ¡gina navega al sorteo reciÃ©n creado y `cover_image_url` queda en null.
Cause      â€” React reutiliza el mismo nodo <Button> al pasar de Â«ContinuarÂ» (type=button) a Â«Crear sorteoÂ» (type=submit) y conserva el foco. El Enter que confirma el diÃ¡logo de archivo activa el submit: el alta corre mientras la subida sigue en vuelo. Evidencia: sorteo creado 17:44:44 UTC, objeto en storage 17:44:47 (3,6 s despuÃ©s), portada null; y el intento 17:43:54 se creÃ³ sin subida.
Fix        â€” `blur()` del botÃ³n al cambiar de paso y antes de abrir el diÃ¡logo; submit bloqueado y deshabilitado mientras `uploading`; aviso Â«Click para cambiar la imagenÂ» cuando ya hay portada.
Why missed â€” el alta se probÃ³ sin una subida en curso; el botÃ³n de submit seguÃ­a activo durante los segundos de upload.

## 2026-11-05 â€” Los TÃ©rminos se aceptan una vez por versiÃ³n, no en cada login  (feature: terminos-aceptacion)
Decision   â€” el consentimiento se registra en `profiles` (fecha + versiÃ³n) y se recuerda en una cookie de un aÃ±o (`gadu_terms_accepted` = versiÃ³n vigente). El checklist del login solo se muestra cuando no hay cookie o quedÃ³ vieja.
Why        â€” pedirlo en cada autenticaciÃ³n no agrega evidencia legal (la fila del perfil ya la tiene) y pone fricciÃ³n en el paso inmediatamente anterior a la compra, para el 100% de los usuarios.
Trade-off  â€” un navegador limpio o un cambio de `TERMS_VERSION` vuelven a pedir el checkbox; el modal `TermsGate` sigue siendo la red para cuentas OAuth sin aceptaciÃ³n registrada.
Evidence   â€” `lib/terms.ts` (`termsCookieAccepted`) + `lib/terms.test.ts`; `LoginForm`, `GoogleAuthButton`, `app/auth/callback/route.ts` y `app/actions/terms.ts`. Gates: typecheck 0, lint 0 warnings, tests y build verdes.

## 2026-11-05 â€” La cuenta regresiva es pÃºblica y la fecha no se mueve con el sorteo en venta  (feature: sorteo-fecha-programada)
Decision   â€” el contador se muestra siempre, sin interruptor: `draw_date` es obligatoria en `raffles`, asÃ­ que todo sorteo tiene fecha y esconderla serÃ­a ocultar un dato que ya estÃ¡ en la base.
Guard      â€” mientras el sorteo estÃ¡ `active`, cambiar `draw_date` aborta (0075, escrita sin aplicar). Superadmin y `service_role` exceptuados; para moverla hay que cerrar y republicar.
Why        â€” un contador que se reinicia entrena a los compradores a ignorarlo. La urgencia solo vale si la fecha es una promesa.
Behaviour  â€” al llegar a cero muestra Â«Fecha alcanzada Â· sorteo pendienteÂ» en vez de negativos o reinicio (el sorteo manual puede demorarse).
Evidence   â€” `lib/countdown.ts` + 12 tests; `RaffleCountdown`; contrato en `security-invariants.test.ts`; `verificar_0075.sql`.

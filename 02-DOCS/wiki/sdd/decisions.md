# SDD decisions

Append-only. Every significant decision gets a date, the options considered, and the why.

## 2026-11-02 — Constitution v1.0.0 ratified

- **Context.** `rsc onboard` wrote a draft constitution holding only onboarding facts. The first SDD
  feature needs ratified guardrails.
- **Options considered.**
  1. Full SDD ceremony: specify → clarify → plan before writing principles. Rejected — the
     constitution is the guardrail the chain runs on, not a product of it.
  2. Ratify the detected stack as-is with no security floor. Rejected — payments and RLS are the
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

## 2026-11-02 — Fail closed on missing credentials (FTD)

- **Context.** Constitution v1.0.0 named two defects: checkout mock auto-approval in any environment,
  and a repository-resident admin hash usable in production.
- **Options considered.**
  1. Remove every fallback, development included. Rejected — `.env.local` has no
     `ADMIN_ACCESS_CODE_HASH`, so the owner would be locked out of their own panel while developing.
  2. Keep a development fallback but gate it on `NODE_ENV`, and fail closed in production with a
     diagnosable error. **Chosen**, because it is what the ratified principle says: *outside
     development the app fails closed*.
  3. Make the checkout mock route a separate dev-only module. Rejected — larger diff for the same
     guarantee at this size.
- **Why.** The credential is a deployment fact, not a code fact. When it is missing in production the
  correct behaviour is to refuse the sale, not to invent one.
- **Consequences.** Production deploys now need `ADMIN_ACCESS_CODE_HASH` set, or `/admin` shows
  «El código maestro no está configurado en el servidor». A production deploy also needs
  `MP_ACCESS_TOKEN`, or checkout answers `503`. Both are documented in the README.
- **Evidence and open checks.** `02-DOCS/wiki/ftd/fail-closed-payments-and-admin.md`.

## 2026-11-02 — Webhook signature follows MP's manifest (FTD)

- **Context.** Principle 18 carried a "to verify": MP signs the manifest
  `id:[data.id];request-id:[x-request-id];ts:[ts];`, while `verifyWebhookSignature` hashed
  `${ts}.${rawBody}`. Two independent sources agreed on the manifest: MP's documentation and the
  installed SDK's own validator (`mercadopago` 2.13.0).
- **Options considered.**
  1. Implement the manifest by hand in `lib/mercadopago.ts`. Rejected — it re-implements what the
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
- **Evidence.** `02-DOCS/wiki/ftd/mercadopago-webhook-signature.md` — both directions observed
  against the real module and against the running route.

## 2026-11-02 — ESLint and Vitest become real gates (FTD)

- **Context.** Principle 6 named a quality bar, but `npm run lint` had no config and no dependency, and
  there was no test runner. The bar was declared and unverifiable — exactly what the harness's own
  "a gate that checks nothing is worse than no gate" warns about.
- **Options considered.**
  1. Leave the bar as typecheck + build and stop claiming lint/tests. Rejected — the money logic is
     the risk surface and it was reachable without touching a route.
  2. Add ESLint only. Rejected — lint catches style and hooks, not a rounding bug.
  3. Add ESLint `next/core-web-vitals` **and** Vitest, extracting the money arithmetic and the MP
     status mapping into `lib/payments.ts` so they can be tested without Supabase. **Chosen.**
   4. Add coverage thresholds now. Rejected as premature: without route-level tests a percentage
     measures the easy files only.
- **Why.** A test that needs a database to run does not run. The arithmetic and the status mapping are
  the parts that silently lose money, and they are pure.
- **Consequences.** `npm run lint` and `npm test` are part of done (constitution v1.1.0). New money
  logic must ship with its unit test. Still open: no coverage floor, no route-level tests.
- **Evidence.** `02-DOCS/wiki/ftd/quality-gates-eslint-vitest.md`.

## 2026-11-02 — Superadmin degradable y KYC borrado en orden (FTD)

- **Context.** Auditoría del panel `126fe20`: `deleteUsers` borraba los archivos KYC antes de borrar la
  cuenta, y `superadmin` no se podía degradar desde el panel en ningún camino.
- **Options considered.**
  1. Dejar la degradación como operación manual por SQL. Rejected — el día que alguien se va o una
     cuenta se compromete, la respuesta no puede ser "abrí el SQL Editor".
  2. Permitir degradar sin guarda. Rejected — el sistema puede quedarse sin ningún superadmin y
     nadie podría volver a entrar al panel.
  3. Degradar con doble control (conteo previo + reversión posterior) y regla pura testeada.
     **Chosen.**
  4. Añadir una función SQL `demote_superadmin` con `for update` para cerrar la carrera por completo.
     Rejected *for now*: exige una migración nueva que hay que aplicar antes de que el panel funcione;
     la doble comprobación cubre el caso real (un solo operador) y queda anotada como el siguiente
     paso si el equipo crece.
- **Why.** Un privilegio que no se puede revocar es un problema de seguridad; dos operaciones cuyo
  orden decide si se pierde evidencia es un problema de datos. Ninguno de los dos se arregla con
  documentación.
- **Consequences.** El panel puede degradar a un superadmin (nunca a sí mismo, nunca al último) y la
  fila de superadmin ya no es un callejón sin salida. El borrado de un usuario elimina primero la
  cuenta y después sus archivos KYC, con `kycPurged` en la auditoría.
- **Evidence.** `02-DOCS/wiki/ftd/superadmin-demote-and-kyc-purge-order.md`: regla pura con tests,
  orden de llamadas verificado por lectura, y los cuatro gates en verde. La ejecución real contra
  Supabase queda pendiente y está declarada como no observada.

## 2026-11-02 — El trigger de profiles no mira el rol de conexión (FTD)

- **Context.** Hallazgo #2 de la auditoría: la versión sin commitear de `0025` eximía por nombre de rol
  (`current_user not in ('anon','authenticated','service_role')`). Con PostgREST funciona, pero si el
  proyecto conecta con otro rol la protección del paywall y del KYC desaparece sin ningún error.
  Además, git y el working tree tenían versiones distintas del mismo archivo.
- **Options considered.**
  1. Volver a `SECURITY DEFINER` con `auth.uid()` (lo que estaba commiteado). Rejected — un trigger
     `SECURITY DEFINER` corre con privilegios del dueño y es superficie de escalada que aquí no compra
     nada.
  2. Mantener la exención por `current_user` y añadir sólo el script de prueba. Rejected — deja el modo
     de fallo silencioso; el test lo detectaría el día que se corra, no antes.
  3. Quitar la exención por rol y decidir por `auth.uid() is null`, conservando `SECURITY INVOKER`.
     **Chosen**: la protección depende de si hay un usuario final, no del nombre del rol.
- **Why.** Un control que deja de controlar sin avisar es peor que no tenerlo. El camino del canje de
  licencias sigue exento por la vía correcta: `0022` limpia los claims antes de escribir.
- **Consequences.** El comportamiento ya no depende de cómo se conecte el cliente. Se añade
  `supabase/tests/0025_profiles_hardening.sql` (7 casos, termina en `ROLLBACK`) para probarlo en el SQL
  Editor. **No se ejecutó**: no hay Postgres local y no se corren pruebas contra la base remota sin
  permiso explícito.
- **Evidence.** `02-DOCS/wiki/ftd/profiles-trigger-role-independent.md`.

### Resultado observado (mismo día)

El script de prueba devolvió cuatro `FALLO` —el usuario sí podía cambiarse el plan, aprobarse el KYC y
aprobarse la solicitud— y el diagnóstico mostró por qué: **la función existía y el trigger no estaba
enganchado**. `0025` se había aplicado a medias, y sin ledger de migraciones nada lo delataba.

- Se aplicó `0025` completo y `pg_trigger` muestra ahora los dos triggers sobre `public.profiles`.
- Tras aplicarlo: `A OK -> No tenés permisos para cambiar tu plan` (con rol privilegiado y claims de
  usuario), `B OK` (cambio legítimo), `C OK` (servidor).
- **Corrección de una afirmación previa de esta misma auditoría:** dije que el *harden* de `profiles`
  era cierto leyendo la migración. La migración decía eso; la base no. Una migración sin aplicar no
  protege nada, y sin ledger no hay forma de detectarlo leyendo el repositorio.

**Deuda abierta de proceso:** `supabase_migrations` no existe. Cualquier migración es «probablemente
aplicada» hasta que alguien consulta el catálogo. Propuesta: `supabase link` + `db push`, o una tabla
`_applied_migrations` que cada archivo inserte al final.

## 2026-11-02 — Visitas: no inflar y no prometer lo que no mide (FTD)

- **Context.** Hallazgo #5: la página pública insertaba una visita en cada render (con
  `force-dynamic`), la política de `0026` era `with check (true)` y la UI lo rotulaba «conversión». El
  `try/catch` no atrapaba nada porque el cliente de Supabase devuelve `{ error }` en vez de lanzar.
- **Options considered.**
  1. Sólo cambiar el rótulo. Rejected — deja el contador inflable desde fuera.
  2. Filtrar renders que no son navegación, restringir la política a sorteos activos, leer el error y
     rotular «por render». **Chosen.**
  3. Deduplicar por visitante con hash diario de IP+UA. Rejected *por ahora*: guarda un dato pseudónimo
     y contradice la promesa explícita de `0026` («no guarda datos personales»). Es una decisión del
     dueño del producto, no del agente.
  4. Sustituir la métrica por analítica del hosting. Deferred — cuesta dependencia externa.
- **Why.** Un número que se puede inflar desde fuera y se presenta como medido es peor que no tenerlo:
  el organizador decide con él. Arreglar el rótulo y cerrar la puerta de inserción se puede hacer sin
  tocar la privacidad; deduplicar de verdad, no.
- **Consequences.** La métrica se llama «por render» en UI y CSV, y no se usa para precios ni comisiones.
  `0027` queda pendiente de aplicar; el verificador la delata.
- **Evidence.** `02-DOCS/wiki/ftd/raffle-visits-integrity.md`. La caída real del contador y el rechazo de
  inserciones ajenas quedan como no observados hasta la prueba en la base.

## 2026-11-02 — Licencias: «anular» y «quitar beneficio» son cosas distintas (FTD)

- **Context.** Hallazgo #4: «Revocar» sólo marcaba el código como `revoked`; el plan o el rol ya
  otorgados quedaban para siempre. El modal era honesto («Ya no podrá canjearse»), el nombre del botón no.
- **Options considered.**
  1. Renombrar a «Anular código» y no ofrecer reversión. Rejected — deja al dueño sin herramienta el día
     de un reembolso o un fraude.
  2. **Dos acciones separadas**: «Anular código» (lo de hoy) y «Quitar beneficio» (revierte
     `premium → organizador`, `admin → user`), con confirmación que enumera los límites. **Chosen.**
  3. Registrar `granted_plan`/`previous_plan` al canjear y restaurar exacto. Deferred — exige migración y
     tocar `0022`, que ya está probada, y no arregla los canjes viejos.
- **Why.** La ambigüedad era el bug. Separar los verbos la elimina sin adivinar nada; y lo que no se puede
  hacer bien (restaurar el estado previo) se dice antes de confirmar, no después.
- **Consequences.** El rol sólo se revierte `admin → user`: un `superadmin` nunca entra en la guarda. Un
  plan desconocido no revierte nada (`licenseBenefit` devuelve null). Queda registrado en la auditoría con
  `applied`, incluido el caso «ya no tenía el beneficio». **No ejecutado contra la base**: la regla está
  testeada, el efecto sobre datos no.
- **Evidence.** `02-DOCS/wiki/ftd/license-void-vs-revoke-benefit.md`.

## 2026-11-02 — Los gates corren en CI, no cuando alguien se acuerda (FTD)

- **Context.** Typecheck, lint, tests y build pasaban, pero sólo si una persona los corría. El hallazgo #2
  fue exactamente eso un nivel más abajo: una garantía que dependía de la memoria.
- **Options considered.**
  1. Dejarlo documentado en el README. Rejected — es lo que ya había y no ejecuta nada.
  2. `npm run verify` + workflow de GitHub Actions con los cuatro gates. **Chosen.**
  3. Incluir también `verificar_esquema.sql` en CI. Rejected — necesita acceso a la base; darle secretos de
     producción a un runner es peor que correrlo a mano.
- **Why.** Una regla sin mecanismo que la ejecute es una intención. El CI no juzga: corre `npm test`, que
  ya incluye el contrato entre código y migraciones.
- **Consequences.** Todo push a `main` y todo PR pasan por los cuatro gates. El build usa variables de
  mentira, así que no depende de secretos. Lo que sigue siendo manual y por eso más frágil: el verificador
  de esquema y el ledger de migraciones.
- **Evidence.** `02-DOCS/wiki/ftd/gates-enforced-ci.md`. El workflow no se ejecutó en Actions todavía.
- **Operational note recorded, because it cost two failed builds:** `.next` is one shared directory and
  two `next build` runs in the same folder corrupt it. It happened twice: once from a build of this
  session that stayed alive after its pipeline returned an error, and once with **another session
  building the same project concurrently** (that session was also rewriting `lib/superadmin.ts`,
  `app/admin/super/*` and adding migration `0025`). Rule: one build per tree at a time, or one worktree
  per session.

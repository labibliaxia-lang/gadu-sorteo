# Handoff — referidos (H1/H2) y E2E, 2026-11-07

## Estado

- **Staging** (`dolxvoxyespguvixhkku`): migraciones `0118` y `0119` aplicadas. E2E completo pasa,
  premio otorgado al aprobar, **consola limpia**.
- **Producción** (`mjgcoeikcyzwojbqtuakh` en `.env.local`): `0118` y `0119` aplicadas.
  **Verificadores corridos por el dueño: 14 líneas OK (0118) y 11 líneas OK (0119)**. Falta la
  prueba manual en la web y el backup.

### Verificador en producción (después de la 0119)

```
1 OK   authenticated puede INSERT y SELECT en referrals
2 OK   políticas de INSERT y SELECT atadas a auth.uid()
2b OK  el chequeo de referente usa perfil_existe (SECURITY DEFINER)
3 OK   unique (referrer_id, referred_id) presente
4 OK   el invitado registró su propio vínculo
5 OK   auto-referido bloqueado
6 OK   no se puede registrar a nombre de otro
7 OK   referente inexistente bloqueado
8 OK   ve las filas donde es el invitado
8 OK   no ve el vínculo ajeno
9 OK   trigger y función del bonus presentes
9b OK  elegir un bonus lo activa
10 OK  el cupo excluye los sorteos usados como bonus
11 OK  ledger registra 0118 y 0119
```

Esa salida es de `supabase/tests/verificar_0118.sql` (14 líneas, cubre 0118 + 0119 + bonus).
El específico `supabase/tests/verificar_0119.sql` (11 líneas) es opcional pero más fino: su cheque 5
oculta el perfil del referente y exige que el INSERT pase igual — es el que reproduce el bug de
producción. En staging dio 11 líneas OK.

## Qué pasó con la 0118 en producción

El verificador, apenas se aplicó la 0118, salió con dos CRÍTICOS:

```
4 CRÍTICO  el INSERT legítimo fue rechazado: new row violates row-level security policy
8 CRÍTICO  no ve su propia fila
```

Causa: la política `referrals_insert_propio` de la 0118 validaba al referente con
`exists (select 1 from public.profiles ...)` dentro del `WITH CHECK`. Esa subconsulta corre con la RLS
del invitado, y en producción `profiles` sólo deja ver la fila propia (`profiles_select_own`). El
chequeo era siempre falso.

En staging el bug quedaba tapado porque existían dos políticas viejas y permisivas
(`referrals_insert_referred`, `referrals_select_own`) que se suman con OR.

Arreglo (`0119`): función `public.perfil_existe(uuid)` **SECURITY DEFINER** y la política la usa, sin
consultar `profiles` desde el chequeo.

## Cómo se comprobó

- Staging: escenario prod-like dentro de una transacción (se quitaron las políticas viejas, se verificó
  que el invitado **no ve** el perfil del referente y el INSERT pasó igual). ROLLBACK.
- Verificador actualizado: nuevo cheque `2b` (usa `perfil_existe` y es SECURITY DEFINER) para que una
  regresión a la forma vieja se vea. 14 líneas OK en staging.
- E2E final en staging con `--fresh`: cuentas nuevas, compra de 2 números, aprobación, **número 1**
  del bonus con `origin='premio'`, RPC repetida `null`, **sin errores de consola**.

Evidencia: `02-DOCS/wiki/ftd/evidencia/2026-11-07-e2e-referidos/` (`staging-e2e-final.json`,
`pasos.json`) y el informe `02-DOCS/wiki/ftd/e2e-referidos.md`.

## Pendiente (orden sugerido)

1. Aplicar `0119_referrals_policy_fix.sql` en producción — **hecho**. Verificador: 14 líneas OK.
2. Correr `verificar_0118.sql` en producción — **hecho**, sin CRÍTICOS.
3. Correr `verificar_0119.sql` (11 líneas) — **hecho**: todas OK, incluido el cheque 5 (perfil del
   referente oculto y el INSERT igual pasa).
4. Prueba manual en la web: enlace `?ref=`, compra del mínimo, aprobar reserva, ver el número premio.
5. **Backup manual** (Supabase backup) después de validar.
6. Cosmético: la 0119 deja la política limpia; no hay más cambios de código abiertos en este hilo.

Nota: el verificador ahora exige que el ledger registre **0118 y 0119** (cheque 11). Si vuelve a fallar
la captura, correrlo primero: las líneas 4 y 8 dicen si el INSERT quedó rechazado.
## Comandos

```powershell
# E2E staging (nunca producción)
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --fresh --stage setup
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --stage crear
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --stage comprar
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --stage aprobar
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --stage premio
node 01-TOOLS/SIMULADOR/e2e-referidos.mjs --env-file=.env.test.local --stage verificar
```

El servidor de staging corre en `:3001` con las variables de `.env.test.local`; el script aborta si el
archivo de entorno apunta al proyecto de producción.

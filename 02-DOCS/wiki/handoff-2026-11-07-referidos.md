# Handoff — referidos (H1/H2) y E2E, 2026-11-07

## Estado

- **Staging** (`dolxvoxyespguvixhkku`): migraciones `0118` y `0119` aplicadas. E2E completo pasa,
  premio otorgado al aprobar, **consola limpia**.
- **Producción** (`mjgcoeikcyzwojbqtuakh` en `.env.local`): `0118` aplicada y verificada con
  `supabase/tests/verificar_0118.sql`, que destapó un fallo de la política → **falta aplicar
  `0119_referrals_policy_fix.sql`**. Hasta entonces, la captura de referidos sigue rechazada en prod.

## Qué pasó con la 0118 en producción

El verificador salió con dos CRÍTICOS:

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

1. Aplicar `0119_referrals_policy_fix.sql` en producción (SQL Editor).
2. Correr `verificar_0118.sql` de nuevo en producción: las 14 líneas deben salir OK (la 9b puede dar
   AVISO si no hay un KYC aprobado).
3. Prueba manual en la web: enlace `?ref=`, compra del mínimo, aprobar reserva, ver el número premio.
4. **Backup manual** (MySQL/Supabase backup) después de validar.
5. Cosmético pendiente: la 0119 deja la política limpia; no hay más cambios de código abiertos en este
   hilo.

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

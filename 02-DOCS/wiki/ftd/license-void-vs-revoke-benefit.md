---
author: Gadu
branch: main
status: in-progress
---
# Licencias: separar «anular el código» de «quitar el beneficio»

## Intent

Hallazgo #4 de la auditoría: la acción «Revocar» sólo marcaba el código como `revoked`. Quien ya lo
había canjeado conservaba el plan `premium` o el rol `admin` para siempre, y el modal decía «Ya no podrá
canjearse» — cierto, pero el botón se llamaba revocar. Un nombre que promete dos cosas y hace una.

La decisión (ratificada por el dueño): **dos acciones separadas**, no una que adivine.

| Acción | Qué hace | Qué NO hace |
|---|---|---|
| **Anular código** | `status='revoked'`: no se puede volver a canjear | no toca el plan ni el rol ya otorgados |
| **Quitar beneficio** | revierte lo que el código otorgó: `premium → organizador`, `admin → user` | no restaura un estado anterior, no cierra sorteos publicados, no distingue si el rol lo dio este código |

## La limitación, dicha antes de confirmar

`license_codes` guarda `redeemed_by` y `redeemed_at`, pero **no el estado previo**. Por eso «quitar
beneficio» quita el beneficio *actual*, no restaura el anterior: alguien que era `admin` antes de canjear
un código `premium` (que no toca el rol) no pierde nada, pero quien llegó a `admin` por una asignación
manual y después canjeó un código `organizador` sí queda degradado. El modal lo dice con esas palabras, y
la alternativa correcta —registrar qué otorgó cada código— queda anotada abajo.

## Scope

**In:** `revokeLicenseBenefit` en `app/admin/super/actions.ts`; `licenseBenefit` en `lib/superadmin.ts`
(la regla, pura y testeada); el panel de licencias (dos botones, dos confirmaciones distintas); la
etiqueta de auditoría; la regla de que el rol sólo se revierte `admin → user`, nunca toca `superadmin`.

**Out:** registrar el estado previo (`granted_plan`, `previous_plan`…) — implicaría una migración y
tocar `redeem_license_code` de `0022`, que ya está probada; y no arregla los canjes viejos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | «Anular» no toca el plan ni el rol | Leer la acción y su confirmación |
| 2 | «Quitar beneficio» sólo aparece en códigos canjeados | Leer el panel |
| 3 | La reversión está guardada por el valor actual (`eq(field, from)`) | Leer la acción |
| 4 | Nunca degrada a un superadmin | `role = admin` en la guarda + test |
| 5 | Plan desconocido → no se revierte nada | `licenseBenefit` devuelve null + test |
| 6 | Queda registrado en la auditoría con `applied` | `REVOKE_LICENSE_BENEFIT` en el log |
| 7 | Gates verdes | typecheck, lint, tests, build |

## Evidence

**1 — observed by reading.** `revokeLicenseCode` sigue igual: `update license_codes set status='revoked'`.
El diálogo ahora dice «No podrá volver a canjearse. **NO** quita el plan ni el rol que ya otorgó».

**2 — observed by reading.** En `components/LicenseCodesPanel.tsx` el botón «Quitar beneficio» se renderiza
sólo con `c.status === "redeemed"`; «Anular» sólo con `status === "active"`.

**3-4 — observed by reading.** `revokeLicenseBenefit` escribe con `.eq("id", redeemed_by).eq(field, from)`:
la fila sólo cambia si hoy tiene el valor que el código otorgó, y el `from` del rol es `admin`, así que un
`superadmin` nunca entra.

**5 — observed.** `licenseBenefit` (`lib/superadmin.ts`) devuelve `null` para cualquier plan fuera de
`premium`/`organizador`, y la acción responde con error sin escribir nada.

**6 — observed by reading.** `logAction` con `action: "REVOKE_LICENSE_BENEFIT"`, `from`, `to` y `applied`
(falso cuando el usuario ya no tenía el beneficio). La etiqueta en el panel de auditoría:
«Quitó el beneficio de una licencia».

**7 — observed.** `npm run typecheck` → exit 0 · `npm run lint` → sin warnings · `npm test` → 4 archivos,
37 tests (5 nuevos sobre `licenseBenefit`) · `npm run build` → exit 0.

**NOT OBSERVED.** No se ejecutó contra la base: ni una reversión real de `premium`, ni el caso «ya no
tenía el beneficio», ni que un `superadmin` quede intacto. La regla está testeada; el efecto sobre datos,
no.

## Next

Si las licencias se venden, el siguiente paso correcto es registrar qué otorgó cada código: columnas
`granted_role`/`granted_plan`/`previous_plan` en `license_codes`, escritas por `redeem_license_code`, y que
la reversión restaure el valor guardado en lugar de suponer `organizador`/`user`. Cuesta una migración y
tocar `0022`; resuelve el «no distingue si el rol lo dio este código».

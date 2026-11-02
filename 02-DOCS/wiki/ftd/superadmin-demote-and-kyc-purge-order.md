---
author: Gadu
branch: main
status: in-progress
---
# Superadmin: degradar con guarda y borrar KYC en el orden correcto

## Intent

Dos hallazgos de la auditoría del panel superadmin (`126fe20`), corregidos juntos porque ambos viven
en `app/admin/super/actions.ts` y tocan la misma idea: un privilegio nunca puede crecer sin control ni
desaparecer evidencia por el orden de dos llamadas.

- **#1 (ALTA).** `deleteUsers` borraba los archivos KYC del bucket **antes** de borrar el usuario. Si el
  `deleteUser` fallaba, la evidencia de identidad ya no existía y la cuenta seguía viva.
- **#3 (MEDIA).** `superadmin` era irreversible desde el panel: `loadTargets`, `setUserRole`,
  `approveRoleRequest` y la propia fila del dashboard (que mostraba «Protegido») filtraban a los
  superadmins. Poder crear un rol que no se puede revocar obliga a entrar por SQL el día que alguien
  se va o una cuenta se compromete.

## Scope

**In:** `deleteUsers` (orden de las dos operaciones) y `setUserRole` (degradación de superadmin con
guarda del último) en `app/admin/super/actions.ts`; la fila de superadmin en
`components/SuperAdminDashboard.tsx`.

**Out:** las acciones en lote (`blockUsers`, `demoteOrganizers`) siguen excluyendo superadmins a
propósito: son operaciones de un clic sobre varios usuarios y ahí la exclusión es la protección,
no una carencia. Tampoco se permite que un superadmin se degrade a sí mismo (sigue rechazado por
`userId === adminUser.id`): lo degrada otro superadmin.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Los archivos KYC se borran después de eliminar la cuenta | Leer el bucle de `deleteUsers` |
| 2 | Un fallo al borrar archivos no pierde la operación: se loguea y queda `kycPurged: false` | Leer el log y sus detalles |
| 3 | Un superadmin se puede degradar desde el panel | `setUserRole` ya no lo rechaza; la fila ofrece el selector |
| 4 | El último superadmin no se puede degradar | Contador antes y después del update, con reversión |
| 5 | Si el conteo falla, se rechaza la degradación (falla cerrado) | `countSuperadmins()` devuelve null y se trata como rechazo |
| 6 | Sigue sin poder ascender a superadmin desde una fila | El selector de un superadmin sólo ofrece `user` y `admin` |
| 7 | Tipos, lint, tests y build pasan | Los cuatro gates |

## Evidence

**1-2 — observed by reading the file.** `app/admin/super/actions.ts:846-895`: the loop now captures
`files` first, then `deleteUser` (`:859`), then `continue` on error — the account is gone before any
file is touched. Only after a successful deletion does it call `storage.from("organizer-kyc").remove`
(`:869`), and the audit entry records `kycPurged` (`:866`, `:894`) so an orphan file is visible instead
of silent. A storage failure logs the paths and leaves `kycPurged: false`.

**3-6 — observed by reading the code.**
- `setUserRole` no longer rejects a superadmin target: it branches on
  `demotingSuperadmin = target.role === "superadmin"` (`actions.ts:420`).
- The guard: `countSuperadmins()` (`:138`) → `canDemoteSuperadmin(remaining)` (`:432`), which returns
  `false` for `null`, `0` and `1`.
- The write is optimistic: `eq("role","superadmin")` when demoting (`:453`), `neq(...)` otherwise, so
  the row is only touched if the role is still the one that was read.
- After the update, a second count (`:468`) reverts the change if the system would be left with zero
  superadmins.
- The dashboard row for a superadmin is no longer a "Protegido" label: it offers the selector
  (`SuperAdminDashboard.tsx:374-398`) built from `ROLE_OPTIONS` **minus** `superadmin` (`:392`), so the
  UI can demote and cannot promote.
- The pure rule lives in `lib/superadmin.ts:34` and is unit-tested.

**7 — observed.** The four gates:

```text
npm run typecheck → exit 0
npm run lint      → ✔ No ESLint warnings or errors
npm test          → 3 files, 27 tests passed  (12 are lib/superadmin.test.ts)
npm run build     → exit 0 (ƒ Middleware 86.8 kB)
```

`lib/superadmin.test.ts` covers `canDemoteSuperadmin` (including `null` → refuse), `pickAllowed`,
`normalizeParam`, `roleLabel` and `waLink`.

**NOT OBSERVED, and why.** The real demotion and the KYC purge were not executed: both need a live
Supabase project with a superadmin session, a second superadmin and an account with KYC files.
What is proven is the decision logic (unit tests) and the order of the calls (read). A manual test in
the deployed panel is still pending.

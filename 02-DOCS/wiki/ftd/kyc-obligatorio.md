---
author: Gadu
branch: main
status: in-progress
---
# KYC obligatorio para publicar sorteos

## Intent

Que ningún organizador (incluido Premium) pueda publicar un sorteo sin identidad aprobada y datos
personales completos. El bloqueo no depende de la UI: vive en la base.

## Scope

**In:**

- `supabase/migrations/0054_kyc_required.sql`:
  - `profiles.dni_number`.
  - Trigger `enforce_organizer_kyc` en `raffles`: al crear o reabrir a `active`, exige
    `verification_status = 'approved'` y nombre, teléfono, ubicación y DNI cargados.
  - Superadmin y `service_role` quedan exceptuados.
- `app/admin/verificacion/actions.ts`:
  - `saveKycData` con Zod (nombre, teléfono, ubicación, DNI de 7–9 dígitos).
  - `submitDni`, `submitSelfie` y `approveVerification` rechazan si faltan los datos personales.
- `app/admin/verificacion/page.tsx`: tarjeta «0. Datos personales»; sin datos completos no deja
  subir DNI/selfie; el encabezado aclara que es obligatorio para publicar.
- `app/admin/sorteos/nuevo/page.tsx`: el bloqueo de KYC ahora es siempre activo para
  organizadores/premium (superadmin exceptuado); muestra «Completar verificación» y «Editar mis
  datos».
- `app/perfil/page.tsx`: la tarjeta de KYC dice que es obligatoria para publicar.

**Out:** pagos, sorteos existentes, roles y planes.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Trigger de publicación exige KYC | Migración 0054 |
| 2 | Datos personales obligatorios | Zod + checks en actions |
| 3 | No se sube DNI sin datos | Botones y servidor |
| 4 | UI de alta bloqueada | `nuevo/page.tsx` |
| 5 | Superadmin exceptuado | Trigger + UI |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — observado.** El trigger consulta el perfil de `created_by`; si falta aprobación o algún dato,
lanza excepción antes de insertar o reabrir el sorteo. Un `INSERT` directo por PostgREST también pasa
por el trigger.

**2, 3 — observado.** `saveKycData` valida los cuatro campos; `submitDni` y `submitSelfie` llaman a
`kycDataComplete` y devuelven un error claro si falta algo; la UI deshabilita los envíos.

**4 — observado.** La página de creación exige `verification_status = 'approved'` y datos completos;
para el organizador sin KYC muestra el bloqueo con acceso a verificación y perfil.

**5 — observado.** El trigger y la UI excluyen a superadmin; el service role (cron/procesos) no se
bloquea.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 43/43. `npm run build` → 0.

## Límites

- Los sorteos que ya están activos sin KYC no se cierran retroactivamente; al reabrirlos o crear
  nuevos, el trigger los bloquea. Si se quiere una auditoría retroactiva, conviene avisar y cerrarlos
  manualmente.
- El DNI se guarda en `profiles.dni_number` (solo dueño y superadmin por RLS). Para producción
  conviene evaluar cifrado a nivel de columna o guardar solo el hash/últimos 4 dígitos.

## Next

Aplicar 0054 y probar: organizador sin KYC no puede crear; con datos completos y aprobación sí;
reabrir un sorteo cerrado también exige KYC.

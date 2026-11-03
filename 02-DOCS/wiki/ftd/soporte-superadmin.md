---
author: Gadu
branch: main
status: in-progress
---
# Soporte y ban desde el panel superadmin

## Intent

El superadmin podía gestionar roles y códigos, pero no revisar una cuenta en detalle ni suspenderla
con motivo. Este cambio agrega una ficha de soporte, una vista **de solo lectura** del panel del
usuario/organizador, y ban/desban auditados.

## Scope

**In:**

- Migración `0037_support_ban.sql`: columnas `is_banned`, `banned_at`, `ban_reason`, `banned_by` en
  `profiles`; trigger que impide que el propio usuario se desbanee; `reserve_numbers_prepaid` rechaza
  reservas de cuentas suspendidas.
- Acciones `banUser(userId, reason)` y `unbanUser(userId)`: ban real vía Supabase Auth
  (`ban_duration`), marca en el perfil, motivo y autor, registro en `admin_audit_logs`.
- `/admin/super/usuarios/[id]`: ficha con datos, estado de suspensión, actividad como organizador
  (sorteos, vendidos, reservados, recaudación) y actividad como comprador.
- `/admin/super/usuarios/[id]/panel`: panel del usuario en **modo soporte solo lectura**, sin
  acciones, con banner visible; cada apertura queda auditada (`SUPPORT_VIEW`).
- `SuperAdminDashboard`: badge «Suspendido» y link «Ver ficha» por usuario.

**Out:** impersonación real (no se roba la sesión del usuario), pagos, sorteos y cualquier acción de
escritura dentro del panel de soporte.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Columnas y trigger de ban en la base | Migración 0037 + build |
| 2 | Ban real + perfil + auditoría | Lectura de `banUser`/`unbanUser` |
| 3 | Cuenta suspendida no puede reservar | Lectura de `reserve_numbers_prepaid` |
| 4 | Ficha de soporte con datos y actividad | Ruta `/admin/super/usuarios/[id]` en build |
| 5 | Panel de solo lectura, sin acciones | Ruta `/admin/super/usuarios/[id]/panel` en build |
| 6 | Acceso restringido a superadmin | `requireSuperadminSession` en ambas páginas |
| 7 | Acciones y vistas auditadas | `BAN_USER`, `UNBAN_USER`, `SUPPORT_VIEW` en el audit |
| 8 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2 — observado.** La migración agrega las columnas y el trigger `guard_ban_fields`; las acciones
llaman primero a `auth.admin.updateUserById(..., { ban_duration: "876000h" })` y después marcan el
perfil con motivo y `banned_by`. No se puede banear a uno mismo ni a otro superadmin. Cada acción
inserta en `admin_audit_logs` con `BAN_USER` / `UNBAN_USER`.

**3 — observado.** `reserve_numbers_prepaid` (SECURITY DEFINER) hace
`if exists (... profiles where id = v_uid and is_banned) then raise exception 'Tu cuenta está suspendida...'`.
Cubre el access token que sigue vivo hasta una hora después del ban de Auth.

**4, 5 — observado.** El build lista `/admin/super/usuarios/[id]` y `/admin/super/usuarios/[id]/panel`
como rutas dinámicas. La vista de panel no renderiza formularios ni botones de acción, solo tablas y
links públicos; un banner explica que es solo lectura.

**6 — observado.** Ambas páginas validan UUID y llaman `requireSuperadminSession()`; además el
middleware ya exige la cookie del segundo factor para `/admin/super`.

**7 — observado.** La ficha y el panel insertan `SUPPORT_VIEW` con el `view` correspondiente; el
listado de auditoría del panel principal ya muestra las acciones con sus etiquetas nuevas.

**8 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente para usar la feature.** Aplicar `0037` en Supabase. Sin la migración, las acciones de ban
fallan porque las columnas no existen.

**Límites conocidos.** El ban no oculta los sorteos ni el perfil público del organizador (los
compradores no pierden acceso a lo ya vendido). El panel de soporte es de lectura: para actuar en
nombre del usuario se usan las acciones existentes del superadmin, que también están auditadas.

## Next

Siguiente incremento del panel: extender/ajustar el plan de un usuario desde la ficha, registrar un
pago manual de plan y ver el historial de pagos del plan.

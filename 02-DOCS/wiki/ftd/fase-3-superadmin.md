---
author: Gadu
branch: main
status: in-progress
---
# Fase 3 — Superadmin responsive

## Intent

Que el panel de superadmin se pueda operar desde el celular sin scroll horizontal: usuarios como
tarjetas en móvil y auditoría con el patrón tabla→tarjetas, manteniendo las mismas acciones.

## Scope

**In:**

- `components/SuperAdminDashboard.tsx`:
  - Tabla de usuarios visible desde `md`; en móvil, una tarjeta por usuario con checkbox de
    selección, nombre, email, badges de rol/solicitud/suspensión, selector de rol y «Ver ficha».
  - La lógica de selección, cambio de rol, paginación y acciones masivas queda intacta; el modal de
    alta y la barra flotante no cambian.
- `app/admin/super/page.tsx`:
  - Auditoría migrada a `ResponsiveTable`: tabla en desktop, tarjetas con fecha, superadmin, acción y
    usuario afectado en móvil.
  - Badge de acción y fechas con el estilo del sistema.

**Out:** Server Actions, RLS, permisos, reglas de negocio y datos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Usuarios legibles en móvil | Tarjetas con acciones |
| 2 | Selección y rol funcionan igual | Mismos handlers |
| 3 | Auditoría tabla→tarjetas | `ResponsiveTable` |
| 4 | Sin scroll horizontal en móvil | Tablas ocultas bajo `md` |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** Bajo `md`, cada usuario se muestra como tarjeta con el checkbox de selección,
los badges y el mismo selector de rol (incluido el caso superadmin); el link «Ver ficha» usa la misma
ruta. La barra de acciones masivas sigue operando sobre `selected`.

**3 — observado.** La sección de auditoría usa `ResponsiveTable` con las cuatro columnas; en móvil
cada registro es una tarjeta con etiqueta y valor.

**4 — observado.** La tabla de usuarios queda `hidden md:block`; la auditoría oculta su tabla en móvil
vía `ResponsiveTable`, sin `overflow-x` en pantallas chicas.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Las tablas de la ficha de usuario (`/admin/super/usuarios/[id]`) siguen con scroll
horizontal; se pueden migrar en una próxima pasada si se usa seguido desde el celular.

## Next

Cerrar la Fase 3 con la ficha de usuario o pasar a las reservas del panel del organizador.

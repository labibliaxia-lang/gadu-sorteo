---
author: Gadu
branch: main
status: in-progress
---
# Planes mensuales: página comercial, precios editables y vencimiento

## Intent

Opción B de monetización: Organizador y Premium se venden por prepago mensual. Hoy `/planes` solo
canjeaba códigos (y pedía login para mirarla), los precios no existían en la base y la solicitud
gratuita de organizador competía con el cobro. Este cambio convierte `/planes` en la página
comercial: beneficios reales, precio mensual leído de la base, CTA de WhatsApp prepago, comisión a
convenir por fuera y vencimiento con 3 días de gracia.

## Scope

**In:**

- `supabase/migrations/0032_plan_prices_and_expiry.sql`: tabla `plan_prices` (precio ARS editable,
  lectura pública), vencimientos `plan_expires_at`/`role_expires_at` en `profiles`, trigger que impide
  auto-extenderse, canje de licencias con 30 días acumulativos y `expire_plans()` para la baja.
- `app/planes/page.tsx`: pública, dos planes con beneficios, precio, WhatsApp prepago, comisión a
  convenir y canje al pie.
- `components/PlanPricesPanel.tsx` + `updatePlanPrice` en `super/actions.ts`: precios editables desde
  `/admin/super` con auditoría.
- `app/api/cron/release-reservations/route.ts`: el cron diario también aplica `expire_plans()`.
- `app/perfil/page.tsx` (botón «Ver planes y precios»), Hero y Navbar con link a `/planes`.
- `lib/plans.ts`: `PLAN_BENEFITS` con beneficios reales (MP rotulado «próximamente»).

**Out:** tabla `plan_orders` (estado de pago del plan), cobro o liquidación automática de comisiones,
renovaciones automáticas, emails de aviso, y el componente `RequestAdminButton` (queda en el repo sin
usarse; el alta manual del superadmin sigue vigente).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Precio mensual editable por superadmin y leído en /planes | Lectura + build |
| 2 | /planes pública con beneficios, precio y WhatsApp | Lectura + build |
| 3 | Canje suma 30 días y Premium otorga rol de organizador | Lectura de 0032 |
| 4 | Baja con 3 días de gracia vía cron | Lectura de 0032 + cron |
| 5 | Usuario no puede extenderse el vencimiento | Lectura del trigger |
| 6 | Botón de organizador lleva a planes | Lectura de /perfil |
| 7 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** `PlanPricesPanel` (cliente) llama a `updatePlanPrice`, que exige
`requireSuperadminSession()`, valida el plan contra allowlist y el precio con Zod (0–10.000.000), hace
upsert en `plan_prices`, registra `UPDATE_PLAN_PRICE` en la auditoría y revalida `/planes` y
`/admin/super`. `/planes` lee `plan_prices` con el cliente anónimo; con precio 0 muestra «Consultar».

**2 — observado.** `/planes` ya no redirige a login: muestra los dos planes con `PLAN_BENEFITS`, precio
mensual, botón verde de WhatsApp por plan, bloque de comisión y el canje al pie (con login para
canjear). `npm run build` → 25 páginas, `/planes` 2.88 kB.

**3 — observado.** `redeem_license_code` (0032) suma 30 días desde `greatest(vencimiento, now())` para
no perder días al renovar; el código de organizador asigna rol admin y vencimientos; el de Premium
asigna `plan='premium'` **y** rol admin si el usuario era `user`. No toca superadmins.

**4 — observado.** `expire_plans()`: Premium vencido hace más de 3 días → `plan='organizador'`;
Organizador vencido hace más de 3 días → `role='user'` y limpia vencimientos. El cron diario que ya
liberaba reservas ahora también llama a `expire_plans()` y devuelve el resultado.

**5 — observado.** `prevent_expiry_self_update` (trigger `before update` de `profiles`) lanza excepción
si un usuario no superadmin cambia su `plan_expires_at` o `role_expires_at`. El canje y el cron
escriben sin `auth.uid()` (claims limpios), así que no se bloquean.

**6 — observado.** `app/perfil/page.tsx` muestra «Ver planes y precios» en lugar del modal gratuito;
Hero dice «Ver planes» y el Navbar tiene «Planes».

**7 — observado.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → exit 0.

**Pendiente de observación real.** Aplicar `0032` en Supabase, cargar los precios desde
`/admin/super` y setear `NEXT_PUBLIC_SALES_WHATSAPP` en el deploy. Sin esa variable la página
funciona pero los botones de WhatsApp muestran la nota de configuración. Los planes canjeados antes
de 0032 quedan sin vencimiento (grandfathered).

## Next

Aplicar 0032, cargar precios, probar un canje (debe mostrar 30 días) y dejarlo vencer para ver la baja
del cron. Después, si el volumen lo justifica: tabla `plan_orders` para que el comprador vea el estado
del pago y el superadmin marque «Pagado», y avisos de renovación.

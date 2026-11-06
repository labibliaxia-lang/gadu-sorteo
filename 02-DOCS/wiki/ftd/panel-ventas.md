---
author: Gadu
branch: main
status: in-progress
feature: panel-ventas
---

# Panel de ventas: de reporte a consola

## Intent

El panel de ventas del sorteo (`/admin/sorteos/<id>/ventas`) hoy es una planilla de lectura: quién
compró, sus números, cuántos y un total. Sirve para mirar, no para operar. Y tiene un problema
peor: **el total no es la plata que entró** — se calcula como `números × price_per_number`, así que
ignora lo cobrado en `payments`, los pagos manuales y las devoluciones.

El objetivo es convertirlo en la consola de venta del organizador: plata real, y acciones sobre los
compradores y sus números con validación y auditoría.

## Scope

**Fase 1 — plata real y acciones.**

- RPC `raffle_sales_summary(p_raffle_id)` que devuelve, por comprador: nombre, teléfono, números,
  cantidad, **cobrado** (`payments.amount`), **devuelto** (`refunds`), **neto**, estado de pago y
  última venta. Una consulta agregada, no N consultas paginadas en JS.
- La planilla y el CSV pasan a leer de esa RPC. El total del pie muestra **cobrado / devuelto / neto**.
- Acciones por comprador: liberar sus números reservados, pedir comprobante por WhatsApp, y
  **devolver y liberar** los vendidos con motivo.
- Acciones por número: liberar un número reservado; devolver y liberar uno vendido.
- Tabla `raffle_audit`: quién hizo qué, cuándo y sobre qué números.
- Buscador por nombre, teléfono o número, y filtros (con pago, sin pago, con devolución).

**Fase 2:** exportar con datos completos, notas y etiquetas por comprador, plantillas de mensaje.
**Fase 3:** KPIs del sorteo (conversión reserva → venta, ticket promedio, compradores recurrentes).

**Fuera:** reasignar números entre compradores (requiere decisión de producto y su propio flujo).

## Reglas de negocio

1. **La plata manda `payments`**, nunca el catálogo. El precio solo se usa para el camino manual sin
   pago registrado, y se marca como estimado.
2. **Liberar una reserva** (no pagada) es inocuo: no toca plata.
3. **Liberar un número vendido es una devolución.** Crea fila en `refunds` por lo efectivamente
   cobrado (reparto de `payments.amount` entre sus números, como 0079), deja el número `available`,
   pide motivo y avisa al comprador.
4. **Nunca después de sortear.** La 0088 congela el estado; esta acción corre las mismas guardas.
5. **Todo auditado** en `raffle_audit` con actor, acción, números y motivo.

## Modelo propuesto

```sql
create table public.raffle_audit (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('release_reservation','refund_numbers','mark_sold')),
  numbers int[] not null default '{}',
  amount numeric(12,2),
  reason text,
  created_at timestamptz not null default now()
);
```

La RPC `raffle_sales_summary` es `security definer` y valida `owns_raffle` (o superadmin). El
teléfono sale de `raffle_buyers`, que ya respeta la visibilidad por KYC.

## Checklist (fase 1)

| # | Task | Proof it is done |
|---|---|---|
| 1 | RPC de ventas reales | Cobrado coincide con `sum(payments.amount)` de pagos aprobados |
| 2 | Planilla y CSV desde la RPC | El total del pie muestra cobrado/devuelto/neto |
| 3 | Devolver y liberar | Baja el número a `available`, crea `refunds` por lo cobrado |
| 4 | Guardas | Rechaza después de sortear y sin motivo |
| 5 | Auditoría | Fila en `raffle_audit` con actor y números |
| 6 | Buscador y filtros | Filtrar por número y por estado de pago |
| 7 | Gates | typecheck, lint, tests, build |

## Evidencia

- **Fase 1 implementada (2026-11-06), pendiente de aplicar y verificar:**
  - `0091`: tabla `raffle_audit`, RPC `raffle_sales_summary` (cobrado, devuelto y neto desde
    `payments` y `refunds`) y `refund_and_release_numbers` (devolución por lo cobrado, motivo de
    10+ caracteres, guarda de estado y auditoría).
  - La planilla y el CSV leen de la RPC; KPIs de cobrado/devuelto/neto; buscador por nombre,
    teléfono o número; acción «Devolver y liberar» por comprador.
  - `verificar_0091.sql`: 6 comprobaciones — resumen con la plata de `payments`, devolución de la
    mitad de un pago de 199.99, auditoría con motivo, rechazo de motivo corto y rechazo con el
    sorteo sorteado.
  - Gates: typecheck 0, lint 0, 291 tests, build OK.

## Next

1. Migración: `raffle_audit`, RPC `raffle_sales_summary` y `refund_and_release_numbers`.
2. Verificador SQL con un escenario de pago aprobado y una devolución.
3. Conectar la planilla/CSV a la RPC.
4. Acciones con confirmación y motivo en la tabla.
5. Buscador y filtros.

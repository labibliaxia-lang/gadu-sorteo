---
author: Gadu
branch: main
status: in-progress
---
# Sorteos destacados y landing que invita a la home

## Intent

Una landing de sorteo no debe ser un callejón sin salida: además del sorteo que
está mirando, tiene que ofrecer los otros sorteos publicados y un camino de
vuelta a la home. El superadmin necesita elegir cuáles se destacan, sin tocar la
base a mano.

## Scope

**In:**

- `supabase/migrations/0066_featured_raffles.sql`: `raffles.is_featured` y
  `featured_at`, índice parcial y fila de ledger. La escritura la hace una Server
  Action con service role y auditoría; la lectura ya es pública.
- `app/admin/super/actions.ts`: `setRaffleFeatured(raffleId, featured)` —
  superadmin, UUID validado, auditoría `RAFFLE_FEATURE`/`RAFFLE_UNFEATURE`,
  revalidación de home, panel, landing y detalle.
- `components/admin/FeatureRaffleButton.tsx`: botón «Destacar» / «Quitar
  destacado» en la tabla de sorteos del panel superadmin.
- `app/page.tsx`: el hero usa el primer sorteo activo destacado (si no hay
  ninguno, cae al primer activo como antes) y la cartelera pone los destacados
  primero.
- `app/sorteos/[id]/page.tsx`: sección «Más sorteos · Seguí participando» con
  hasta 6 sorteos activos (destacados primero) y CTA «Ver todos los sorteos» a la
  home.
- `components/RaffleMiniCard.tsx` y badge «Destacado» en la cartelera.

**Out:** pagos, reservas, el motor del sorteo, la identidad visual y el
contenido promocional de la landing (bloques de 0044).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Columnas y ledger de 0066 | `estado_migraciones.sql` en OK |
| 2 | Solo superadmin puede destacar | `requireSuperadminSession` + auditoría |
| 3 | Botón en la tabla de sorteos del panel superadmin | Corrida con sesión real |
| 4 | Home usa destacados y cae al primer activo | Lectura + corrida |
| 5 | La landing muestra otros sorteos y CTA a la home | HTML de producción |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1 — pendiente de aplicación.** La migración está escrita; el código consulta
con `select("*")` para que la app siga funcionando si 0066 todavía no está
aplicada (`is_featured` llega ausente y se trata como `false`).

**2-3 — observed by reading, pendiente corrida.** `setRaffleFeatured` repite la
comprobación de rol, valida el UUID, audita y responde con un mensaje explícito
si falta la migración. `FeatureRaffleButton` apaga el botón mientras guarda y
muestra el error debajo.

**4 — observed by reading.** En la home, `featured` es el primer activo con
`is_featured`, luego el primer activo, luego el primero de la lista; la cartelera
ordena los destacados primero y muestra el badge.

**5 — observed en producción (2026-11-04).** La landing de un sorteo renderiza
la sección «Más sorteos · Seguí participando» con hasta 6 tarjetas de otros
sorteos activos y el CTA «Ver todos los sorteos» apuntando a `/`.

## Next

Aplicar `0066` en el SQL Editor, destacar un sorteo desde el panel superadmin y
comprobar que aparece primero en la home y en la sección «Más sorteos».

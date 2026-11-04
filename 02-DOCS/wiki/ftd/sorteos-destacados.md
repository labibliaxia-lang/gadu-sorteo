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

**1 — observed (2026-11-04).** `0066` aplicada en el SQL Editor: la columna
`is_featured` existe y el primer destacado quedó con `featured_at`. El código
consulta con `select("*")`, así que también funcionaba antes de aplicarla
(`is_featured` llegaba ausente y se trataba como `false`).

**2-3 — observed en producción (2026-11-04).** El dueño destacó `auto 2026`
desde **Super → Sorteos** y quedó la fila de auditoría:

```text
2026-11-04T19:45:10Z | RAFFLE_FEATURE | labibliaxia@gmail.com |
{"raffle_id":"a925dacd-…","title":"auto 2026","featured":true}
```

`setRaffleFeatured` repite la comprobación de rol, valida el UUID, audita y
responde con un mensaje explícito si falta la migración.

**4 — observed con captura (2026-11-04).** La home muestra el ticket
«SORTEO DESTACADO · auto 2026» en el hero (`.design/shots/featured-home.png`).

**5 — observed en producción (2026-11-04).** La landing de otro sorteo
renderiza «Más sorteos · Seguí participando» con `auto 2026` primero, badge
«Destacado», y el CTA «Ver todos los sorteos» a la home
(`.design/shots/featured-landing-more.png`).

## Next

Aplicar `0066` en el SQL Editor, destacar un sorteo desde el panel superadmin y
comprobar que aparece primero en la home y en la sección «Más sorteos».

## Decisión 2026-11-04 — un solo sorteo destacado a la vez

- **Contexto.** Con varios destacados, el hero de la home mostraba el primero
  por fecha de creación (no el último marcado), el badge se repetía en la
  cartelera y se podía destacar un sorteo cerrado o cancelado.
- **Decisión.** Un solo destacado (`is_featured`) y solo sobre sorteos activos.
  Al marcar uno, el anterior se desmarca en la misma acción.
- **Por qué.** El hero tiene un solo lugar: un segundo destacado no gana
  exposición y diluye el significado. Un solo destacado además obliga a rotar.
- **Consecuencias.** `setRaffleFeatured` desmarca el anterior y rechaza sorteos
  no activos; el hero ordena por `featured_at`; el badge solo aparece en sorteos
  activos; el botón «Destacar» se deshabilita fuera de `active`.
- **Cuándo se revisa.** Si la home suma una fila «Destacados» con 3 tarjetas,
  volver a permitir varios con tope y orden por `featured_at`.

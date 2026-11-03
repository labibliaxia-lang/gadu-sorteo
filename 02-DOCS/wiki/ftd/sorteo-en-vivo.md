---
author: Gadu
branch: main
status: in-progress
---
# Motor de sorteo en vivo, verificación y certificado

## Intent

Agregar la experiencia de sorteo en vivo (botón, animación y resultado para todos los presentes) y
una página pública de verificación con descarga del certificado del ganador, sin duplicar el motor
existente ni tocar reservas, pagos o premios.

## Scope

**In:**

- `supabase/migrations/0042_live_draw.sql`: RPC `execute_transparent_draw` como wrapper **estricto**
  del motor `draw_winner` (0034), con verificación de rol/dueño, exigencia de al menos un número
  vendido y devolución del `result_hash` como hash de verificación. Agrega `raffles` a la
  publicación de Realtime (idempotente).
- `components/LiveDrawAnimation.tsx`: botón «Iniciar sorteo» para el organizador, llamada al RPC,
  ciclo de números y freno en el ganador; suscripción Realtime para que los espectadores vean la
  misma animación y el resultado.
- `app/sorteos/[id]/en-vivo/page.tsx`: sala pública en vivo con estado del sorteo, cantidad de
  vendidos y permisos calculados en el servidor.
- `app/sorteos/[id]/verificar/page.tsx`: hash/compromiso/semilla, listado de números vendidos que
  participaron, ganador y certificado.
- `components/WinnerCertificate.tsx`: certificado generado en canvas y descargado como PNG.
- `components/RaffleActions.tsx` + paneles admin: «Sortear ganador» deshabilitado si no hay números
  vendidos; el botón desaparece cuando el sorteo ya está sorteado.
- Enlaces desde la página pública del sorteo a la sala en vivo y a la verificación.

**Out:** reservas prepago, webhook, premios, motor `draw_winner` (no se reescribe) y base de datos
existente más allá de la publicación de Realtime.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | RPC `execute_transparent_draw` con autorización estricta | Migración 0042 |
| 2 | Solo se sortea con >= 1 número vendido | Chequeo en RPC + botón deshabilitado |
| 3 | Un solo sorteo: sin re-sorteo | `draw_winner` rechaza `drawn` |
| 4 | Animación en vivo para todos | Realtime en `raffles` + componente |
| 5 | Verificación pública con hash, números y ganador | Ruta `/verificar` en build |
| 6 | Certificado descargable | Componente canvas |
| 7 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2, 3 — observado.** `execute_transparent_draw` es `SECURITY DEFINER`, exige `is_admin()` y
dueño/superadmin, y falla si no hay `sold`. Delega en `draw_winner`, que ya rechaza sorteos `drawn`,
estados inválidos y falta de compromiso, y congela el resultado con el trigger de 0034.

**4 — observado.** El build lista `/sorteos/[id]/en-vivo` y `/sorteos/[id]/verificar`. La animación
se dispara con la respuesta del RPC y con el evento `UPDATE` de `raffles`; el número final es el que
quedó guardado en la base, nunca uno elegido en el navegador.

**5, 6 — observado.** La página de verificación muestra compromiso, `numbers_hash`, `result_hash`,
semilla revelada, listado de vendidos y el número ganador; el certificado se genera con canvas y se
descarga como PNG.

**7 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Nota de alcance.** El pedido mencionaba `0031_verifiable_draw_engine.sql`; esa migración ya existe
(`0031_harden_draws_and_profiles`) y el motor commit-reveal ya está en `0034`. Para no crear un
segundo motor divergente se usa `0042` como capa sobre el existente. Se agregó un quinto archivo
(`WinnerCertificate.tsx`) porque un componente de servidor no puede generar la descarga.

**Pendiente.** Aplicar `0042`, esperar el deploy (Vercel venía rate-limited) y probar con dos
navegadores: organizador y espectador anónimo.

## Next

Aplicar 0042 y probar el sorteo en vivo con un sorteo de prueba con números vendidos; verificar que
el botón esté deshabilitado sin vendidos y que el certificado se descargue.

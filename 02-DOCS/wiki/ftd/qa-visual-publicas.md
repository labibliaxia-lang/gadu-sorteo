---
author: Gadu
branch: main
status: in-progress
---
# QA visual de públicas (cierre)

## Intent

Cerrar la revisión visual de las pantallas públicas y dejar sus encabezados dentro del sistema, sin
tocar lógica. La auditoría es de código: no hubo navegador para capturas.

## Scope

**In:**

- `app/sorteos/[id]/verificar/page.tsx`: eyebrow y título con la tipografía de marca; tarjeta de
  «Resultado certificado» sin el degradé naranja viejo; links con el color de marca.
- `app/sorteos/[id]/en-vivo/page.tsx`: mismo encabezado de marca y links consistentes.
- `app/organizador/[slug]/page.tsx`: título del organizador con `font-display`.
- Revisión estática de dark mode, overflow y anchos fijos en `app/` y `components/`.

**Out:** lógica de verificación, sala en vivo, certificado y datos.

## Hallazgos de la revisión estática

| Zona | Estado |
|---|---|
| Overflow horizontal en públicas | Sin casos en el código; las tablas restantes están en paneles y ya usan tarjetas en móvil. |
| Dark mode | Solo quedan `bg-white` intencionales en los chips del logo (navbar/login/footer); el resto usa tokens. |
| Encabezados | Home, sorteo, ganadores y organizador ya usan `font-display`; faltaban verificar, en vivo y perfil del organizador. |
| Degradés viejos | Quedaba el naranja de «Resultado certificado»; reemplazado por tarjeta de marca. |
| CTA / sticky | Sin cambios; conviene confirmar en navegador que el CTA de landing y la barra de reserva no se pisen a 375 px. |

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Encabezados de públicas consistentes | verificar / en-vivo / organizador |
| 2 | Resultado sin degradé viejo | Tarjeta de marca |
| 3 | Dark mode sin blancos accidentales | Barrido de `bg-white` |
| 4 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** Los encabezados usan `font-display` y el eyebrow mono de marca; la tarjeta de
resultado usa borde y fondo de marca en lugar del degradé ámbar-naranja.

**3 — observado.** El barrido de `bg-white` solo devuelve el chip del logo (navbar, login, footer) y
`bg-white/10` del sandbox, todos intencionales.

**4 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente honesto.** Falta una pasada visual real en 375/768/1280 con navegador después del deploy.
Sin eso no se puede afirmar que no hay solapamientos ni detalles de contraste.

## Next

Revisión en navegador cuando deploye; después, ajustes de densidad del dashboard o backlog legal.

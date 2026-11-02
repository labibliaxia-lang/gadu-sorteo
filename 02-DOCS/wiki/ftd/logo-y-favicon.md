---
author: Gadu
branch: main
status: in-progress
---
# Logo, favicon y preview de links

## Intent

La marca aparecía con un ícono genérico de llave inglesa y el sitio no tenía favicon, ícono de app ni
imagen para los links compartidos. Este cambio usa el logo entregado («logo gadu blanco favicon») en
la navegación, el footer, el login, el favicon y las previews de WhatsApp/redes.

## Scope

**In:**

- `app/icon.png` (512) y `app/apple-icon.png` (180): favicon y ícono de app; Next los sirve como
  `/icon.png` y `/apple-icon.png`.
- `public/logo-gadu-wordmark.png`: recorte del logo para navegación, footer y login.
- `public/og-image.png` (1200×630): preview de links.
- `components/Navbar.tsx`, `components/Footer.tsx`, `app/(auth)/login/page.tsx`: reemplazan el ícono
  de llave por el logo dentro de un chip blanco (funciona en tema claro y oscuro).
- `app/layout.tsx`: `metadataBase`, `openGraph` y `twitter` con la imagen; descripción actualizada al
  cobro por transferencia + WhatsApp (antes decía Mercado Pago, que está oculto).
- `02-DOCS/raw/logo-gadu-original.png`: archivo original entregado, archivado.

**Out:** cambios de paleta, tipografía o estructura; no se toca ninguna lógica de negocio.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Favicon e ícono de app generados | Rutas `/icon.png` y `/apple-icon.png` en el build |
| 2 | Logo en Header, Footer y Login | Lectura de los tres componentes |
| 3 | Preview de links con imagen y metadata | Lectura de `app/layout.tsx` |
| 4 | Se ve bien en tema claro y oscuro | El logo va sobre chip blanco |
| 5 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** El build lista `○ /apple-icon.png` y `○ /icon.png` como rutas estáticas.

**2 — observado.** Navbar, Footer y Login muestran `/logo-gadu-wordmark.png` dentro de un contenedor
blanco con borde sutil; se quitó el ícono `Wrench` de esos tres archivos (sigue en las tarjetas de
estadísticas del panel, donde es un ícono funcional, no la marca).

**3 — observado.** `metadataBase` toma `NEXT_PUBLIC_URL` (fallback localhost), `openGraph.images` y
`twitter.images` apuntan a `/og-image.png`, y la descripción ya no promete Mercado Pago.

**4 — observado.** El archivo original es un JPEG con fondo blanco (no un PNG transparente): por eso
se usa sobre chip blanco en lugar de flotando sobre fondos oscuros.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Nota.** Los assets se generaron recortando el original y componiendo sobre blanco. Si más adelante
se consigue un PNG con transparencia, se reemplazan `logo-gadu-wordmark.png` y los íconos sin tocar
código.

## Ampliación: Hero coherente y metadata por sorteo

**Hero.** `app/page.tsx` decía «pagá de forma segura con Mercado Pago», que está oculto. Ahora dice
«pagá por transferencia y enviá el comprobante por WhatsApp», igual que el flujo real y que la
descripción del sitio.

**Metadata por sorteo.** `app/sorteos/[id]/page.tsx` agrega `generateMetadata`: título
«<sorteo> | Gadu Sorteos», descripción con el premio, el precio por número y la fecha, e imagen de
portada en Open Graph y Twitter. No incluye el nombre del ganador (PII). Al compartir un sorteo por
WhatsApp, la tarjeta muestra la portada del premio y no la genérica del sitio.

**Pendiente.** El commit del logo (`95884ce`) y estos arreglos quedan locales: el push a GitHub pide
iniciar sesión interactiva y no se puede completar desde el agente.

**Evidencia observada.** `typecheck` 0, `lint` 0 warnings, `test` 38/38, `build` 0.

## Next

Pushear desde la terminal del usuario (`git push origin main`) para deployar el logo y la metadata.

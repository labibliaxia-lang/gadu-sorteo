---
author: Gadu
branch: main
status: in-progress
---
# Sitemap, robots y centro de ayuda

## Intent

La web no tenía `sitemap.xml` ni `robots.txt`, así que los buscadores no tenían un mapa de sorteos
ni de perfiles de organizador. Tampoco había un lugar de autoservicio para las dudas repetidas
(pago, reserva, email, ganador), que hoy consumen tiempo por WhatsApp.

## Scope

**In:**

- `app/sitemap.ts`: sitemap con páginas fijas (home, ganadores, cómo funciona, planes, ayuda, legales),
  hasta 500 sorteos y 200 perfiles de organizador. Usa un cliente Supabase anónimo sin cookies y
  cachea 1 hora. Excluye rutas privadas.
- `app/robots.ts`: permite todo lo público y bloquea `/admin`, `/api`, `/perfil`, `/mis-numeros`,
  `/mis-pagos`, `/login`, `/register` y `/pago`; declara el sitemap y el host.
- `app/ayuda/page.tsx`: centro de ayuda con índice, guías (comprar, pagar, sorteo/transparencia, si
  ganaste, organizadores) y ocho preguntas frecuentes desplegables. CTA a WhatsApp y email.
- `components/Footer.tsx`: agrega «Centro de ayuda» en Contacto (el footer sigue sin páginas
  principales duplicadas).

**Out:** contenido legal, precios y cualquier cambio de lógica.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Sitemap con rutas públicas | Build lista `/sitemap.xml` |
| 2 | Robots bloquea rutas privadas | Build lista `/robots.txt` |
| 3 | Centro de ayuda con FAQ | Build lista `/ayuda` |
| 4 | Enlace desde el footer | Lectura de `Footer.tsx` |
| 5 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2, 3 — observado.** El build muestra `/sitemap.xml` y `/robots.txt` estáticos y `/ayuda` como
ruta dinámica (lee la variable del WhatsApp en el servidor). El sitemap tolera que falten las
variables de Supabase devolviendo solo las rutas fijas.

**4 — observado.** El footer enlaza `/ayuda` en la columna Contacto.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Verificar en producción que `/sitemap.xml` y `/robots.txt` respondan y que
`/ayuda` se vea bien en móvil. Después, dar de alta el sitemap en Google Search Console.

## Next

Alta en Search Console y revisión del centro de ayuda en móvil. Después: legal (sección de planes en
Términos, datos fiscales) y estado/changelog si se quiere más cara de SaaS.

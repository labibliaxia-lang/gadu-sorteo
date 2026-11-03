---
author: Gadu
branch: main
status: in-progress
---
# Responsive móvil y footer limpio

## Intent

En el celular el navbar mostraba la navegación completa desde 768 px y se desbordaba (especialmente
en horizontal), la barra del panel de organizador no tenía scroll y varias filas de botones no
envolvían. Además el footer repetía páginas principales (Cómo funciona, Ganadores, Planes) que ya
tienen lugar en el header, y tenía enlaces sociales muertos (`#`).

## Scope

**In:**

- `components/Navbar.tsx`: la navegación y el área de usuario pasan a `lg` (antes `md`); en tablet y
  celular horizontal se usa el menú hamburguesa. «Cómo funciona» entra al menú principal y «Mis
  pagos» sale (ya está en el área de cuenta y en el menú). Las acciones de cuenta quedan como íconos
  entre `lg` y `xl` y con texto desde `xl`.
- `app/admin/layout.tsx`: la barra de secciones del panel tiene scroll horizontal propio en móvil.
- `app/layout.tsx`: `overflow-x-hidden` en el body (red de seguridad) y menos padding vertical en
  móvil.
- Filas de acciones que no envolvían (`flex gap-2` → `flex flex-wrap gap-2`) en admin, premios,
  verificación, plan prices y pago exitoso.
- `components/Footer.tsx`: footer reducido a marca + Tu cuenta + Legal + Contacto. Cómo funciona,
  Ganadores y Planes quedan solo en el header. Se eliminan los íconos sociales sin destino; quedan
  Instagram real y WhatsApp de ventas (o `/planes` si falta la variable). Se agrega el email de
  soporte y el aviso de pago por transferencia.

**Out:** rediseño visual, cambios de contenido de las páginas, lógica de negocio.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Navbar usable en celular y tablet sin desborde | Breakpoint `lg` + menú con scroll |
| 2 | Barra del panel admin con scroll propio | `overflow-x-auto` en el nav |
| 3 | Filas de botones envuelven | `flex-wrap` en las cinco filas |
| 4 | Footer sin páginas principales duplicadas | Lectura del footer |
| 5 | Sin enlaces sociales muertos | Instagram/WhatsApp reales |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** El navbar tenía `md:flex` para la navegación y el área de usuario; con 5 links y
la cuenta, a 768 px se desbordaba. Ahora usa `lg:flex` con menú `lg:hidden` y `max-h-[calc(100vh-4rem)] overflow-y-auto`.
Las acciones de cuenta son icon-only por debajo de `xl` (con `title`), así no empujan el layout.

**2 — observado.** `app/admin/layout.tsx`: `-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 ...`.

**3 — observado.** Las cinco filas detectadas con `flex gap-2` pasaron a `flex flex-wrap gap-2`.

**4, 5 — observado.** El footer ya no lista Cómo funciona, Ganadores ni Planes: esas páginas están en
`NAV_LINKS`. El bloque de redes solo tiene Instagram (`@jacinto.cards`) y WhatsApp; los `href="#"` se
eliminaron.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente de verificación visual.** No hay navegador en este entorno: la comprobación fue estática y
de build. Falta abrir la web en un celular real (375 px) y en horizontal (~844 px) y revisar home,
sorteo, `/planes`, panel admin y superadmin.

## Next

Verificar en dispositivo; si queda algo puntual (tablas, modales, números), corregirlo en la misma
línea. Después: mover «Cómo funciona» a una sección de la home si se quiere más descubrimiento.

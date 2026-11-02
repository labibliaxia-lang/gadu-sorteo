---
author: Gadu
branch: main
status: in-progress
---
# Páginas públicas: cómo funciona, términos y privacidad

## Intent

El Footer no tenía páginas institucionales: un visitante no podía entender el
mecanismo del sorteo antes de comprar, ni leer condiciones o tratamiento de
datos. Este cambio agrega tres páginas estáticas y las enlaza desde el pie de
página, sin tocar pagos, webhook, motor de sorteos, autenticación ni base de
datos.

## Scope

**In:**

- `app/como-funciona/page.tsx`: pasos del sorteo (números vendidos, pago
  confirmado por el organizador, sorteo en la fecha y verificación pública),
  sección «lo que no hacemos» y sección sobre verificación con hashes.
- `app/terminos/page.tsx`: condiciones de uso con placeholders `[...]`.
- `app/privacidad/page.tsx`: política de datos basada en el tratamiento real
  (Google, Supabase, Vercel, Mercado Pago si se habilita, comprobantes por
  WhatsApp fuera de la plataforma, KYC cuando esté habilitado).
- `components/Footer.tsx`: columna «Información» con Cómo funciona, Términos,
  Privacidad y Planes; grilla de 3 a 4 columnas (en mobile ya eran 2).

**Out:** lógica de pagos, webhook, motor de sorteos, esquema de base, auth y
colores del sitio. No se agregó navegación en el Navbar.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Página /como-funciona con los 4 pasos e íconos | Lectura + build |
| 2 | Página /terminos con secciones legales y placeholders | Lectura + build |
| 3 | Página /privacidad con datos reales del sistema | Lectura + build |
| 4 | Footer enlaza las cuatro páginas y se ve en desktop y mobile | Lectura de Footer |
| 5 | Nada de pagos, webhook, motor o DB cambió | `git diff --stat` |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2, 3 — observado.** Las tres rutas existen y renderizan en el build:
`/como-funciona` 189 B, `/privacidad` 146 B, `/terminos` 146 B (First Load
JS 87.5–96.2 kB). Metadata propia en cada página.

**4 — observado.** `components/Footer.tsx`: la grilla pasa a
`sm:grid-cols-2 lg:grid-cols-4` y se agrega la columna «Información» con los
links. En mobile la grilla ya era de 2 columnas, así que los links quedan
visibles en todas las pantallas.

**5 — observado.** `git diff --stat` del bloque: solo los tres archivos nuevos y
`components/Footer.tsx` (más este documento). No se tocaron rutas de API,
migraciones, middleware ni componentes de compra.

**6 — observado.** `npm run typecheck` → exit 0. `npm run lint` → `✔ No ESLint
warnings or errors`. `npm test` → 38/38. `npm run build` → exit 0 y las tres
rutas aparecen en el árbol.

**Aviso de contenido — observado en el código.** El motor actual **no usa
hashes**: `draw_winner` elige un número al azar entre los vendidos (`order by
random()`) y el resultado queda congelado por el trigger de 0031. Por eso
/como-funciona describe la verificación por hash como «en camino» y no como algo
que ya ocurra.

**Textos legales.** Términos y Privacidad usan el texto provisto por el titular
el 2/11/2026. Se hicieron tres correcciones de exactitud para que lo publicado
no contradiga al sistema:

1. §5 de Términos: donde decía «motor criptográfico verificable mediante hash
   público generado», ahora describe el sorteo real (azar entre números
   vendidos, resultado congelado) y ubica el hash como «en desarrollo».
2. Privacidad §1: el acceso es con Google, sin contraseña propia almacenada.
3. Privacidad §1: los comprobantes viajan por WhatsApp y no se almacenan; los
   datos técnicos se atribuyen al proveedor de alojamiento; KYC condicionado a
   que la verificación esté habilitada.

Quedan pendientes solo los datos del titular: `[NOMBRE DE LA EMPRESA]`,
`[CUIT]` y `[DOMICILIO]` en ambas páginas. El email de contacto
(`francofsm84@gmail.com`) ya está cargado. No es asesoramiento jurídico:
conviene una revisión profesional antes de considerarlo definitivo.


## Next

Completar los placeholders legales. Si se quiere la transparencia prometida en
la página, el paso técnico es publicar un hash (SHA-256) del listado de números
vendidos antes del sorteo y otro del resultado después, y mostrar ambos en la
página del sorteo: eso hoy no existe y es un cambio aparte en el motor.

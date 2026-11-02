---
author: Gadu
branch: main
status: in-progress
---
# Hero multirrubro: de "herramientas" a premios variables

## Intent

Gadu Sorteos dejó de ser un sorteo de herramientas de taller y pasó a ser un SaaS de sorteos
multirrubro, con premios que varían por sorteo: autos, tecnología, experiencias, herramientas,
dinero. El Hero de la home seguía vendiendo la versión vieja: el H1 prometía «las mejores
herramientas para tu taller» y el subtítulo cerraba con «herramientas de primera». Un visitante
nuevo leía una promesa más chica que el producto.

Cambiar el mensaje del Hero para que hable de premios variables, mantenga la promesa de
transparencia y conserve los CTAs reactivos según la sesión. Sin tocar pagos, cuadrícula de números
ni rutas protegidas.

## Scope

**In:** `app/page.tsx`, sección Hero (el componente equivalente: el Hero está inline en la home, no
existe `components/Hero.tsx`). Badge, H1, subtítulo, icono decorativo del Hero. Y, aprobado en el
mismo paso, una línea de `components/HowItWorks.tsx` (el beneficio «Entrega a todo el país», que
seguía prometiendo herramientas).

**Out:** `components/Navbar.tsx`, `components/Footer.tsx` (su línea 24 todavía dice «para tu
taller»), `app/layout.tsx:13` (metadata, también con «herramientas»), `app/(auth)/login/page.tsx:31`,
el placeholder del admin, Mercado Pago (`app/api/checkout`, `app/api/webhooks/mercadopago`),
`components/NumbersGrid.tsx`, middleware y rutas protegidas, `.env.local`. Quedan anotados como
restos del mensaje viejo, no se tocan acá.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Badge superior con mensaje de transparencia | Lectura de `app/page.tsx`, sección Hero |
| 2 | H1 generalizado a premios variables, sin foco exclusivo en herramientas | Lectura del H1 |
| 3 | Subtítulo: elegir números + pago seguro + variedad de premios | Lectura del párrafo |
| 4 | CTAs siguen siendo reactivos a la sesión | `git diff` limitado a Hero + grep del condicional `user ?` |
| 5 | Nada fuera del Hero cambió | `git diff --stat` |
| 6 | TypeScript limpio | `npm run typecheck` |
| 7 | Build de producción limpio | `npm run build` |
| 8 | El beneficio «Entrega a todo el país» ya no promete herramientas | Lectura de `components/HowItWorks.tsx:50` |

## Evidence

**1 — observed, and already satisfied.** El badge ya decía «Sorteos 100% online y transparentes»
en `app/page.tsx:31-34`, así que el paso 1 no necesitó cambio: se verificó por lectura y quedó
intacto.

**2 — observed.** H1 nuevo: «¡Participá y ganá los mejores premios!» (`app/page.tsx:36-38`). Ya no
nombra herramientas ni taller. La palabra «herramientas» sobrevive solo como un ítem dentro de una
lista de premios posibles.

**3 — observed.** Subtítulo (`app/page.tsx:40-45`): elegir números, pagar de forma segura con
Mercado Pago, variedad explícita de premios («autos, tecnología, experiencias, herramientas y
mucho más») y la frase de transparencia («números, premios y ganadores a la vista»).

**4 — observed.** `git diff` de `app/page.tsx` toca solo el import de iconos, el icono decorativo
(`Wrench` → `Gift`: el fondo ya no insinúa taller), el H1 y el subtítulo. El condicional
`{user ? … /mis-numeros : … /register}` sigue igual (`app/page.tsx:57-77`), y «Ver sorteos activos»
→ `/#sorteos` y «Canjear código» → `/planes` no se movieron.

**5 — observed.** `git status --short` → `M app/page.tsx` y el documento FTD sin trackear. Ningún
otro archivo de la app cambió: pagos, `NumbersGrid`, middleware y rutas protegidas quedaron sin
tocar.

**6 — observed.** `npm run typecheck` (`tsc --noEmit`) → exit 0, sin salida de errores.

**7 — observed.** `npm run build` → exit 0: `✓ Compiled successfully`, «Linting and checking
validity of types» sin observaciones, 25 páginas generadas, 28 rutas, `ƒ /` 5.9 kB / 114 kB first
load, `ƒ Middleware 86.8 kB`. Además el copy nuevo aparece en el bundle compilado
(`.next/server/app/page.js`), o sea que el texto nuevo es el que se sirve.

**8 — observed.** `components/HowItWorks.tsx:50` pasó de «Enviamos las herramientas ganadas a
cualquier punto de Argentina» a «Coordinamos la entrega de tu premio en cualquier punto de
Argentina». Sirve igual para un auto que para una experiencia.

**Quedan restos del mensaje viejo (fuera de alcance).** Un grep de `herramientas|taller` en `*.tsx`
todavía encuentra: `components/Footer.tsx:24` («Sorteos transparentes de herramientas para tu
taller»), `app/layout.tsx:13` (metadata/SEO, «sorteos de herramientas»), `app/(auth)/login/page.tsx:31`
y un placeholder del admin. El más visible es el Footer; la metadata es la que ve Google. Ninguno se
tocó en este cambio.

## Next

Commitear `app/page.tsx`, `components/HowItWorks.tsx` y este documento. Después, si el mensaje
multirrubro se sostiene, alinear Footer (`:24`), la metadata de `app/layout.tsx` y el login en un
cambio aparte con su propio documento.


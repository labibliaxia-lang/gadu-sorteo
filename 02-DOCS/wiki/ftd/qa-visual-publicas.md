---
author: Gadu
branch: main
status: in-progress
---
# QA visual de públicas (cierre)

## Intent

Cerrar la revisión visual de las pantallas públicas y dejar sus encabezados dentro del sistema, sin
tocar lógica. La primera pasada fue de código; esta segunda es con navegador real.

## Scope

**In:**

- `app/sorteos/[id]/verificar/page.tsx`: eyebrow y título con la tipografía de marca; tarjeta de
  «Resultado certificado» sin el degradé naranja viejo; links con el color de marca.
- `app/sorteos/[id]/en-vivo/page.tsx`: mismo encabezado de marca y links consistentes.
- `app/organizador/[slug]/page.tsx`: título del organizador con `font-display`.
- Revisión estática de dark mode, overflow y anchos fijos en `app/` y `components/`.
- **Barrido real en navegador** de las páginas públicas en 375 / 768 / 1280, tema por defecto y tema
  claro.

**Out:** lógica de verificación, sala en vivo, certificado y datos.

## Cómo se midió

Herramienta nueva: [`01-TOOLS/SIMULADOR/barrido-publicas.mjs`](../../../01-TOOLS/SIMULADOR/barrido-publicas.mjs),
Playwright 1.64.1 con Chromium local, headless. Sólo GET anónimos: no inicia sesión, no reserva, no
paga, no escribe en Supabase.

Por página y por ancho mide: estado HTTP, errores de consola, excepciones sin capturar, respuestas
≥ 400, desborde horizontal real (`scrollWidth > innerWidth`), imágenes sin `alt`, controles sin
nombre accesible, campos sin etiqueta, jerarquía de títulos y contraste AA calculado sobre color
computado y fondo efectivo.

El medidor de contraste se validó contra un caso fabricado (`#777` sobre `#888`): da 1.26 y lo
marca. La primera corrida tenía un error —componía los fondos translúcidos contra blanco— e
inventaba 85 fallos que no existían; corregido y vuelto a correr.

## Resultado

- Tema por defecto (oscuro), 16 páginas × 3 anchos = 48 combinaciones: **27 ok · 12 parcial · 9 falla**.
- Tema claro, 5 páginas clave × 3 anchos = 15 combinaciones: **3 ok · 12 parcial · 0 falla**.
- Evidencia: `evidencia/2026-11-07-visual-publicas/` (60 capturas, `barrido.json`, `pasos.json`) y
  `evidencia/2026-11-07-visual-publicas-claro/` (15 combinaciones).

## Hallazgos, con la prueba al lado

| # | Severidad | Qué pasa | Prueba |
|---|---|---|---|
| 1 | **Alta** | `/sorteos/<slug>/verificar` y `/sorteos/<slug>/en-vivo` devuelven **404**. Las dos páginas consultan `raffles.id = params.slug`; el slug no es un id. La página principal del sorteo sí resuelve (`resolverColumna`), estas dos quedaron atrás en el commit de slugs (05a80d8). | `pasos.json`: `verificar-1280` y `en-vivo-1280` en 404. La misma página por UUID responde 200. |
| 2 | Media | `RaffleVisitTracker` se monta también en sorteos no activos. La policy de 0027 sólo acepta visitas de sorteos `active`, así que la inserción anónima falla: **401 + error de consola en cada visita a un sorteo ya sorteado**. | Sólo aparece en `auto-2026-demo` (status `drawn`): consola `[visits] ... violates row-level security policy` y respuesta 401 en `raffle_visits`. |
| 3 | Media | Contraste AA en tema claro: «Ver reseñas y sorteos del organizador» **3.44** (12 px), «Modo simulación de pagos activo» **3.99** (12 px), chip «ACTIVO» **4.28** (11 px) y los seis links de `/ayuda` **4.47** (14 px, apenas debajo de 4.5). | `barrido.json` de la corrida clara, 1280 px. |
| 4 | Media | El chip «ACTIVO» sobre la foto del sorteo usa fondo translúcido sobre imagen: en 375 px no se lee en ninguno de los dos temas. | `capturas/zoom-fecha-light.png` y `zoom-fecha-dark.png`. |
| 5 | Baja | Saltos de jerarquía `h1 → h3` en `/planes`, `/seguridad`, `/login` y `/register`. | `barrido.json`, `saltosTitulos`. |
| 6 | Baja | A 375 px el contador no entra: el texto «Faltan … · fecha» se parte y deja un «m.» huérfano en otra línea. La repetición de la fecha no es el error —el bloque muestra valor + cuenta regresiva a propósito—; el error es el corte. | `capturas/zoom-fecha-light.png` y `zoom-fecha-dark.png`. |

## Lo que ya había encontrado la pasada anterior

La misma fecha hay otra pasada con el plugin del harness, archivo
`evidencia/2026-11-07-visual-plugin/informe.md`. Coincide con esta en lo importante y aporta diez
hallazgos que este barrido no buscaba (son de contenido, no de layout):

- **Coinciden:** 404 de sub-rutas por slug (su #6, mi #1) y el salto `h1 → h3` de `/planes` (su #7,
  mi #5). Los doy por confirmados por dos métodos distintos.
- **Sólo suyos:** mojibake en la calificación del organizador (`5.0 Ã‚· 2 reseñas`), datos de pago de
  prueba publicados como si fueran reales, badge «Modo simulación de pagos activo» a la vista,
  sorteo activo sin premios publicados, falta un espacio antes del `·` en la ayuda de la grilla,
  precio con un decimal en Planes, los CTA de venta no abren `wa.me` y el quinto plan queda huérfano.
- No los repito acá como propios: están medidos en ese informe y no los volví a verificar.

También deja un descarte que corrijo en mi #6: la fecha repetida (valor + cuenta regresiva) es
diseño, no defecto.

## Lo que sí está en orden

- **Sin desborde horizontal en ninguna de las 48 combinaciones**, 375 incluido. El pendiente de la
  revisión estática queda cerrado: no hay CTA ni tabla que se salga del ancho.
- Cero imágenes sin `alt`, cero controles sin nombre accesible, cero campos sin etiqueta.
- Un solo `h1` por página y `meta description` presente en todas.
- **Tema oscuro: cero textos bajo contraste.** Los tokens de marca pasan AA.
- Ninguna excepción sin capturar en ninguna página.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Encabezados de públicas consistentes | verificar / en-vivo / organizador |
| 2 | Resultado sin degradé viejo | Tarjeta de marca |
| 3 | Dark mode sin blancos accidentales | Barrido de `bg-white` |
| 4 | Gates verdes | typecheck/lint/test/build |
| 5 | Barrido en navegador 375/768/1280 | `barrido.json` + capturas de las dos corridas |

## Evidence

**1, 2 — observado (revisión estática).** Los encabezados usan `font-display` y el eyebrow mono de
marca; la tarjeta de resultado usa borde y fondo de marca en lugar del degradé ámbar-naranja.

**3 — observado.** El barrido de `bg-white` solo devuelve el chip del logo (navbar, login, footer) y
`bg-white/10` del sandbox, todos intencionales.

**4 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**5 — observado.** Dos corridas completas con Playwright, `barrido.json` y capturas en la carpeta de
evidencia. Los hallazgos de arriba salieron de ahí, no de mirar código.

**Pendiente honesto.** No se probó la barra de reserva con números seleccionados ni ningún estado con
sesión iniciada: el barrido es anónimo a propósito. Tampoco hay todavía una corrida contra el deploy;
esto mide el servidor de desarrollo.

## Arreglos aplicados (2026-11-07)

| # | Arreglo | Verificación |
|---|---|---|
| 1 | Nuevo `lib/raffle-slug.ts` con `resolverColumna`; `verificar` y `en-vivo` buscan por slug o por id y usan `raffle.id` para números y ganadores. Los enlaces conservan el slug cuando existe. | Las 6 combinaciones (3 slugs y 3 UUID) responden **200**: `auto-2026-demo`, `auto-2-demo` y el UUID `a925dacd…`, en `/verificar` y `/en-vivo`. |
| 2 | `RaffleVisitTracker` recibe `status` y no dispara el INSERT si el sorteo no está `active` (la policy 0027 sólo acepta activos). | Barrido posterior en `sorteo-sorteado`: **0 errores de consola y 0 respuestas 4xx** (antes: 1 error + 401). |
| 4 | Chip de estado sobre la foto con fondo sólido: emerald-700 + texto blanco (5.55:1) para activo, amber-400 + texto negro (12.5:1) para cerrado, `canvas/90` + `fg` para el resto. | Contraste calculado sobre los colores del token. La captura posterior no se pudo tomar: el servidor de desarrollo quedó inestable (500 intermitentes) al momento de la foto. |

Gates después de los arreglos: `npm run typecheck` → 0 · `npm run lint` → 0 warnings ·
`npm test` → **331/331**.

Sigue pendiente: 3 (contraste en tema claro), 5 (saltos de título) y 6 (corte del contador a 375).

## Next

1. Arreglar 1 y 2 antes de la prueba de referidos: los dos se tocan desde un link público.
2. Pasada de diseño para 3 y 4 (contraste en claro y chip «ACTIVO» sobre foto).
3. 5 y 6 son cosméticos: entran con el próximo ajuste de densidad.

---
author: Gadu
branch: main
status: in-progress
---
# Rediseño "Mesa de sorteo" (dark SaaS + ámbar)

## Intent

Sacar la interfaz pública del patrón genérico "hero oscuro + tres tarjetas de métricas + acordeón +
grilla de tarjetas iguales" y darle una identidad de instrumento: una mesa de sorteo nocturna,
precisa y verificable. El brief pedía transmitir confianza, transparencia y emoción, con botones de
acción irresistibles y sin los clichés de IA (degradés violeta, contraste bajo, paddings
inconsistentes).

No se toca lógica de pagos, reservas, sorteos ni datos. Solo presentación.

## Dirección

- **Estilo base:** dark SaaS (Linear) con los tokens exactos de superficie, hairline, densidad y
  tipografía de la skill `dark-saas`.
- **Desviación deliberada:** el único acento no es el lavanda `#5E6AD2` de la skill, sino el ámbar
  de Gadu (`#F5B301`). El lavanda es exactamente el "violeta cliché" que el brief pide evitar y
  borraría la marca. Se conserva el **sistema** (un solo acento, superficies en escalones, hairlines,
  títulos con tracking negativo) y se cambia el color de marca.
- **bento-grid descartada:** el contenido de la cartelera es variable (foto, progreso, estado,
  precio) y el grid estricto obliga a huecos muertos; además su paleta de tiles pastel es el look
  "Apple clone" que el brief señala como genérico. Queda registrado en `.design/direction.md`.
- **Firma:** la card-ticket con perforación (línea punteada + muescas laterales + talón con fondo
  distinto), el mono en precios/números/hashes y la franja de compromiso del sorteo destacado.
- **Tema:** oscuro por defecto y una sola identidad. `enableSystem` pasa a `false`; el modo claro
  queda como alternativa accesible, no como variación automática según el sistema operativo.

## Scope

**In:**

- `app/globals.css`: tokens nuevos (`canvas`, `panel-1..3`, `hairline`, `fg*`, `gold`), alias del
  contrato shadcn, tipografía base, foco, `prefers-reduced-motion`, utilidades `eyebrow`,
  `text-brand-accent`, `full-bleed`, `hairline-grid`, `ticket-stub`.
- `tailwind.config.ts`: tokens nuevos, radios, sombras por tema, `fontSize.2xs`, plugin
  `tailwindcss-animate` fuera (no se usaba), animación `live-pulse`.
- `components/ui/{button,card,badge,input,empty-state}.tsx`: primitivas planas, hairline, un solo
  acento, foco accesible.
- `components/ThemeProvider.tsx`: oscuro por defecto, sin sistema.
- `components/{Navbar,Footer}.tsx`: barra de 56px, hairlines, links 13px, footer en panel.
- `app/page.tsx`: hero full-bleed, ticket destacado real con compromiso, franja de estado,
  protocolo de 3 pasos siempre visible, cartelera.
- `components/{HowItWorks,RafflesList,ShareButton,LiveFomo,PrizeCard,LiveDrawAnimation}.tsx`.
- `app/{como-funciona,ganadores,planes}/page.tsx` y `app/sorteos/[id]/page.tsx`.
- `components/NumbersGrid.tsx`: selección en ámbar, leyenda de 3 estados (se elimina el azul y el
  rosa), más columnas en móvil (6/8/10/20), `aria-pressed`.
- Eliminación de degradés violeta/fucsia (`planes`, `PremiumGate`, `LicenseCodesPanel`,
  `AdvancedAnalytics`) y de los degradés ámbar-naranja heredados.
- Corrección de textos rotos por encoding en `LiveFomo` ("Â¡Alguien…", "nÃºmero").
- Se deja de mostrar `NEXT_PUBLIC_SALES_WHATSAPP` como texto al público en `/planes`.

**Out:** lógica de pagos, reservas, sorteo, RLS, migraciones, datos. Panel admin más allá de
heredar tokens y quitar violeta. Contenido de las fotos de premios (las sube el organizador).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tokens y tipografía del sistema | `app/globals.css`, `tailwind.config.ts` |
| 2 | Tema oscuro por defecto + claro alternativo | `components/ThemeProvider.tsx`, capturas de ambos |
| 3 | Home: hero, ticket, franja, protocolo, cartelera | `final-home-1440.png`, `final-home-390.png` |
| 4 | Detalle de sorteo y grilla de números | `final-detail-390.png` |
| 5 | Páginas públicas coherentes (cómo funciona, ganadores, planes) | `final-*.png` |
| 6 | Contraste AA en los pares de texto usados | `.design/contrast.mjs` |
| 7 | Sin overflow horizontal a 390/768/1440 | `.design/audit.mjs` (CDP) |
| 8 | Gates verdes | typecheck/lint/test/build |
| 9 | Crítica visual externa y correcciones | `.design/memory.md` + `shots/qa4-home-390.png`, `shots/qa2-verificar-1440.png` |

## Evidence

**1, 2 — observado.** Los tokens de superficie, hairline y texto del dark-saas se aplican como
variables HSL con soporte de alfa (`hsl(var(--panel-1) / <alpha-value>)`), de modo que los
modificadores de opacidad de Tailwind funcionan. El tema claro invierte la misma estructura: canvas
`#F7F7F8`, panel blanco, texto `#0B0C0E`, y la acción primaria pasa a tinta porque el ámbar como
fondo no alcanza AA sobre blanco.

**3, 4, 5 — observado.** Renderizado real con Chrome headless vía DevTools Protocol (capturas de
página completa en `.design/shots/final-*.png`): home 1440 y 390, home en claro, detalle 390,
verificar 1440, planes 1440, cómo funciona 1440 y login 390. El hero deja de ser una tarjeta
flotante y ocupa el ancho completo; el protocolo deja de estar escondido en un acordeón; la
cartelera usa cards-ticket con talón y CTA ámbar; la franja de estado muestra datos reales
(sorteos activos, organizadores, SHA-256). El sorteo destacado muestra el compromiso real cuando
existe y, si no, dice "huella publicada al sortear" — no inventa un compromiso.

**6 — observado.** `.design/contrast.mjs` calcula WCAG sobre los pares realmente usados. Todos los
pares de texto del tema oscuro superan 4.5:1 (fg 19.61, fg-muted 14.28, fg-subtle 6.42 sobre
canvas; ámbar `brand-300` 14.44; tinta sobre ámbar 10.68). En claro, los textos ámbar pasan a
`brand-800` (5.33:1) porque `brand-700` daba 3.53:1.

**7 — observado.** `.design/audit.mjs` emula 390×844 con viewport móvil real: `docScrollWidth`
= 390 y sin nodos fuera del viewport. En la primera pasada la barra de filtros se cortaba a 390
(los cuatro botones no entraban); se convirtió en grid de 4 columnas y ahora entran todos.

**8 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 127/127. `npm run build` → 0.

**9 — observado.** Segunda pasada de un subagente crítico sin permiso de escritura, sobre las
capturas finales; sus hallazgos y el estado de cada corrección están en la sección «Crítica» de
este documento y en `.design/memory.md`.

**Pendiente honesto.** No hubo prueba con usuarios reales ni con lector de pantalla. La grilla de
números se verificó por lectura de código (virtualización intacta) y por captura; elegir un número
real, reservarlo y pagar requiere sesión y no se ejecutó en esta pasada.

**Re-verificación tras las correcciones de la crítica (2026-11-04).** `npm run typecheck` → 0 ·
`npm run lint` → sin warnings · `npm test` → 127/127 · `npm run build` → exit 0. El render de las
dos pantallas corregidas se verificó con Chrome headless (`.design/audit.mjs`) sobre el servidor de
desarrollo, a 390×844 y 1440×900.

## Crítica

Segunda pasada de un subagente crítico sin permiso de escritura, sobre las capturas finales.
Veredicto inicial: **NO-GO** (1 bloqueante, 4 altos). El detalle completo, con el estado de cada
hallazgo, vive en [`.design/memory.md`](../../../.design/memory.md).

**Corregido en esta pasada:**

- **BLOQUEANTE — el destacado móvil había perdido la fecha.** A 390 era una fila de lista (miniatura
  de 40px, título y una línea de progreso): sin foto, sin barra, sin CTA y sin fecha en la primera
  pantalla. Ahora es el mismo ticket recomprimido: foto, fecha completa en una línea, progreso con
  barra, precio y "Elegir" en el talón perforado. La fecha queda sobre el fold a 390×844.
  Evidencia: `shots/qa4-home-390.png` y `shots/qa4-home-top-390.png`.
- **ALTO — `/sorteos/[id]/verificar` era una página casi vacía.** El estado "todavía no hay
  compromiso" no explicaba nada y dejaba ~200px de negro muerto. Se agregó el bloque "Cómo se
  verifica" con los tres pasos (compromiso antes, semilla revelada, hash del listado) y el badge de
  estado quedó anclado al eyebrow en vez de flotar solo. Evidencia: `shots/qa2-verificar-1440.png`.

**Abierto, con criterio (no bloquea el cierre del rediseño):**

- ~~La grilla de números corta una fila al medio y no señala que hay más.~~ **Corregido:** paginación
  por bloques que entran completos en el panel (54 a 390, 180 a 1440), contador de rango y
  Anterior/Siguiente; sin scroll anidado.
- ~~El ámbar se repite demasiado: siete "Participar" llenos y varios links compiten con el CTA del
  hero.~~ **Corregido:** las cards de la cartelera pasan a CTA outline; el ámbar lleno queda en el
  CTA del hero, "Registrarse" y el CTA del detalle.
- ~~`/planes` no tiene botón por card: "Consultar" ocupa el lugar del precio.~~ **Corregido:** CTA
  primaria por card ("Contratar por WhatsApp" o "Hablar con ventas" → `/ayuda`), precio como dato
  secundario y badge/borde neutros.
- Formato de datos inconsistente entre pantallas (mayúsculas, miles y fechas) y datos de prueba
  visibles en la cartelera ("amoladora" ×4, descripción "d,jabsdkvabdjkl"). El segundo es higiene
  de datos, no de código.

La crítica dio por bueno y no se tocó: contraste AA del mono de datos (≈5,6:1 en ambos temas), cero
degradés decorativos/glow/emojis/violeta, y la card-ticket como firma real.

**Tercera pasada (2026-11-04, veredicto GO).** Un segundo crítico externo revisó las capturas
`final2-*` y dio **GO** sin bloqueantes: el ticket móvil conserva foto, fecha completa, progreso,
precio y talón dentro de 390×844 (la fecha termina en y=698, el ticket en y=776, 0 overflow). Se
aplicaron sus mayores de bajo costo:

- El talón móvil etiqueta el precio ("Por número"), igual que la home de escritorio y las cards: sin
  la etiqueta, "$ 1.500" junto a la foto se podía leer como el valor del premio.
- La barra de progreso pasa a 4px con track `hairline-strong`: a 2px y sobre `panel-3` no se leía.
- Los badges de estado dejan de llevar un ring verde fijo: CERRADO ya no tiene halo de ACTIVO, y en
  `/verificar` el badge usa el mismo mapa de variantes que la cartelera.
- "Cómo se verifica" iguala el padding de "Compromiso del sorteo" (px-6) y cada paso arranca con su
  etiqueta (Compromiso / Semilla / Listado) para que se pueda escanear.

Quedan abiertos por decisión, no por olvido: la cantidad de marcas ámbar (regla de un CTA lleno por
viewport; el H1 conserva "verificar." en ámbar como énfasis de marca) y la higiene de datos del seed
("amoladora" ×4, fechas vencidas con sorteos activos). Evidencia: `shots/final3-home-390.png` y
`shots/final3-verificar-1440.png`.

## Cierre 2026-11-04 — logos del dueño y pasada de acabado

- **Logos por tema.** El dueño entregó dos PNG: blanco para fondo oscuro y azul para fondo claro.
  Se copiaron a `public/logo-gadu-blanco.png` y `public/logo-gadu-azul.png` y se usan en Navbar,
  Footer y login con `dark:hidden` / `hidden dark:block`, sin chip blanco y con `alt` único (la
  segunda imagen queda `aria-hidden`). Evidencia: `shots/v2-home-1440.png`,
  `shots/v2-home-light-1440.png`, `shots/v4-login-390.png`.
- **Microtipo.** Los datos mono suben de 10-11px a 11-12px; las fechas dejan de ir en mayúsculas.
- **Medición final.** `.design/audit.mjs` (Chrome DevTools Protocol) entrega 0 nodos fuera del
  viewport a 390 y capturas de página completa con lazy-loading resuelto. `.design/contrast.mjs`
  mantiene todos los pares de texto usados ≥ 4,5:1 en ambos temas.
- **Gates.** `npm run typecheck` → 0 · `npm run lint` → sin warnings · `npm test` → 127/127 ·
  build de producción exit 0, ejecutado en una copia aislada porque otra sesión estaba compilando la
  misma carpeta `.next` (la carpeta de build es compartida y dos builds simultáneos la corrompen).
- **Pendiente honesto.** Sin prueba en teléfono real ni lector de pantalla; el muro de ganadores no
  se pudo ver con datos porque la base de desarrollo no tiene sorteos sorteados. La calidad de las
  fotos de premios es contenido del organizador, no del sistema de diseño.

## Cierre 2026-11-04 (segunda pasada) — modo claro propio, accesibilidad y deploy

- **Modo claro con material propio.** Deja de ser el oscuro invertido: canvas papel cálido
  (`#F6F4EF`), paneles marfil, hairlines cálidos y texto tinta. La acción primaria sigue en tinta
  (el ámbar sobre papel no alcanza el 3:1 de borde de UI); el ámbar queda como sello en énfasis,
  progreso y foco. Contraste medido: fg/canvas 16,9:1; fg-subtle/panel 5,8:1; brand-800/panel 5,2:1.
  Evidencia: `shots/v5-home-light-1440.png`, `shots/v9-home-light-390.png`.
- **Skip link.** Primer tab stop "Saltar al contenido" en todas las páginas; `main#contenido`.
- **Auditoría de accesibilidad** (`.design/a11y.mjs`, CDP): un solo `h1`, sin saltos de nivel, 0
  imágenes sin `alt`, 0 controles sin nombre accesible, 0 inputs sin label, 0 ids duplicados. Foco
  por teclado: 22/22 stops con indicador visible (el CTA ámbar muestra doble anillo). Blancos
  táctiles: los únicos <24px son enlaces de texto inline (exentos por WCAG 2.5.8).
- **Deploy verificado.** `.design/verify-prod.mjs` contra `https://gadu-sorteo-doci.vercel.app`:
  `logo-gadu-azul.png` 200, `logo-gadu-blanco.png` 200, la home referencia el logo nuevo y captura
  390/1440 con lazy-loading resuelto. Producción ya sirve la identidad nueva. Evidencia:
  `shots/prod/home-1440.png`, `shots/prod/home-390.png`.
- **Modo claro verificado en todas las públicas**, no solo en la home: planes, cómo funciona,
  verificar y detalle a 390/1440 con el tema claro forzado por CDP. Evidencia:
  `shots/light-planes-1440.png`, `shots/light-como-1440.png`, `shots/light-verificar-1440.png`,
  `shots/light-detail-390.png`.
- **Formato de números unificado** en el detalle: vendidos con separador de miles y número ganador
  con `formatNumber` (4 dígitos), igual que la cartelera y el muro de ganadores.

## Next

1. Revisar el resultado en un teléfono real (no solo emulación) y con lector de pantalla.
2. Extender el mismo sistema a las tablas del panel admin si se quiere una identidad completa.
3. Higiene de datos del seed ("amoladora" ×4, fechas vencidas con sorteos activos) y unificar
   formato de fechas/miles en `lib/utils`.

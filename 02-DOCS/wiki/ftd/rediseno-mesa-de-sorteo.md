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
| 9 | Crítica visual externa y correcciones | informe del subagente crítico |

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

## Crítica

(se completa con el informe del subagente crítico y las correcciones aplicadas)

## Next

1. Revisar el resultado en un teléfono real (no solo emulación) con datos reales de sorteo.
2. Decidir si el modo claro se queda o se retira; hoy es una alternativa accesible, no la identidad.
3. Extender el mismo sistema a las tablas del panel admin si se quiere una identidad completa.

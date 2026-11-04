# Memoria de diseño — "Mesa de sorteo"

Registro de las decisiones que no se leen en el código y de lo que la crítica cambió.
Vive acá, no en el chat, para que la próxima pasada no vuelva a discutir lo mismo.

## Dirección

- **Dark SaaS (Linear) con el ámbar de Gadu.** Se conservan los tokens de superficie, hairline,
  densidad y tracking negativo de la skill; se reemplaza el lavanda `#5E6AD2` por `#F5B301`.
  Motivo: el lavanda es el violeta cliché que el brief pedía evitar y borra la marca.
- **Bento-grid descartada.** El contenido de la cartelera es variable (foto, progreso, estado,
  precio): un grid estricto obliga a huecos muertos y su paleta pastel es el look "Apple clone".
- **Un acento con trabajo asignado:** CTA primaria, foco, progreso y número ganador. Todo lo demás
  es neutro. Esta regla es la que más se rompe al agregar secciones: revisarla en cada PR.
- **Firma:** la card-ticket con perforación (línea punteada + muescas laterales + talón con fondo
  distinto), el mono en precios/números/hashes y la franja de compromiso del sorteo destacado.
- **Tema oscuro por defecto.** El claro es una alternativa accesible (acción primaria en tinta,
  ámbar de texto en `brand-800` para pasar AA), no una variación automática del sistema.

## Crítica visual (segunda pasada, 2026-11-04)

Subagente crítico sin permiso de escritura, sobre las capturas finales. Veredicto inicial:
**NO-GO** con 1 bloqueante y 4 altos. Lo corregido en esta pasada:

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | BLOQUEANTE | En 390 el destacado era una fila de lista: sin foto, sin progreso, sin CTA y **sin fecha** en la primera pantalla. | **Corregido.** El ticket móvil ahora muestra foto, fecha completa en una línea, progreso con barra, precio y "Elegir" en el talón perforado. Verificado en render real (`shots/qa4-home-390.png`). |
| 2 | ALTO | La grilla de números corta una fila al medio y no señala que hay más números. | **Corregido.** Paginación por bloques que entran completos en el panel (54 por página a 390, 180 a 1440), sin scroll anidado, contador "1–54 de 1.005" y controles Anterior/Siguiente. |
| 3 | ALTO | El ámbar aparece más de una docena de veces por página (7 "Participar" llenos, pasos, links): deja de marcar prioridad. | **Corregido.** Las cards de la cartelera pasan a CTA outline; el ámbar lleno queda en el CTA del hero, "Registrarse" y el CTA del detalle. |
| 4 | ALTO | `/planes` no tiene ningún botón: el texto más grande de cada card es "Consultar". | **Corregido.** CTA primaria por card ("Contratar por WhatsApp" o "Hablar con ventas" → `/ayuda`), precio como dato secundario, badge y borde neutros. |
| 5 | ALTO | `/sorteos/[id]/verificar` era una página casi vacía: la promesa de la marca no se explicaba. | **Corregido.** Bloque "Cómo se verifica" con los 3 pasos (compromiso, semilla, hash del listado) y el badge de estado anclado al eyebrow. Verificado en render real (`shots/qa2-verificar-1440.png`). |
| 6 | MEDIO | El mismo dato se imprime de tres formas (mayúsculas, separador de miles, formato de fecha). | Parcial. Fechas sin mayúsculas y microtipo a 11-12px; falta unificar formato en `lib/utils`. |
| 7 | MEDIO | La cartelera muestra datos de prueba ("amoladora" ×4, descripción "d,jabsdkvabdjkl"). | Abierto. Es higiene de datos, no de código: seed real o condicionar descripciones vacías. |
| 8 | MEDIO | Cuatro sellos de estado antes del fold y un botón deshabilitado en ámbar al 40% que se lee barro. | **Corregido.** El CTA de login del detalle es un link habilitado al mismo nivel visual; el estado deshabilitado queda solo para reservas sin selección. |
| 9 | MEDIO | La marca dependía de un chip blanco para que el logo se leyera sobre negro. | **Corregido.** Logos transparentes por tema: `logo-gadu-blanco.png` sobre oscuro y `logo-gadu-azul.png` sobre claro, sin contenedor. |

Lo que la crítica dio por bueno y no hay que tocar: contraste AA del mono de datos medido
(≈5,6:1 en ambos temas), cero degradés decorativos/glow/emojis/violeta, y la card-ticket como
firma real.

## Reglas aprendidas

- La fecha del sorteo no puede caer bajo el fold en mobile: es el dato que dispara la urgencia.
- Una card que se "recomprime" no puede convertirse en otro componente: si pierde foto, progreso o
  CTA, es un componente distinto y hay que diseñarlo, no esconderlo.
- Un estado vacío no es ausencia de información: explica el mecanismo y cuándo habrá dato.
- Si el ámbar se usa para todo, no sirve para nada. Un CTA lleno por viewport.
- Una grilla paginada resuelve dos problemas a la vez: se ve el rango completo sin scroll anidado y
  el número de páginas comunica el tamaño real del sorteo.
- La marca no necesita una caja blanca: con logo blanco y azul separados por tema, el header queda
  más limpio y el modo claro no arrastra un chip que no le corresponde.

## Cierre 2026-11-04 (pasada de acabado + pedido del dueño)

- **Logos nuevos del dueño integrados**: `public/logo-gadu-blanco.png` (fondo oscuro) y
  `public/logo-gadu-azul.png` (fondo claro). Navbar, footer y login eligen uno por tema con
  `dark:hidden` / `hidden dark:block`; se elimina el chip blanco. Evidencia: `shots/v2-home-1440.png`,
  `shots/v2-home-light-1440.png`, `shots/v4-login-390.png`.
- **Planes con acción real**: CTA primaria por card, "A convenir" como dato secundario, badge
  "Recomendado" neutro y borde hairline. Evidencia: `shots/v4-planes-1440.png`.
- **Detalle de compra en orden**: grilla antes de los datos de transferencia, login habilitado como
  link, paginación 54/página a 390 y 180 a 1440 con Anterior/Siguiente. Evidencia:
  `shots/v3-detail-390.png`.
- **Cartelera sin el destacado duplicado**: seis cards, dos filas exactas, CTA outline. Evidencia:
  `shots/v2-home-1440.png`.
- Gates: typecheck 0 · lint sin warnings · 127/127 tests · build de producción aislado exit 0
  (la carpeta `.next` compartida estaba siendo compilada por otra sesión; el build se validó en una
  copia con `node_modules` enlazado).

Pendiente honesto: prueba en teléfono real, lector de pantalla y un sorteo ya sorteado para ver el
muro de ganadores con datos (hoy la base de desarrollo no tiene ninguno).

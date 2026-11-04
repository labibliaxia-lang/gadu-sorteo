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
| 2 | ALTO | La grilla de números corta una fila al medio y no señala que hay más números. | Abierto. Requiere altura múltiplo de la celda + máscara + contador de rango. |
| 3 | ALTO | El ámbar aparece más de una docena de veces por página (7 "Participar" llenos, pasos, links): deja de marcar prioridad. | Abierto. Lista cerrada de usos: CTA del hero, progreso, ganador, foco. El resto a neutro. |
| 4 | ALTO | `/planes` no tiene ningún botón: el texto más grande de cada card es "Consultar". | Abierto. Decisión de producto: si se agrega CTA de WhatsApp, vuelve el número que se había dejado de exponer. |
| 5 | ALTO | `/sorteos/[id]/verificar` era una página casi vacía: la promesa de la marca no se explicaba. | **Corregido.** Bloque "Cómo se verifica" con los 3 pasos (compromiso, semilla, hash del listado) y el badge de estado anclado al eyebrow. Verificado en render real (`shots/qa2-verificar-1440.png`). |
| 6 | MEDIO | El mismo dato se imprime de tres formas (mayúsculas, separador de miles, formato de fecha). | Abierto. Unificar en `lib/utils` y dejar las mayúsculas en CSS. |
| 7 | MEDIO | La cartelera muestra datos de prueba ("amoladora" ×4, descripción "d,jabsdkvabdjkl"). | Abierto. Es higiene de datos, no de código: seed real o condicionar descripciones vacías. |
| 8 | MEDIO | Cuatro sellos de estado antes del fold y un botón deshabilitado en ámbar al 40% que se lee barro. | Abierto. Una fila meta; deshabilitado en `panel-2` + `fg-subtle`. |

Lo que la crítica dio por bueno y no hay que tocar: contraste AA del mono de datos medido
(≈5,6:1 en ambos temas), cero degradés decorativos/glow/emojis/violeta, y la card-ticket como
firma real.

## Reglas aprendidas

- La fecha del sorteo no puede caer bajo el fold en mobile: es el dato que dispara la urgencia.
- Una card que se "recomprime" no puede convertirse en otro componente: si pierde foto, progreso o
  CTA, es un componente distinto y hay que diseñarlo, no esconderlo.
- Un estado vacío no es ausencia de información: explica el mecanismo y cuándo habrá dato.
- Si el ámbar se usa para todo, no sirve para nada. Un CTA lleno por viewport.

# Direction — "Mesa de sorteo": un ticket nocturno, preciso y verificable

## PRODUCT
Gadu Sorteo: rifas con números, pago por transferencia y sorteo en vivo verificable por hash.
Usuario: comprador argentino en mobile (llega por WhatsApp/Instagram), con poca tolerancia a la
desconfianza. Acción primaria: elegir números y participar. En 5 segundos debe entender:
*qué se sortea, cuánto sale, cuándo se sortea y que el resultado se puede comprobar*.

## VISUAL DIRECTION
**Dark SaaS aplicado con el ámbar de la casa.** Canvas casi negro (#010102), superficies en
escalones de carbón, separadores de 1px (hairline), densidad de documento técnico. Un solo acento:
el ámbar #F5B301, que en esta marca significa "boleto / luz de mesa de sorteo", no decoración.
El registro es el de un instrumento de precisión: la confianza se muestra con datos (hash, semilla,
números vendidos), no con promesas.

## HIERARCHY
1. H1 + CTA "Ver sorteos activos" (ámbar, único bloque de color pleno del hero).
2. Módulo del sorteo destacado (ticket real, con progreso y precio en mono).
3. Franja de estado con números reales (mono, hairlines).
4. Protocolo en 3 pasos (01/02/03) siempre visible: la confianza no se esconde en un acordeón.
5. Cartelera: cards-ticket; "Participar" es el único botón lleno por card.

## LAYOUT
Hero full-bleed con reglas hairline arriba/abajo y grid técnico al 3%; contenido a 1152px.
Composición asimétrica 7/5: texto a la izquierda, ticket a la derecha. En mobile el ticket se
compacta debajo del CTA. Secciones con separación 96/64. Grid de cartelera 3 columnas, gap 16.

## TYPOGRAPHY
Display: Space Grotesk 600 con tracking negativo (-0.03em en H1, -0.02em en H2/H3).
Cuerpo: Inter 15px/1.6, 400. Datos: IBM Plex Mono 12-13px (precios, números, hashes, labels).
Labels: mono 11px, mayúsculas, tracking 0.16em. Prohibido: 800/900, degradés de texto.

## COLOR
- canvas #010102 · panel #0F1011 · panel-2 #141516 · panel-3 #18191A
- hairline #23252A · hairline-strong #34343A
- fg #F7F8F8 · fg-muted #D0D6E0 · fg-subtle #8A8F98 · fg-faint #62666D
- accent (único) #F5B301 · on-accent #0A0A0B · accent-hover #FFC93C
- success #27A644 · danger #E5484D
Cada color tiene un trabajo. El ámbar está reservado a: CTA primaria, foco, progreso y número
ganador. Nada más. Dark-saas pide un acento lavanda (#5E6AD2): se descarta a propósito porque es
igual al cliché violeta que el brief pide evitar y borra la identidad de Gadu. Se conservan
exactos los tokens de superficie, hairline, escala de texto y densidad de la skill.
Modo claro: inverso simétrico (canvas #F7F7F8, panel #FFF, CTA primaria en tinta #111214).

## DENSITY / INTERACTION / RESPONSIVE
Densidad de herramienta: 13-15px de cuerpo, filas de 40-44px, cards con padding 20-24.
Hover = borde hairline-strong + translateY(-2px) sin sombra pesada. Focus = ring ámbar 2px.
Mobile 390: hero en una columna, ticket compacto, cartelera 1 col, sticky bar de reserva.
Desktop 1440: hero 2 col, cartelera 3 col. Nada de elementos que se compriman: se recomponen.

## MOTION
Precisa y corta: 150ms para controles, 250ms fade-up al cargar filas. Sin parallax, sin glow, sin
bucles. prefers-reduced-motion desactiva transformaciones. El único movimiento con carácter es el
contador/estado en vivo (pulso lento del punto "en vivo").

## IMAGERY
Fotografía real de los premios subidos por organizadores: sí, es prueba del premio. Se trata como
documento: aspect 16/10, borde hairline, sin overlay de degradé decorativo. Fallback sin foto:
monograma tipográfico (no emoji).

## SIGNATURE
La **card-ticket con perforación**: separador punteado y muescas laterales entre la información del
sorteo y el talón de acción. Sobre fondo oscuro y con números en mono, se lee como un boleto real —
el objeto que la plataforma vende.

## MOTIVO DE LA ELECCIÓN (dark-saas vs bento-grid)
Bento se descarta: el contenido de la cartelera es variable (foto, progreso, estado, precio) y el
grid estricto obliga a huecos muertos; además su pool de tiles pastel es el look "Apple clone" que
el brief señala como genérico. Dark-saas encaja con la promesa (verificación técnica, hash, noche de
sorteo) y hace que el ámbar de Gadu —que ya existe— funcione como un solo acento memorable.

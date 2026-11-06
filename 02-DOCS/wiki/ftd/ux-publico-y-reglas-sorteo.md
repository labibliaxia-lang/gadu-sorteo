---
author: Gadu
branch: main
status: in-progress
---

# UX del comprador y reglas del sorteo

## Intent

Tres correcciones que salieron de probar la web: el comprador no entiende el estado de los números
porque la grilla pública los muestra apagados, el organizador no puede volver desde las
subsecciones del sorteo, y los botones de cancelar/eliminar sorteo no distinguen un borrador vacío
de un sorteo con gente y plata adentro.

## Scope

**In:**

1. **Colores de la grilla pública.** En `components/NumbersGrid.tsx` los estados pasan a tener el
   mismo lenguaje que el panel del organizador: disponible con punto verde, reservado ámbar,
   vendido rojo con tachado. La leyenda usa los mismos colores.
2. **Volver en las subsecciones.** `Gestionar premios` y `Editar sorteo` eran las dos únicas que
   no tenían retorno; ahora tienen el mismo botón «Volver» que números, preguntas, landing y
   analítica, apuntando al detalle del sorteo.
3. **Reglas de los botones peligrosos.**
   - `deleteRaffle` (Server Action): bloquea si el sorteo tiene números vendidos o reservados,
     pagos, devoluciones o compromiso publicado, con el detalle en el mensaje.
   - `0087` (trigger `guard_raffle_deletion`): el mismo bloqueo en la base, porque el dueño puede
     llamar a PostgREST directamente y la política de DELETE ya existía.
   - `cancelRaffle` (Server Action): con participantes o compromiso exige confirmación extrema —
     escribir `CANCELAR SORTEO` y un motivo de 10+ caracteres, que se guarda como
     `cancellation_reason`.

**Out:** el motor del sorteo, los pagos y la lógica de devoluciones (la 0079 sigue mandando ahí).

## Decisiones

1. **El freno vive en la base, no solo en la pantalla.** Una Server Action se saltea con
   PostgREST; un trigger `BEFORE DELETE` no.
2. **Cancelar sigue permitido con participantes.** Es el camino de «no se alcanzó el mínimo» y
   genera devoluciones: se protege con confirmación extrema, no se prohíbe.
3. **Eliminar no se permite con actividad.** Un sorteo con ventas no se borra: se cancela.
4. **La paleta cruza las dos vistas.** Disponible verde, reservado ámbar, vendido rojo; así la
   leyenda del comprador y los puntos del organizador dicen lo mismo.

## Ciclo de vida del sorteo (segunda tanda, 2026-11-06)

El compromiso publicado no congela el sorteo, congela la semilla. Lo que sí limita los botones es
la plata, la gente y la fecha. De ahí salieron cuatro cambios:

1. **Cerrar y reabrir pasan por el servidor.** Antes eran un `UPDATE` directo del navegador, sin
   validación ni auditoría. `closeRaffle` exige `active`; `reopenRaffle` exige `closed` **y**
   `now < draw_date`.
2. **Estados terminales congelados** (0088, trigger `guard_terminal_raffle_state`): un sorteo
   `drawn` o `cancelled` no puede volver a `active` por PostgREST. `drawn` ya lo cubría 0034;
   `cancelled` era el agujero (se podía reabrir un sorteo que ya generó devoluciones).
3. **La venta corta en la fecha** (0088, `reserve_numbers`): con `draw_date <= now()` no se reserva
   más, aunque el estado siga `active`.
4. **El botón Eliminar se oculta** cuando hay números movidos, pagos o compromiso, en vez de
   mostrarse y fallar.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Grilla pública con estados distinguibles | Captura 375/768 con números vendidos y reservados |
| 2 | Leyenda coherente con las celdas | Los cuatro colores coinciden con el grid |
| 3 | Volver en premios y editar | Navegación de ida y vuelta sin pasar por el listado |
| 4 | Eliminar bloqueado con actividad | `verificar_0087.sql` 5/5: control, vendido, compromiso y pago |
| 5 | Cancelar con confirmación extrema | Sin la frase, el servidor no cancela; con motivo corto, tampoco |
| 6 | Cerrar/reabrir validados en el servidor | `closeRaffle`/`reopenRaffle` en la Server Action; la base rechaza reabrir cancelado/sorteado |
| 7 | Estados terminales congelados | `verificar_0088.sql`: cancelado y sorteado no vuelven a activo |
| 8 | Sin venta después de la fecha | `verificar_0088.sql`: reserva después de `draw_date` rechazada |
| 9 | Gates verdes | typecheck, lint, tests, build |

## Evidencia

- **0087 (eliminar):** verificado 5/5 el 2026-11-06.
- **0088 (estados y ventana de venta):** aplicada y **verificada 5/5 el 2026-11-06** —
  control de cierre, cancelado sin reapertura («su estado no se puede cambiar»), sorteado sin
  reapertura (guarda de 0088), reserva válida antes de la fecha y rechazo después.
- **UI:** implementada; falta la prueba visual (grilla, volver, botones de ciclo de vida).
- **Lección del verificador:** tres corridas fallaron por el mismo patrón — confundir "no hubo
  error" con "no pasó nada". RLS bloquea con 0 filas, y el script mezclaba la sesión del dueño con
  la del comprador. Ahora mide el estado resultante y separa las identidades.

## Next

1. Aplicar `0087` (si no se aplicó) y `0088`; correr `verificar_0088.sql`.
2. Probar la grilla pública con un sorteo que tenga vendidos y reservados.
3. Recorrer el panel del organizador y volver desde cada subsección.
4. Probar cancelar un sorteo con participantes: sin la frase no cancela, con la frase sí.
5. Probar reabrir un sorteo cerrado: antes de la fecha sí, después no.
6. Probar la venta con la fecha vencida: la grilla debe rechazar la reserva.

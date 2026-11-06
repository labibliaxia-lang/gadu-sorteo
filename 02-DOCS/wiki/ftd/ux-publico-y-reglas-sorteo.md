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
   - `0083` (trigger `guard_raffle_deletion`): el mismo bloqueo en la base, porque el dueño puede
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

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Grilla pública con estados distinguibles | Captura 375/768 con números vendidos y reservados |
| 2 | Leyenda coherente con las celdas | Los cuatro colores coinciden con el grid |
| 3 | Volver en premios y editar | Navegación de ida y vuelta sin pasar por el listado |
| 4 | Eliminar bloqueado con actividad | `verificar_0083.sql` 5/5: control, vendido, compromiso y pago |
| 5 | Cancelar con confirmación extrema | Sin la frase, el servidor no cancela; con motivo corto, tampoco |
| 6 | Gates verdes | typecheck, lint, tests, build |

## Evidencia

Pendiente: cambios recién aplicados, sin prueba visual ni SQL todavía.

## Next

1. Aplicar `0083` y correr `verificar_0083.sql`.
2. Probar la grilla pública con un sorteo que tenga vendidos y reservados.
3. Recorrer el panel del organizador y volver desde cada subsección.
4. Probar cancelar un sorteo con participantes: sin la frase no cancela, con la frase sí.

---
author: Gadu
branch: main
status: in-progress
---
# Elegir un número puntual y compartir la landing exacta

## Intent

Dos fricciones de la página pública de un sorteo:

1. El comprador escribe el número que quiere ("0150") y la grilla no lo ubica ni
   lo resalta; tenía que buscar la página a mano entre miles de botones.
2. El organizador necesita compartir el enlace de **ese** sorteo, no la home.

## Scope

**In:**

- `components/NumbersGrid.tsx`: al tipear, la grilla salta a la página del
  número y lo resalta; Enter o «Ir» además lo dejan seleccionado (si está
  disponible y hay sesión).
- `lib/jump-number.ts` + test: normalización del texto, parseo con ceros a la
  izquierda y cálculo página/fila. Puro, sin navegador.
- `components/ShareButton.tsx`: comparte la URL real de la landing del sorteo
  (conserva `?ref=` y parámetros de campaña); fuera de la landing, arma la ruta
  canónica `/sorteos/<id>`.

**Out:** reserva, pago, realtime, virtualización y layout de la grilla. Nada del
servidor ni de RLS.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | "0150" ubica el 150 y cambia a su página | Corrida real + test de `locateNumber` |
| 2 | El número buscado se resalta por unos segundos | `highlight` con anillo ámbar |
| 3 | Enter o «Ir» lo seleccionan | Selección agregada al set del comprador |
| 4 | Un número vendido/reservado avisa por qué no se puede | Mensaje en `error` |
| 5 | Compartir copia la URL exacta del sorteo | `buildShareUrl()` con `window.location` |
| 6 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1-3 — observed by tests + reading.** `lib/jump-number.test.ts` cubre ceros a la
izquierda, fuera de rango, separadores y la ubicación página/fila (150 → página
1, fila 1 con página de 120 y 20 columnas). En la grilla, `handleJumpChange`
ubica con un debounce de 350 ms y `jumpToNumber` (Enter/Ir) además agrega el
número al set de selección y le da foco al botón.

**4 — observed by reading.** Si el número está vendido o reservado, se muestra
el motivo en el mismo mensaje de error que ya usaba el salto.

**5 — observed by reading.** `ShareButton` ya armaba `/sorteos/<id>`; ahora usa
`window.location.href` cuando está en esa página y cae a la ruta canónica en
cualquier otro caso, así el organizador comparte el enlace de su landing.

## Next

Probar en la landing pública de `a925dacd…` (10.000 números): escribir `00150`,
ver el salto y el resalte, y confirmar con Enter. Después compartir y verificar
que el enlace copiado apunta a ese sorteo.

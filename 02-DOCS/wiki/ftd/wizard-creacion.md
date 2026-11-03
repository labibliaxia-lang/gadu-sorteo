---
author: Gadu
branch: main
status: in-progress
---
# Wizard de creación de sorteos

## Intent

Reemplazar el formulario largo por un asistente de tres pasos que valide por etapa, muestre una
revisión final y mantenga todas las reglas de plan, KYC y generación de números sin cambios en el
servidor.

## Scope

**In:**

- `app/admin/sorteos/nuevo/page.tsx`: wizard visual de tres pasos:
  1. **Básicos**: título, descripción, precio, fecha y cantidad de números.
  2. **Cobro**: método de pago, alias/CBU/banco y WhatsApp; reutiliza la validación condicional de
     transferencia (alias o CBU + WhatsApp).
  3. **Portada y revisión**: resumen de lo cargado, subida de imagen y creación.
- Barra de progreso con estados (paso actual, completado) y botones **Atrás / Continuar**; el submit
  final conserva las validaciones de plan (`maxActiveRaffles`, `maxNumbersPerRaffle`, Mercado Pago
  premium), el bloqueo por KYC y la generación automática de números.
- La vista previa en vivo sigue a la derecha en escritorio y debajo en móvil.

**Out:** backend, base de datos, reglas de plan y flujo de creación (el insert y el RPC no cambian).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Tres pasos con validación por etapa | `trigger(fields)` + render condicional |
| 2 | No se puede avanzar con campos inválidos | Validación de paso 1 y 2 |
| 3 | Revisión final antes de crear | Bloque «Revisión final» en paso 3 |
| 4 | Mismas reglas de plan/KYC | `onSubmit` sin cambios |
| 5 | Gates verdes | typecheck/lint/test/build |

## Evidence

**1, 2 — observado.** `STEP_FIELDS` define los campos de cada paso; `nextStep()` usa `trigger()` y
solo avanza si pasan. El paso 2 valida también el `superRefine` de transferencia (alias/CBU y
WhatsApp).

**3 — observado.** El paso 3 muestra título, fecha, precio/cantidad, cobro y WhatsApp antes de la
portada y del botón «Crear sorteo».

**4 — observado.** `onSubmit` conserva las validaciones dinámicas de plan, la autenticación, el insert
del sorteo y el RPC `create_raffle_numbers` con limpieza si falla.

**5 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Probar el flujo completo en producción: avanzar/volver, errores por paso, crear y
verificar los números generados.

## Next

Comparativa de conversión entre sorteos en el panel global; después, avisos y automatizaciones que
quedaron del backlog.

---
author: Gadu
branch: main
status: in-progress
---
# Bloque crítico de UX (C1–C7)

## Intent

Cerrar las fugas de conversión y confianza detectadas en la auditoría: datos de pago visibles al
reservar, estados pendientes en la cuenta, login que vuelve al sorteo, CTAs según estado y
validaciones que impiden publicar un sorteo imposible de pagar.

## Scope

**In:**

- `components/NumbersGrid.tsx`: el modal de reserva muestra alias/CBU/banco con botón «Copiar»;
  si no hay WhatsApp, el CTA deja de ser un enlace muerto y explica qué hacer. El login guarda
  `next` para volver al sorteo.
- `components/GoogleAuthButton.tsx` + `app/(auth)/login/page.tsx` + `app/auth/callback/route.ts`:
  retorno al sorteo de origen usando una cookie corta `gadu_next` (un solo uso, misma protección
  contra open redirect).
- `app/mis-numeros/page.tsx`: ahora muestra **reservas pendientes** además de los vendidos, con
  vencimiento, badges y botón «Enviar comprobante» por WhatsApp.
- `app/mis-pagos/page.tsx`: agrega «Transferencias y reservas» (confirmadas y pendientes) y suma esos
  importes a las métricas; el estado vacío solo aparece si no hay nada.
- `components/RafflesList.tsx`: filtros Activos / Cerrados / Sorteados y CTA por estado
  («Participar», «Ver detalles», «Ver resultado»).
- Formularios de creación y edición: si el pago es transferencia, exigen alias o CBU y WhatsApp, con
  el error visible debajo del campo.

**Out:** pagos, motor de sorteo, base de datos y flujo de WhatsApp existente (solo se alimenta mejor).

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Datos de transferencia en el modal con copiar | Lectura de `NumbersGrid` |
| 2 | CTA de WhatsApp sin enlace muerto | Rama condicional `summaryWhatsappHref` |
| 3 | Reservas visibles en Mi cuenta | Consulta `reserved_by` + UI |
| 4 | Pagos manuales visibles en Mis pagos | Sección «Transferencias y reservas» |
| 5 | Login vuelve al sorteo | Cookie `gadu_next` + callback |
| 6 | CTA y filtros por estado | `RafflesList` |
| 7 | Validación de transferencia en alta y edición | `superRefine` + mensajes bajo el campo |
| 8 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1, 2 — observado.** El modal existente suma bloque «Datos para transferir» con `CopyRow` y
`navigator.clipboard`; el botón de WhatsApp solo se renderiza si `buildWhatsAppHref` devuelve una URL.

**3 — observado.** `mis-numeros` consulta `sold_to = user OR reserved_by = user` con estados `sold` y
`reserved`, agrupa por sorteo y muestra badge «Pago pendiente», vencimiento y CTA de WhatsApp.

**4 — observado.** `mis-pagos` consulta también `raffle_numbers` y muestra confirmados/pendientes por
sorteo, sumando el importe al total. El vacío requiere que no haya pagos ni transferencias.

**5 — observado.** `GoogleAuthButton` escribe la cookie solo para rutas relativas; el callback la lee,
valida y la borra después de redirigir.

**6 — observado.** `RafflesList` separa los tres estados y cambia href/label: verificar para sorteados,
detalle para cerrados, participar para activos.

**7 — observado.** Ambos esquemas usan `superRefine`: transferencia exige alias o CBU y WhatsApp con al
menos 8 dígitos; los errores se muestran bajo cada campo.

**8 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente.** Probar los flujos reales cuando Vercel deploye: login desde un sorteo, reserva con
transferencia, aparición en Mi cuenta y CTAs de sorteos cerrados/sorteados.

## Next

Sprint alto: barra sticky de compra, temporizadores claros, diálogo accesible, contraste y tap
targets; después prueba social y wizard de creación.

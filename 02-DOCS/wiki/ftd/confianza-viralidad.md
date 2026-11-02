---
author: Gadu
branch: main
status: in-progress
---
# Confianza y viralidad: Muro de Ganadores, compartir boleto y Live FOMO

## Intent

Un sorteo se vuelve creíble cuando se ven ganadores anteriores, y se viraliza cuando el comprador puede
presumir su boleto. Además, ver compras recientes en la home genera urgencia. Este cambio agrega las
tres piezas sin tocar pagos ni el motor de sorteos: solo consultas de lectura y un canal Realtime.

## Scope

**In:**

- `app/ganadores/page.tsx`: página pública con los sorteos `drawn` (hasta 60), foto del primer premio o
  portada, título, fecha, número ganador y nombre abreviado. El apellido completo nunca sale del
  servidor.
- `app/mis-numeros/page.tsx`: botón «Compartir mis números» por boleto. Usa Web Share API y cae a
  WhatsApp si el navegador no la soporta. El texto incluye el sorteo, los números del usuario y el
  enlace; no incluye datos de la cuenta.
- `components/LiveFomo.tsx` + `app/page.tsx`: aviso flotante abajo a la izquierda con las compras
  recientes, agregadas por sorteo en una ventana de 1,5 s. Escucha UPDATE de `raffle_numbers` a
  `sold` (público por RLS) y solo muestra título del sorteo y cantidad: nunca el comprador.
- `components/Navbar.tsx` y `components/Footer.tsx`: enlaces a «Ganadores» / «Muro de Ganadores».

**Out:** pagos, webhook, motor de sorteos, esquema de base (no hay migración) y cualquier dato personal
de compradores o ganadores más allá del nombre abreviado.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | /ganadores lista sorteos drawn con premio, número y nombre abreviado | Lectura + build |
| 2 | El apellido completo no se renderiza ni se envía al cliente | Función `shortWinnerName` en servidor |
| 3 | Compartir boleto funciona con Web Share y con WhatsApp | Lectura de `mis-numeros` |
| 4 | Live FOMO muestra solo sorteo y cantidad | Lectura del componente |
| 5 | Navegación con Ganadores en Navbar y Footer | Lectura |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** La página consulta `raffles` con `status = 'drawn'` ordenada por `drawn_at`; busca
la primera imagen de `prizes` por sorteo y cae a `cover_image_url`. `npm run build` la incluye
(`/ganadores` 189 B).

**2 — observado.** `shortWinnerName` se ejecuta en el Server Component: toma el primer nombre y la
inicial del último apellido («Juan P.»); sin nombre devuelve «Ganador anónimo». El nombre completo
queda en el servidor y no viaja como prop a ningún componente cliente.

**3 — observado.** `shareTicket` arma el texto pedido (sorteo, números, «¡Entra y participa!» y URL),
intenta `navigator.share` y, si no existe o el usuario cancela, abre `wa.me/?text=...`. No usa correo,
teléfono ni id de la cuenta.

**4 — observado.** `LiveFomo` se suscribe a `postgres_changes` (UPDATE, tabla `raffle_numbers`), filtra
`status === 'sold'`, agrupa por `raffle_id` durante 1,5 s, resuelve el título público del sorteo y
muestra un toast de 7 s (máximo 3). No lee `payments` ni el comprador.

**5 — observado.** Navbar suma «Ganadores» y el Footer «Muro de Ganadores» en la columna
«Información».

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendiente de configuración real.** Supabase Realtime solo emite si la tabla está publicada:
habilitar `public.raffle_numbers` en Database → Replication (o `alter publication supabase_realtime
add table public.raffle_numbers;`). Sin eso, el Live FOMO no muestra nada y el resto funciona igual.

## Next

Habilitar Realtime para `raffle_numbers` y probar una compra real. Después: filtrar el muro por premio
o año, y un botón de «compartir ganador» en cada tarjeta del muro.

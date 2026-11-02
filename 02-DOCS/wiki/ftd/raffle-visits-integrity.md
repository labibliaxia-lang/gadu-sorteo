---
author: Gadu
branch: main
status: in-progress
---
# Visitas: que el número signifique algo

## Intent

El hallazgo #5 de la auditoría: el contador de visitas que ve el organizador no medía visitas.

- `app/sorteos/[id]/page.tsx` insertaba una fila en **cada render** de la página pública. Con
  `dynamic = "force-dynamic"`, eso incluye los prefetch del router de Next, las recargas y cada
  visitante repitiendo. El número salía inflado y la «conversión visitas → pago» artificialmente baja.
- La política de `0026` era `with check (true)`: un anónimo podía insertar visitas para **cualquier**
  `raffle_id`, existiera o no, estuviera activo o no. El contador se podía inflar desde fuera sin tocar
  la app.
- El `try/catch` no atrapaba nada: `insert` de supabase resuelve con `{ error }` en lugar de lanzar, así
  que un fallo de RLS o una tabla ausente se perdían en silencio.
- La UI rotulaba «Visitas» y «Conversión visitas → pago» como si fueran medidos y deduplicados.

## Scope

**In:** filtrar los renders que no son navegación real; leer y reportar el error del insert; restringir
la política de inserción a sorteos activos (`0027`); rotular el número por lo que es; una comprobación
nueva en `verificar_esquema.sql` para que la política aplicada sea observable.

**Out (y es lo importante):** la **deduplicación por visitante**. Requiere un identificador —hash de
IP+UA, cookie de sesión— y `0026` decidió explícitamente no guardar datos personales. Cambiar esa
decisión no lo hago yo: es del dueño del producto.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Sólo cuenta navegaciones reales (sin prefetch, `sec-fetch-mode: navigate`) | Leer la página |
| 2 | El error del insert se lee y se registra | Leer la página |
| 3 | La política acepta visitas sólo de sorteos activos | Migración `0027` + verificación en la base |
| 4 | La UI dice «por render» y no promete conversión | Leer el componente |
| 5 | El verificador detecta si `0027` no está aplicada | Corrida del verificador |
| 6 | Gates verdes | typecheck, lint, tests, build |

## Evidence

**1-2 — observed by reading.** `app/sorteos/[id]/page.tsx:38-63`: se leen `next-router-prefetch`,
`sec-purpose` y `purpose` para descartar prefetch, y `sec-fetch-mode` (ausente o `navigate`) para
descartar renders que no son navegación. El insert ya no está envuelto en `try/catch`: se mira
`{ error: visitError }` y se registra con `console.warn`.

**3 — escrito, NO aplicado todavía.** `supabase/migrations/0027_raffle_visits_hardening.sql` reemplaza
la política por `with check (exists (select 1 from public.raffles r where r.id = raffle_visits.raffle_id
and r.status = 'active'))`. El tráfico legítimo no cambia: la página ya sólo inserta para sorteos
activos.

**4 — observed by reading.** `components/admin/AdvancedAnalytics.tsx`: «Embudo: renders → pago» con la
nota «Una visita = una navegación; el mismo visitante cuenta varias veces», tarjetas «Visitas (por
render)» y «Pagos por visita (por render)», y las mismas etiquetas en el CSV. No se toca el cálculo:
sigue siendo `pagos / visitas`.

**5 — escrito, NO ejecutado.** `verificar_esquema.sql` comprobación 17: si la política de `INSERT` no
menciona `raffles`, avisa que el contador se puede inflar desde fuera. Hoy debería decir `AVISO` hasta
que se aplique `0027`.

**6 — observed.** `npm run typecheck` → exit 0 · `npm run lint` → sin warnings · `npm test` → 4
archivos, 32 tests · `npm run build` → exit 0.

**NOT OBSERVED.** No se midió la caída real del contador (hace falta tráfico real y `0027` aplicada), ni
se probó que un anónimo ya no pueda insertar visitas de un sorteo cerrado. Ambas quedan pendientes de la
prueba en la base.

## Next

1. Aplicar `0027` y correr `verificar_esquema.sql`: la comprobación 17 debe pasar de `AVISO` a `OK`.
2. Decidir la deduplicación. Dos caminos honestos:
   - **Hash diario** (`sha256(ip + user-agent + raffle + día)`) en una columna con índice único y
     `on conflict do nothing`. Mide visitantes únicos por día, pero guarda un dato pseudónimo y hay que
     reescribir la promesa de `0026` («no guarda datos personales»).
   - **Analítica del hosting** (Vercel Web Analytics u otro): deja de inventar la métrica en la base.
     Cuesta dinero o dependencia externa, y gana exactitud.
3. Mientras no se decida, la métrica se llama «por render» en la UI y no se usa para calcular precios ni
   comisiones.

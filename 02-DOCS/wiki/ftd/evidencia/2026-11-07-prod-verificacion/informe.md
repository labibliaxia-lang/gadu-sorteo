# Verificación en producción — fases 1-3 (2026-11-07)

Entorno: `https://gadu-sorteo-doci.vercel.app` (deploy de Vercel desde `main`).
Herramienta: plugin de navegador del harness (Chromium). Sin sesión iniciada.

## 1. `/sorteos/auto-2026-demo/resultados`

- HTTP 200. Título: «¡Franco G. ganó auto 2026 (DEMO) en Gadu Sorteos!».
- Podio: puesto 1, Franco G., Premio 1, Nº 0011. Botones «Compartir Resultados» y «Verificar el
  sorteo».
- Captura: `01-resultados.png`.

## 2. `/sorteos/auto-2026-demo/resultados/opengraph-image`

- HTTP 200, `image/png`, 1200×630, 108 KB.
- Texto completo: «RESULTADOS OFICIALES», «¡Tenemos ganador!», «Franco G.», «ganó «auto 2026 (DEMO)»
  con el número 11», «Podio final · resultado verificable».
- Sin problemas de layout ni de fuentes en Satori.
- Captura: `02-og-image.png`.

## 3. `/como-funciona` (simulador, ancla `#demo`)

- Región «Probalo vos mismo: Simulador de Sorteo» visible.
- «Iniciar Simulación» arranca la animación: «Sorteando · Amoladora», número 0094, «Mezclando los
  números vendidos…».
- Resultado final 0007 con podio de tres premios: Amoladora Juan P. Nº 0011, Taladro María G. Nº 0042,
  Cinta métrica Luis D. Nº 0007. Botón «Repetir simulación».
- Capturas: `03-simulador-ruleta.png` y `04-simulador-podio.png`.

## Conclusión

Las tres rutas responden y se ven como corresponde. La ruta `/resultados` es nueva en estas fases, así
que su 200 confirma que el deploy de Vercel incluye el código publicado en `main`.

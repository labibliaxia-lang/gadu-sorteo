# Auditoría E2E — flujo de referidos «destornilladores jacinto»

Fecha: 2026-11-07 (20:55–20:59, America/Argentina/Buenos_Aires)
Entorno: Supabase **staging** `dolxvoxyespguvixhkku` (migración 0120) · app local en
`http://localhost:3001` · build de producción aislado, nunca producción.
Comando: `node runner.mjs F --titulo "destornilladores jacinto"` (evidencia: esta carpeta).

## Veredicto

| Corrida | Pasos | Resultado |
|---|---|---|
| **Final** — árbol de trabajo con las correcciones | 20 | **20 `ok` / 0 `falla`** |
| **Base** — `origin/main` (sin las correcciones) | 20 | 14 `ok` / 6 `falla` |

La corrida final termina **todo en verde**, incluida la consola. La corrida base reproduce los
seis fallos que ya estaban documentados (alta de referidos, podio multipremio y consola).

> Importante: las correcciones que hacen pasar la corrida final están en el **árbol de trabajo,
> sin commitear**. `origin/main` sigue con el código que falla. Desplegar sin commitearlas
> reproduce los 6 fallos.

## Fase 0 — Diagnóstico del enlace de referido

**El código actual usa la ruta corta.** En [app/mis-numeros/page.tsx](../../../../app/mis-numeros/page.tsx)
líneas 241-242:

```ts
const referralLink =
  userId && referralCode ? `${siteBase}/r/${referralCode}` : "";
```

La tarjeta sólo se renderiza si hay sesión, `profiles.referral_code` y **algún sorteo activo con
`referral_enabled = true`** (`userId && referralCode && referralRegla`, línea 364). No existe
fallback al formato largo: si falta el código, la tarjeta se oculta.

El formato largo que se veía antes venía de dos lugares, no de este componente:

1. El código anterior a `90bd31b` (2026-11-07 19:00) armaba `${window.location.origin}/?ref=<UUID>`.
   `git show 90bd31b^:app/mis-numeros/page.tsx` lo confirma.
2. El propio `runner.mjs` abría el enlace largo `/sorteos/[slug]?ref=<UUID>` para probar la captura
   (todavía lo hace el fallback de escenarios viejos).

Por eso el diagnóstico correcto **no es** que la tarjeta esté cayendo al formato largo: es que antes
de la 0120 no había `referral_code` y el enlace era `/?ref=<uuid>`. Hoy no hay camino al UUID largo.

**Prueba en ejecución (corrida final):**

- Tarjeta «Invitá y ganá»: `http://localhost:3001/r/F6D5W4` (`perfil.referral_code = F6D5W4`).
- `/r/F6D5W4` → `307` → `http://localhost:3001/sorteos/destornilladores-jacinto-22eb?ref=F6D5W4`.
- Navegador nuevo (sin cookies) abrió el enlace; al autenticarse, `ReferralCapture` creó el vínculo
  **por UI**, sin service_role: `referrals.referrer_id = 2aedaaf8…`, `referred_id = 523d507e…`.
- La ruta corta también está desplegada en producción: `/r/ABC123` responde `307` a `/` (código
  inexistente), no 404.

**Riesgo de diseño (H-05):** `/r/<code>` resuelve al **sorteo activo más reciente** del organizador
([app/r/[code]/page.tsx](../../../../app/r/[code]/page.tsx), líneas 60-67), no al sorteo que se
estaba compartiendo. En esta corrida acertó porque «destornilladores jacinto» era el último creado.
Si el organizador crea otro sorteo activo después, el mismo enlace corto cambia de destino.

## Resultado por fase (corrida final)

| Fase | Resultado | Evidencia |
|---|---|---|
| **Fase 0** — diagnóstico del enlace corto | ✅ **PASÓ** | `F4b-enlace.json`, `capturas/F04b-mis-numeros-enlace.png`, `F5a-referido.json` |
| **Fase 1** — organizador crea «destornilladores jacinto» (100 números), activa «Invitá y Ganá» (mín. 2 / tope 1), publica compromiso y obtiene el enlace | ✅ **PASÓ** | sorteo `c5a74b9d…` / slug `destornilladores-jacinto-22eb`, 100 números; `referral_enabled=true/2/1`; `F3-principal.json`, `F4-compromiso.json`, `F4b-enlace.json` |
| **Fase 2** — jugador nuevo abre el enlace en contexto limpio y compra 2 números | ✅ **PASÓ** | redirect exacto; 2 números `reserved`; `F5a-referido.json`, `F5b-compra-A.json`, `capturas/F05-compra-A.png` |
| **Fase 3a** — organizador aprueba desde `/admin/notificaciones` | ✅ **PASÓ** | números 1 y 2 pasan a `sold`; notificación `buyer_reservation_approved` a la jugadora; `F7a-aprobacion-A.json`, `capturas/F07-tras-aprobar-A.png` |
| **Fase 3b** — el **jugador** recibe el número 🎁 | ❌ **FALLÓ respecto de este criterio** | el 🎁 (Nº 27 del sorteo bonus) queda a nombre del **referente = organizador** (`sold_to=2aedaaf8…`). La jugadora **no** lo recibe. Es la regla implementada (0102/0105), no un error de ejecución. |
| **Fase 4** — `/r/CODIGO` redirige a `/sorteos/[slug]?ref=CODIGO` y consola limpia | ✅ **PASÓ** | `fila: rewarded=true, rewarded_number=27`; console `0` errores (`F10-consola.json`) |
| Extra de regresión — podio multipremio y hashes | ✅ **PASÓ** | 3 ganadores; `results_hash` no nulo; single y multi 4/4 checks; `capturas/F08-live-final.png`, `capturas/F09-resultados.png`, `F9b-hashes.json` |

**Fase 3b, en una línea:** el producto premia a quien invita, no al invitado. El texto de la tarjeta
lo dice («tu amigo debe comprar… y **vos** recibís uno gratis»). Si el criterio de negocio es que el
premio lo reciba el jugador invitado, hay que cambiar la RPC `reward_referral` y la UI; hoy no ocurre.

## Corrida base (`origin/main`) — qué falló allí

| Paso | Fallo |
|---|---|
| F3 | El wizard muestra «Invitá y Ganá» pero el `INSERT` no guarda `referral_*` ni `bonus_raffle_id`: el sorteo queda `referral_enabled=false/1/0`, `bonus=null`. Se corrige recién desde `/editar`. |
| F8b | `/en-vivo` usaba `execute_transparent_draw` (un ganador) y no `draw_winner_multi`: **0** filas en `raffle_winners` para 3 premios. |
| F9a | `/resultados` mostraba 1 tarjeta, no el podio de 3. |
| F9b | Single 4/4 ✅; multi ❌ porque la base no guardó `results_hash` ni ganadores. |
| F9c | No aparecía el verificador multipremio. |
| F10 | 9 `pageerror` de React en `/en-vivo`: #425 (texto SSR ≠ cliente), #418 y #423. Aislado en el diagnóstico: **sólo** esa página; el resto del recorrido, 0 errores. Causa: `<style>{CEREMONIA_CSS}</style>` comparaba el CSS escapado entre servidor y cliente. |

Las tres correcciones que cierran esos fallos (persistir referidos en el alta, llamar
`drawWinner`/`draw_winner_multi` desde `/en-vivo`, y `dangerouslySetInnerHTML` para el `<style>`)
están en el árbol de trabajo y **no** en `origin/main`.

## Evidencia

- `pasos.json` — 20 filas con esperado/observado y tiempos.
- `hashes.json` — recálculo independiente con `node:crypto`; single y multi 4/4.
- `verificacion-sql.json` — estado crudo en Supabase (100 números, ventas, referidos, códigos).
- `capturas/F04b-mis-numeros-enlace.png` — enlace corto visible.
- `capturas/F05a-enlace-corto-incognito.png` — redirect en navegador nuevo.
- `capturas/F08-live-final.png` — podio de 3 premios.
- `capturas/F09-resultados.png` — resultados oficiales con 3 tarjetas.
- Corrida base: `../2026-11-07-F-destornilladores/` (incluye `diagnostico-consola.txt` con el
  detalle página por página de los errores de hidratación).

## Datos de prueba y limpieza

Todo quedó en **staging**, nunca en producción. La corrida creó cuentas `@gadu.test`, tres sorteos
«destornilladores jacinto — bonus» y tres principales con el título exacto «destornilladores
jacinto»: el de la corrida base (`b2e775bd…`, slug `destornilladores-jacinto`), uno de un intento
que se cortó cuando se cayó el servidor de pruebas (`acbaee2b…`, quedó `active` sin premios) y el
de la corrida final (`c5a74b9d…`, slug `destornilladores-jacinto-22eb`, `drawn`). El sufijo `-22eb`
es sólo para que el slug sea único: el título es el pedido. No se borraron: no hay pedido de
limpieza para staging y sirven de evidencia. Si se quiere dejar impecable, se borran por título más
los `@gadu.test` de estas corridas.

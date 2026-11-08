# Fix F-01 / F-03 — verificación del Escenario F

Fecha: 2026-11-07 · Entorno: Supabase `dolxvoxyespguvixhkku` (migración 0120) · App: build de producción aislado en `http://localhost:3002`
Evidencia: esta carpeta (`pasos.json`, `hashes.json`, `capturas/`, `resultado-f.json`)

## Veredicto

**20/20 pasos `ok`, 0 `falla`.** El suite actual tiene 20 pasos: además del F original se sumaron
F4b/F5a (enlaces cortos `/r/<code>`, ya presentes en la rama). El pedido decía 19; los 20 pasan.

| Fase | Resultado |
|---|---|
| Preparación y staging | ✅ migración 0120, bundles con ref de staging, **0** refs de producción |
| Fase 1 — alta bonus + principal (3 premios) + «Invitá y Ganá» + compromiso | ✅ el alta ya persiste `referral_enabled=true`, mínimo 2, tope 1 y `bonus_raffle_id` |
| Fase 1b — edición idempotente | ✅ la pantalla de edición mantiene la misma configuración |
| Fase 2 — Jugador A por enlace de referido + prepago | ✅ vínculo por UI y 2 números `reserved` |
| Fase 3 — aprobación + número 🎁 | ✅ el número 32 queda para el organizador (referente), como manda 0102/0105 |
| Fase 4 — sorteo en `/en-vivo` | ✅ `drawn`, **3 filas** en `raffle_winners`, animación y podio |
| Fase 5 — resultados, hashes, consola | ✅ podio de 3, hashes single 4/4 y multi 4/4, verificador «Todos los premios coinciden», **0** errores de consola |

## Cambios aplicados

### F-01 — el wizard guarda la configuración de referidos

En [`app/admin/sorteos/nuevo/page.tsx`](../../../../app/admin/sorteos/nuevo/page.tsx) el `INSERT` de
`raffles` ahora incluye:

```ts
referral_enabled: values.referral_enabled,
referral_min_numbers: values.referral_min_numbers,
referral_max_per_user: values.referral_max_per_user,
bonus_raffle_id: values.bonus_raffle_id || null,
```

Antes el paso 3 sólo alimentaba el formulario y la configuración se perdía; únicamente se guardaba
desde `/editar`.

### F-03 — el Live TV usa el motor multipremio

En [`components/LiveDrawAnimation.tsx`](../../../../components/LiveDrawAnimation.tsx), `startDraw()`
ahora invoca la Server Action `drawWinner` (la misma que usa el panel). Esa acción:

- llama `draw_winner_multi` cuando `winners_count > 1` y `draw_winner` cuando hay un solo premio;
- valida dueño, fecha y compromiso;
- notifica a todos los ganadores.

Después del sorteo, el componente lee `raffle_winners` y anima el podio completo.

También se corrigió una **regresión de hidratación** del «Modo Ceremonia»: el `<style>` con el CSS
se renderizaba como texto y React comparaba el CSS escapado del SSR contra el del cliente
(`React error #425`). Se reemplazó por:

```tsx
<style dangerouslySetInnerHTML={{ __html: CEREMONIA_CSS }} />
```

## Evidencia de la corrida

- F8a: `status=drawn`, `winner_number=5`, `raffle_winners=3`, semilla revelada.
- F8b: ganadores `#1 Nº5`, `#2 Nº1`, `#3 Nº6`.
- F9a: 3 tarjetas en `section[aria-label="Podio de ganadores"]`.
- F9b: `commitment`, `numbersHash`, `winner`, `resultHash`, `resultsHash` y cada `winner_hash`
  coinciden con el recálculo independiente (`node:crypto`).
- F9c: verificador público muestra «Todos los premios coinciden».
- F10: **0 errores** de consola y 0 `pageerror`.

Hashes de la corrida:

```
raffle_id      c445d522-4ce4-427e-ac88-52190a3f4edd
commitment     008f9b1033716d82d357e17842c516e2c31a90a3da3cda19b8adf5f2c8e5d937
numbers_hash   7af000de95242c10dbfb646592301ebfed041f461c9532f78a0660a2a1a221b8
result_hash    932928cacada86be653b2a0fb010e24e96f6b869431dab5f81cfda41ced27787
results_hash   a8ff85a65b2bccdd454b658d65410bd2cd24218f4e32e852213df95f287dede0
ganadores      5, 1, 6
```

## Entorno y seguridad

- Staging `https://dolxvoxyespguvixhkku.supabase.co`, migración **0120**.
- 17 chunks, 2 con ref de staging, **0** con `mjgcoeikcyzwojbqtuah` (producción).
- Servidor 3002 con build de producción en una copia aislada; producción no se tocó.
- Única intervención de laboratorio: `draw_date` al pasado después del compromiso
  (`auto_draw=false`), porque el motor exige fecha cumplida.
- Los datos de la corrida quedan sólo en staging.

## Gates

- `npm run typecheck` ✅
- `npm run lint` ✅ (0 warnings)
- `npm test` ✅ **331/331** en 32 archivos
- `next build` ✅ (build aislado con el fix)

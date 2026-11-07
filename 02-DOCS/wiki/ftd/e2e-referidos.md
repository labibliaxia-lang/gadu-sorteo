---
author: Gadu
branch: main
status: in-progress
---
# E2E de referidos («Invitá y Ganá») con sesión inyectada

## Intent

Probar de punta a punta el circuito de referidos sin depender de Google OAuth: crear sorteos como
organizador, obtener el enlace con `?ref=`, comprar como invitado, aprobar la reserva y comprobar en
base que el referente recibe su número premio (`origin = 'premio'`) en el sorteo bonus.

## Scope

**In:** los tres arreglos del barrido (404 por slug, 401 del tracker, contraste del chip) y el script
E2E con inyección de sesión.

**Out:** webhook de Mercado Pago, motor de sorteos, planes y cualquier migración de base.

## Cómo se corrió

Script: [`01-TOOLS/SIMULADOR/e2e-referidos.mjs`](../../../01-TOOLS/SIMULADOR/e2e-referidos.mjs), por
etapas (`setup`, `crear`, `comprar`, `aprobar`, `premio`, `verificar`), contra `localhost:3000`.

- **Cuentas sintéticas** (Admin API con `email_confirm`): `e2e.organizador@gadu.test` y
  `e2e.invitado@gadu.test`. Perfiles preparados por service role: rol `admin`, KYC aprobado, datos
  personales y DNI cargados (el trigger `enforce_organizer_kyc` los exige), términos aceptados.
- **Sesión inyectada**: `session.mjs` hace `signInWithPassword` y deja la cookie `sb-<ref>-auth-token`
  en el contexto de Playwright. Es la misma intervención declarada que ya usaba el simulador.
- **Sorteos por UI real**: wizard completo (básicos → cobro → portada), incluida la casilla de bases
  legales (0113) y la de «no publicar en el listado» (0079).
- **Compra por UI real**: enlace con `?ref=`, dos números, portón de bases legales del sorteo y
  portón de dirección de entrega.
- **Aprobación por UI real**: `/admin/notificaciones` → «Aprobar».
- **Premio**: RPC `reward_referral`, la misma que llama la aprobación en
  `app/admin/notificaciones/actions.ts`.

## Resultado

| Etapa | Observado |
|---|---|
| Cuentas | organizador `48f1c5c8…`, invitado `207be03d…` |
| Sorteos | principal `b34847fe…` (slug `e2e-referidos-principal-bbe0`), bonus `7a17e4db…` |
| Captura del enlace | **falla**: el INSERT de `ReferralCapture` devuelve 403 (ver H1); el vínculo se creó por SQL para poder seguir |
| Compra | **ok**: números 1 y 2 `reserved` a nombre del invitado |
| Aprobación | **ok**: números 1 y 2 `sold` al invitado |
| Premio | **ok**: `rewarded=true`, número **33** en el bonus, `origin='premio'`, `sold_to` = organizador |
| Idempotencia | **ok**: segunda llamada a la RPC devuelve `null` (no duplica) |

## Hallazgos

### H1 — Crítico: el referido no se puede registrar (falta GRANT en `referrals`)

El POST de `ReferralCapture` a `/rest/v1/referrals` vuelve **403** con:

```
{"code":"42501","message":"permission denied for table referrals",
 "hint":"Grant the required privileges to the current role with: GRANT INSERT ON public.referrals TO authenticated"}
```

En la base: `anon_insert = false`, `auth_insert = false`, `auth_select = false` y la tabla **no tiene
ninguna política**. La migración 0041 cerró los permisos y 0103 no los restauró. Con esto, **ningún
usuario real puede generar un vínculo de referido**: todo el «Invitá y Ganá» queda muerto en el
primer paso, en silencio (el componente sólo ignora el error).

Arreglo propuesto (fuera del alcance autorizado, no aplicado): una migración con
`GRANT INSERT, SELECT ON public.referrals TO authenticated` y políticas mínimas:
`INSERT` sólo con `referrer_id` existente, `referred_id = auth.uid()` y `referrer_id <> auth.uid()`;
`SELECT` sólo de las filas propias.

### H2 — Medio: el sorteo bonus se crea `paused` y eso anula el premio

El segundo sorteo creado por el organizador quedó en `paused`. `reward_referral` exige que el destino
sea del mismo organizador y esté `active`/`closed`; con `paused` devuelve `null` y **la aprobación no
premia**. Se activó el bonus por SQL y se reintentó la RPC: otorgó el 33.

Queda la pregunta de producto: ¿el sorteo bonus debe consumir el cupo de sorteos activos del plan, o
debería crearse ya activo? Mientras no se decida, el premio puede no otorgarse nunca al aprobar.

### H3 — Medio: no hay UI para configurar referidos

`referral_enabled`, `referral_min_numbers`, `referral_max_per_user`, `referral_require_buyer_min` y
`bonus_raffle_id` no se editan desde ningún formulario del panel. El script los escribió por service
role (intervención de laboratorio declarada). Un organizador real hoy no puede activar el beneficio
sin tocar la base.

## Lo que sí quedó probado

- El wizard de creación funciona de punta a punta con una cuenta sintética (KYC + bases legales).
- La sesión inyectada se comporta igual que una sesión real: el invitado pudo reservar, aceptar bases
  y guardar dirección de entrega.
- La aprobación manual marca los números `sold` y dispara `premiarReferidos`.
- La RPC de premio respeta el bonus, marca `origin='premio'` y es idempotente.

## Datos de prueba

- Cuentas `@gadu.test`, dos sorteos **deslistados** (`is_listed = false`) y dos números vendidos en el
  proyecto configurado en `.env.local` (ref `mjgcoeikcyzwojbqtuah`). No hay datos de pago reales.
- Claves: no se imprimieron. La service key vigente se pidió a la API de gestión en memoria porque la
  del `.env.local` no se usa acá; la inyección de sesión corrió sólo contra localhost.

## Segunda corrida — staging (2026-11-07, «Escenario E»)

Entorno: `dolxvoxyespguvixhkku` (staging), servidor local en `:3001`, `--env-file=.env.test.local`.
Migración `0118_referrals_grants.sql` aplicada y verificada en su ledger.

| Etapa | Resultado en staging |
|---|---|
| Cuentas | organizador `edf88057…` (plan `premium`, KYC aprobado) · invitado `0d42ca33…` |
| Sorteos | principal `ac3b5eda…` · bonus `1ee1de86…` (el trigger 0118 lo dejó `active`) |
| Captura del enlace | **ok, sin 403** (dos `409` por intento duplicado: choque con el unique, esperado) |
| Compra | **ok**: números 1 y 2 `reserved` → `sold` |
| Aprobación | **ok**: premio otorgado en el mismo paso — `rewarded=true`, **número 43** |
| Premio | `origin='premio'`, `status='sold'`, `sold_to` = organizador; RPC manual devolvió `null` (idempotente) |

Evidencia: `evidencia/2026-11-07-e2e-referidos/staging-escenario-E.json` y `pasos.json`.

**Veredicto sobre el bug:** es real. En producción el POST de captura devolvía `403 42501` (faltaban
GRANT y política) y el bonus quedaba `paused`, así que la aprobación nunca premiaba. Con 0118 en
staging el circuito pasa completo y premia **sin intervención**.

### Reanudación tras reinicio (misma fecha) — corrida limpia

Se repitió el Escenario E desde cero con cuentas nuevas (`--fresh`): organizador `811e02a0…`, invitado
`c06d052d…`, principal `baef2bcb…` (slug `e2e-referidos-principal-69de`) y bonus `b16ca592…`.

- Compra: números 1 y 2 → `reserved` → `sold`.
- Aprobación: premio otorgado en el mismo paso, **número 1** del bonus.
- Base: `rewarded=true`, `rewarded_number=1`, `origin='premio'`, `sold_to` = organizador, bonus `active`.
- Segunda llamada a la RPC: `null` (idempotente).

**Veredicto final: el premio de referidos sí se otorga**, automáticamente al aprobar la reserva,
con la migración 0118 aplicada. Evidencia: `staging-escenario-E-fresh.json` y `pasos.json`.

Correcciones aplicadas al script para esta corrida: plan `premium` para la cuenta de prueba, cobro
`transferencia` elegido por `value` (no por posición del radio), verificación SQL por `pg` con
`DATABASE_URL` del entorno (el token de gestión no ve staging) y `--env-file` con candado que rechaza
producción.

## Next

1. Aplicar `0118_referrals_grants.sql` a producción (requiere autorización): es el arreglo real de H1/H2.
2. Repetir el E2E contra producción después de aplicarla.
3. Cosmético: `ReferralCapture` dispara el insert más de una vez y el segundo choca con el unique
   (`409`); conviene deduplicar en el cliente.

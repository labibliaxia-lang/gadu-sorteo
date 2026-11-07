# Guardarraíles de arquitectura

Documento corto y operativo. Si una tarea rompe una de estas reglas, **no se
mergea**, aunque la feature funcione.

## Reglas de Oro

1. **La base manda.** Un límite, un permiso o una regla de negocio se valida en
   `supabase/migrations/` (trigger, RPC o RLS), no solo en la UI. La UI puede
   fallar; la base no.
2. **La RLS no se toca sin verificador.** Todo cambio de políticas se acompaña
   de un `supabase/tests/verificar_*.sql` que pruebe: dueño sí, tercero no,
   superadmin sí, `anon` no.
3. **El webhook de Mercado Pago valida HMAC antes de leer el body.** Sin firma
   válida responde 401 y no toca `payments`. Nunca se confía en el payload para
   aprobar un pago.
4. **El dinero se mueve solo por caminos explícitos:** webhook verificado,
   aprobación manual del organizador o registro manual de pago. Ningún cliente
   escribe `payments` ni `raffle_numbers` para marcar vendido.
5. **Los números vendidos no se tocan desde el cliente.** Reservas y ventas
   pasan por RPC (`reserve_numbers`, `reserve_numbers_prepaid`,
   `organizer_register_payment`).
6. **Un rol no se hereda.** Nadie es `admin` sin aprobación manual del
   Superadmin y KYC aprobado (0112 + `enforce_organizer_kyc`).
7. **Un sorteo no se publica sin bases legales aceptadas** (0114). El candado
   está en la base y aplica a cualquier usuario autenticado, incluso por API.
8. **La PII no se publica.** El muro de ganadores y los metadatos muestran
   nombre + inicial. Nunca email, teléfono, DNI ni dirección.
9. **Las migraciones son idempotentes** (`if not exists`, `do $$`, `on conflict
   do nothing`) y **cada una registra su versión** en `_applied_migrations`.
10. **Un cambio de esquema se verifica contra la base real**, no contra el repo
    (ver `02-DOCS/wiki/sdd/decisions.md`, caso 0097).

## Archivos intocables o de cuidado extremo

| Archivo | Regla |
|---|---|
| `lib/supabase/admin.ts` | **Solo servidor.** Nunca se importa desde un componente `"use client"`. Usa la service role: expone toda la base |
| `app/api/webhooks/mercadopago/route.ts` | La verificación HMAC va primero; no moverla ni envolverla en try/catch que la saltee |
| `supabase/migrations/*` | No se editan migraciones ya aplicadas. Se agrega una nueva |
| `lib/plans.ts` + `plan_configs` | La UI refleja límites; la base los aplica. Si cambia un límite, se toca la tabla, no el trigger a mano |
| `lib/confianza.ts` / `cobros` | Tocan dinero y confianza: cambio con verificador y revisión |
| `components/NumbersGrid.tsx` | Flujo de compra: cualquier cambio se prueba en navegador (reserva + prepago) |

## Cómo correr los tests antes de cada commit

```bash
npm run typecheck
npm run lint          # debe dar 0 warnings
npm test              # incluye invariantes de seguridad y contrato con migraciones
npm run build
```

Los cuatro los corre **CI en cada push a `main` y en cada PR**
(`.github/workflows/ci.yml`, job `gates`). Si uno falla, el PR queda rojo.

**Verificadores de base** (se corren a mano en el SQL Editor, transacción con
ROLLBACK): `supabase/tests/verificar_*.sql`. Los vigentes están listados en el
handoff del día.

## Qué cubre la suite

| Área | Archivos |
|---|---|
| Reservas y números | `lib/raffle-numbers.test.ts`, invariantes de colisión |
| Webhook y pagos | `lib/mercadopago.test.ts`, `lib/payments.test.ts`, invariantes HMAC |
| Roles y RLS | `lib/security-invariants.test.ts`, `lib/guardrails-invariants.test.ts` |
| Motor de sorteo | `lib/draw-verify.test.ts`, `lib/draw-verify.simulacion.test.ts` |
| Planes y precios | `lib/plans.test.ts` |
| Bases legales | `lib/terms.test.ts`, `lib/raffle-terms.test.ts` |
| Notificaciones | `lib/security-invariants.test.ts` |
| Migraciones | `lib/migrations.test.ts` (contrato código ↔ SQL) |

## CI/CD: bloquear el despliegue

- GitHub Actions corre `typecheck → lint → test → build` en `main` y en PR.
- **Para que Vercel no despliegue código rojo**, activar en GitHub:
  *Settings → Branches → Branch protection rule → main → Require status checks
  → `gates`*. Así el merge (y por lo tanto el push a `main`) queda bloqueado
  hasta que los cuatro pasen.
- Vercel despliega por su cuenta al recibir un push a `main`; no depende de
  GitHub Actions. La protección efectiva es la de arriba: nadie puede pushear a
  `main` sin los checks. Un push directo con permisos de bypass sigue siendo
  posible: se mitiga con revisión obligatoria.
- **Pendiente de infraestructura**: para que Vercel espere a CI de forma nativa
  hace falta habilitar "Ignored Build Step" con un chequeo a la API de GitHub o
  pasar a un flujo de despliegue manual desde CI. No se cambió en esta tarea.

## Si encontrás un bug mientras escribís tests

No se arregla en la misma tarea. Se anota en el handoff con: síntoma, archivo,
cómo reproducirlo y qué prueba falta. La corrección entra como cambio aparte.

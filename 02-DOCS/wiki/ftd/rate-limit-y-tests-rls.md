---
author: Gadu
branch: main
status: in-progress
---
# Rate limiting y prueba de aislamiento RLS

## Intent

Faltaba frenar abuso (reservas masivas, spam de emails) y una forma repetible de comprobar que un
organizador no puede ver ni modificar datos de otro. Vercel no comparte memoria entre invocaciones,
así que el límite vive en Postgres.

## Scope

**In:**

- `supabase/migrations/0040_rate_limits.sql`: tabla `rate_limits`, función atómica
  `check_rate_limit(key, max, ventana)` (solo service_role) y `reserve_numbers_prepaid` con máximo
  20 reservas por hora por usuario.
- `lib/rate-limit.ts`: `allowRateLimitedAction` para Server Actions; fail-open si la migración no
  está aplicada (no bloquea usuarios por un problema de infraestructura).
- `app/sorteos/actions.ts`: máximo 5 avisos de reserva cada 10 minutos por cuenta antes de enviar
  emails.
- `app/api/cron/release-reservations/route.ts`: limpia ventanas de más de 7 días y reporta
  `rateLimitCleanup`.
- `supabase/tests/rls_aislamiento.sql`: prueba manual de aislamiento entre dos organizadores
  (sorteos, números, premios, pagos y un intento de update), con rollback al final.

**Out:** rate limiting en login (lo maneja Supabase Auth), CAPTCHA, WAF y cambios en pagos.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Límite atómico en base | Migración 0040 |
| 2 | Reservas limitadas por usuario | Función `reserve_numbers_prepaid` |
| 3 | Emails de reserva limitados | `notifyReservation` |
| 4 | Limpieza desde el cron | Ruta del cron |
| 5 | Prueba de aislamiento ejecutable | Script SQL con asserts |
| 6 | Tipos, lint, tests y build limpios | Los cuatro gates |

## Evidence

**1 — observado.** `check_rate_limit` incrementa con `insert ... on conflict do update` y reinicia la
ventana cuando expiró; devuelve `count <= max`. Solo `service_role` puede ejecutarla.

**2 — observado.** El RPC de reservas llama `check_rate_limit('reserve:' || uid, 20, 3600)` antes de
tocar los números; el mensaje de error es explícito.

**3 — observado.** `notifyReservation` consulta `check_rate_limit` con clave por usuario (5/600 s)
antes de mandar los dos emails.

**4 — observado.** El cron borra `rate_limits` con `window_start` de más de 7 días y devuelve
`rateLimitCleanup`.

**5 — observado.** El script cambia a `role authenticated` con el JWT simulado de A y verifica con
`raise exception` que no vea sorteos, números, premios ni pagos de B, y que un update sobre números de
B afecte 0 filas. Termina con `rollback`.

**6 — observado.** `npm run typecheck` → 0. `npm run lint` → `✔ No ESLint warnings or errors`.
`npm test` → 38/38. `npm run build` → 0.

**Pendientes.** Aplicar `0040` y ejecutar `supabase/tests/rls_aislamiento.sql` con dos organizadores
reales. La prueba de RLS es manual: el CI no tiene credenciales de la base y no debe tenerlas.

## Next

Ejecutar la prueba de aislamiento y documentar el resultado; después, legal (sección de planes en
Términos, datos fiscales) y acabado visual (ayuda/status, sitemap/robots).

---
author: Gadu
branch: main
status: in-progress
---
# Trigger de profiles: proteger sin mirar el rol de conexión

## Intent

La auditoría del panel dejó un hallazgo **a verificar** (el #2): la versión de `0025` que estaba sin
commitear quitaba `security definer` al trigger `prevent_sensitive_self_update` y añadía una exención
por nombre de rol:

```sql
if current_user::text not in ('anon', 'authenticated', 'service_role') then
  return new;
end if;
```

Con PostgREST esto funciona, porque cada petición hace `SET ROLE` según el claim del JWT. Pero convierte
la protección en algo que **depende del rol con el que se conecta el cliente**: si un día el proyecto
usa otro rol (pooler en modo sesión, un rol propio, `postgres` por error), el trigger no falla: deja de
proteger **en silencio**. Un control que deja de controlar sin avisar es peor que no tenerlo, y este
protege el paywall (`plan`) y el KYC (`verification_status`, `dni_verified`, `face_verified`).

Objetivo: que la protección dependa de si hay un usuario final actuando, no del nombre del rol.

## Scope

**In:** la función `prevent_sensitive_self_update` de `0025` (se elimina la exención por
`current_user`, se conserva `SECURITY INVOKER` y el orden de comprobaciones); un script de prueba
ejecutable en `supabase/tests/0025_profiles_hardening.sql`; el commit de la migración, que estaba
modificada sin commitear (git y el working tree tenían versiones distintas del mismo archivo).

**Out:** la prueba del camino de canje de licencias de `0022` (necesita un código real y dos sesiones);
una función SQL `demote_superadmin` (ver el FTD de superadmin); cualquier cambio en las políticas RLS,
que ya limitan la escritura a la fila propia.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El trigger ya no consulta `current_user` | Leer la función |
| 2 | La exención es «no hay usuario final» (`auth.uid() is null`) | Leer la función |
| 3 | El camino de `0022` sigue funcionando (limpia los claims) | Leer `0022:258-259` y el orden nuevo |
| 4 | Existe un script que demuestra los 7 casos, sin dejar cambios | `supabase/tests/0025_profiles_hardening.sql` |
| 5 | La migración está commiteada, no sólo en el working tree | `git status` limpio para ese archivo |
| 6 | Nada de la app se rompe | typecheck, lint, tests, build |

## Evidence

**1-3 — observed by reading.** `supabase/migrations/0025:34-60`: la función es `SECURITY INVOKER` (sin
`security definer`), no menciona `current_user`, y empieza por `if auth.uid() is null then return new`.
El caso del canje de licencias sigue exento porque `0022:258-259` limpia `request.jwt.claim.sub` y
`request.jwt.claims` antes de escribir, así que `auth.uid()` es null dentro de esa transacción.

**4 — escrito, NO ejecutado.** `supabase/tests/0025_profiles_hardening.sql` recorre siete casos dentro
de una transacción que termina en `ROLLBACK`:

1. un usuario no puede ponerse `plan='premium'`;
2. no puede aprobarse el KYC;
3. sí puede volver el KYC a `pending`;
4. no puede aprobarse una solicitud de organizador;
5. sí puede abrir su solicitud;
6. sin usuario final (servidor) la escritura pasa;
7. **con claims de usuario sobre un rol privilegiado que saltea RLS, el trigger sigue bloqueando**.

El caso 7 es la prueba del hallazgo. **No pude ejecutarlo:** no hay Docker ni `psql` en esta máquina y el
proyecto apunta a un Supabase remoto (`mjgcoeck…`, host del `.env.local`); correr el script contra su
base requiere pegar el archivo en el SQL Editor. Los resultados reales siguen pendientes.

**5 — observed.** La migración entra en el mismo commit que este documento.

**6 — observed antes y después del cambio, sin variación:** la migración es SQL, no la ejecutan los
gates; `npm run typecheck`, `npm run lint`, `npm test` (27 tests) y `npm run build` verdes en el mismo
árbol.

## Next

Pegar `supabase/tests/0025_profiles_hardening.sql` en el SQL Editor del proyecto y leer los `NOTICE`:
el único aceptable es `OK` en los siete casos. Si el caso 7 dijera `FALLO`, la protección de `plan` y
KYC no se está aplicando y hay que revisar qué rol abre las conexiones.

---
author: Gadu
branch: main
status: in-progress
---
# Trigger de profiles: la protección que existía en el repo y no en la base

## Intent

La auditoría del panel dejó un hallazgo a verificar: la versión de `0025` sin commitear eximía por
nombre de rol (`current_user not in ('anon','authenticated','service_role')`). Con PostgREST funciona,
pero si el proyecto conecta con otro rol la protección del paywall y del KYC desaparece **en silencio**.

Lo que empezó como «verificar la semántica de un trigger» terminó destapando algo más grande: **la
protección no estaba aplicada en la base**. No era una discusión sobre `current_user`; era una migración
a medias.

## Scope

**In:** el cuerpo de `prevent_sensitive_self_update` en `0025` (sin exención por rol de conexión); dos
scripts de prueba ejecutables; la aplicación de la migración en el proyecto.

**Out:** el ledger de migraciones (ver «deuda de proceso» al final); una función SQL
`demote_superadmin`; cualquier cambio en políticas RLS.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | El trigger no consulta `current_user` | Leer la función |
| 2 | La exención es «no hay usuario final» (`auth.uid() is null`) | Leer la función |
| 3 | Un script devuelve el veredicto de cada caso en una celda | Corrida real |
| 4 | Un script diagnostica por qué no bloquea, si no bloquea | Corrida real |
| 5 | La migración está aplicada y el trigger enganchado | `pg_trigger` |
| 6 | Bloquea el cambio de plan propio aun con rol privilegiado | Caso A de la corrida final |
| 7 | No rompe cambios legítimos ni el servidor | Casos B y C |

## Evidence

**1-2 — observed by reading.** `supabase/migrations/0025:41-54`: `SECURITY INVOKER`, sin mención de
`current_user`, primera condición `if auth.uid() is null then return new`. El canje de licencias sigue
exento por la vía correcta (`0022:258-259` limpia los claims antes de escribir).

**3 — observed, y su primer resultado fue el hallazgo.** El script de 7 casos
(`supabase/tests/0025_profiles_hardening_report.sql`, tras dos fallos propios: `42501` por una tabla
temporal ajena al rol `authenticated`, y `42P01` por depender del search_path) devolvió:

```text
1 FALLO -> el usuario se puso plan=premium
2 FALLO -> el usuario se aprobó su verificación
3 OK -> pudo volver el KYC a pending
4 FALLO -> el usuario aprobó su solicitud
5 OK -> pudo abrir su solicitud
6 OK -> el servidor pudo escribir
7 FALLO -> la protección depende del rol de conexión
```

Los casos 1, 2 y 4 «funcionaron» de más: el `UPDATE` afectó 1 fila. Como RLS usa `auth.uid()`, eso probó
que los claims llegaban bien y que la exención por «sin usuario final» no era la causa.

**4 — observed.** `supabase/tests/0025_diagnostico.sql` (reescrito una vez: un `CASE` no evita que el
planificador resuelva un nombre inexistente) devolvió:

```json
{
  "auth_uid": "378bfac9-…", "es_superadmin": false,
  "triggers_en_profiles": [ { "trigger": "prevent_role_self_update", "funcion": "prevent_role_self_update" } ],
  "funciones_prevent_existentes": [
    { "nombre": "prevent_role_self_update", "security_definer": true, "lineas": 10 },
    { "nombre": "prevent_sensitive_self_update", "security_definer": false, "lineas": 57 }
  ],
  "tabla_de_migraciones_del_cli": null
}
```

**La función existía; el trigger no estaba enganchado.** `0025` se había aplicado a medias: nadie
ejecutaba la lógica. No era un problema de `current_user`, era una migración incompleta — y sin ledger
(`supabase_migrations` no existe) no había forma de saberlo leyendo el repositorio.

**5 — observed after applying `0025` complete.** `pg_trigger` sobre `public.profiles` devuelve ahora dos
triggers: `prevent_role_self_update` y `prevent_sensitive_self_update`.

**6-7 — observed.** Tres comprobaciones sobre la base ya migrada
(`A` con claims de usuario y rol privilegiado que saltea RLS; `B` cambio legítimo; `C` sin usuario final):

```text
A OK -> No tenés permisos para cambiar tu plan
B OK -> el cambio legítimo pasa
C OK -> el servidor puede escribir
```

`A` es la prueba del hallazgo: la protección no depende del rol de conexión. `B` y `C` prueban que no se
rompió nada — ni el flujo de subir documentos ni el canje de licencias, el panel, el webhook o el cron.

## Deuda de proceso, no de código

`tabla_de_migraciones_del_cli` es `null`: las migraciones se aplican a mano en el SQL Editor y no queda
registro de qué corrió. Por eso `0025` pudo quedar a medias sin síntoma — y por eso una auditoría que
sólo lee archivos puede afirmar que algo está protegido cuando no lo está.

Primera respuesta, mientras no haya ledger: `supabase/tests/verificar_esquema.sql` compara lo que el
repositorio declara con lo que hay en la base y devuelve una celda con `OK` / `FALTA` / `AVISO` /
`CRÍTICO`. Cubre los dos triggers de `profiles`, el cuerpo del trigger sensible, RLS de las tablas del
dominio, funciones clave, el grant de `sell_numbers`, la política de auditoría, `superadmin_metrics`,
licencias, índices de `0025` y columnas sensibles. Corre en segundos y no modifica nada.

Segunda respuesta, cuando se quiera cerrar del todo: `supabase link` + `supabase db push`, o una tabla
`_applied_migrations(version text primary key, applied_at timestamptz)` que cada archivo inserte al final.

## Next

Correr `verificar_esquema.sql` después de cada migración, y aplicar el mismo criterio a las que ya
están: comprobar en `pg_trigger` / `pg_proc` / `information_schema` que lo declarado existe, en vez de
leer sólo el archivo.

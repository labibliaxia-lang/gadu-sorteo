---
author: Gadu
branch: main
status: in-progress
---
# Segundo factor y llaves de acceso (passkeys)

## Intent

Cerrar el hueco real del panel —hoy se abre con solo tener la sesión de Google— sin romper el
acceso que ya funciona, y sumar el acceso con llave de acceso (WebAuthn) para quien lo quiera.

Los passkeys **no** reemplazan a Google: `registerPasskey()` exige un usuario ya creado y
confirmado. Google sigue siendo el alta y la recuperación; el passkey es una puerta más, resistente
a phishing. Por eso la parte que protege el dinero es el **segundo factor del panel**, no el passkey.

## Scope

**In:**

- `lib/flags.ts`: `PASSKEYS_ENABLED` (`NEXT_PUBLIC_PASSKEYS_ENABLED`) y `adminMfaRequired()`
  (`ADMIN_MFA_REQUIRED`).
- `lib/mfa.ts` + `lib/mfa.test.ts`: decisión pura del gate (`ok` / `enroll` / `verify`).
- `app/seguridad/page.tsx`: pantalla de seguridad, **fuera de `/admin` a propósito**.
- `components/security/MfaPanel.tsx`: alta del factor TOTP (QR + secreto), verificación por código,
  baja del factor.
- `components/security/PasskeysPanel.tsx`: registrar, listar y **revocar** llaves (el SDK expone
  `auth.passkey.list/delete`).
- `components/PasskeyLoginButton.tsx` + `components/LoginForm.tsx` + `app/(auth)/login/page.tsx`:
  botón «Entrar con llave de acceso» y registro de la aceptación de Términos en ese camino.
- `app/admin/layout.tsx`: redirección a `/seguridad` cuando falta el factor y flag activo; aviso
  cuando el flag está apagado.
- `lib/auth.ts`: el mismo gate en las Server Actions (`requireAdminSession`), que no pasan por el
  layout.
- `.env.example`, `package.json` (piso `^2.118.0`), `app/privacidad/page.tsx`, enlace en `/perfil`.

**Out:**

- Passkey como factor obligatorio y retiro de la clave maestra de `/admin/super` (fase siguiente).
- MFA por SMS (requiere proveedor pago).
- Migraciones SQL: los factores y los passkeys viven en Supabase Auth, no en el esquema público.
- Previews de Vercel y `localhost` con passkeys: el origen tiene que colgar del Relying Party ID, y
  el dominio actual es `gadu-sorteo-doci.vercel.app`.

## Decisiones

1. **Todo apagado por defecto.** `ADMIN_MFA_REQUIRED=false` y `NEXT_PUBLIC_PASSKEYS_ENABLED=false`:
   el código se despliega sin cambiar el comportamiento de nadie.
2. **El enrolamiento vive fuera del panel.** Si `/seguridad` colgara de `app/admin/*`, el layout que
   exige `aal2` la cerraría y el usuario sin factor quedaría en un bucle de redirecciones.
3. **Bloquear el panel es preferible a dejarlo abierto, pero solo cuando el dueño lo pidió.** Un
   `ADMIN_MFA_REQUIRED` activado antes de habilitar MFA en Supabase deja el panel cerrado: se
   documenta como bloqueo esperado, no como agujero.
4. **La clave maestra no se toca.** Sigue siendo el segundo factor de `/admin/super`; el TOTP se
   suma para todo el panel. Retirarla es una decisión aparte, con su propia migración de confianza.

## Checklist

| # | Task | Proof it is done |
|---|------|------------------|
| 1 | Gate puro y testeado | `lib/mfa.test.ts` — 5 casos, incluido «flag apagado deja pasar» |
| 2 | Página de seguridad accesible sin factor | `/seguridad` no cuelga de `app/admin/*`; compila en el build |
| 3 | Alta del factor TOTP | `mfa.enroll({factorType:'totp'})` + QR como imagen de datos |
| 4 | Verificación y `aal2` | `mfa.challengeAndVerify()` + `router.refresh()` para releer el nivel |
| 5 | Gate en páginas | `app/admin/layout.tsx` redirige con `gate !== 'ok'` |
| 6 | Gate en Server Actions | `getAdminSession()` devuelve `null` sin `aal2` con el flag activo |
| 7 | Aviso sin flag | Banda ámbar en el panel con enlace a `/seguridad` |
| 8 | Login con passkey | `signInWithPasskey()` y redirección a `next` validado |
| 9 | Términos en el camino nuevo | `acceptTerms()` después del acceso (ese camino no pasa por `/auth/callback`) |
| 10 | Revocación de llaves | `auth.passkey.delete({passkeyId})` en `/seguridad` |
| 11 | Fallback honesto | Sin WebAuthn o sin flag, el bloque no se dibuja; Google queda siempre |
| 12 | Gates del proyecto | `typecheck` + `lint` + `tests` (132) + `build` verdes |

## Activación (orden obligatorio)

1. **Dominio primero.** Si el proyecto va a tener dominio propio, fijarlo **antes** del primer
   enrolamiento: el Relying Party ID no se puede cambiar sin invalidar todas las llaves.
2. Supabase → Authentication → **Passkeys**: activar y cargar *Relying Party ID* (dominio pelado) y
   *Origins* (con `https://`).
3. Supabase → Authentication → **Multi-Factor Auth**: habilitar TOTP.
4. `NEXT_PUBLIC_PASSKEYS_ENABLED=true` y redesplegar (es una variable de build).
5. Cada cuenta `admin`/`superadmin` enrola su factor en `/seguridad`.
6. Recién entonces `ADMIN_MFA_REQUIRED=true` y redesplegar.

## Riesgos y límites

- **Passkeys en Supabase son experimentales**: la API puede cambiar. El checkout no depende de
  ellos y el botón se apaga con una variable.
- **Passkey no protege una cuenta de Google comprometida** mientras Google siga habilitado. Lo que
  protege es el paso 6.
- **La adopción de passkeys será parcial.** El valor de seguridad está en el TOTP de pocas cuentas,
  no en el porcentaje de jugadores que enrolen.
- **Local y previews no prueban passkeys.** Hay que probar contra el dominio de producción.

## Next steps

- Retirar la clave maestra compartida cuando todas las cuentas superadmin tengan TOTP (fase 3).
- Passkey como **factor** de MFA (`factorType: 'webauthn'`) para el panel.
- Revisar el `npm audit`: `next` (crítico, DoS del optimizador de imágenes) sigue abierto.

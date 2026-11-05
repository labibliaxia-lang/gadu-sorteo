---
author: Gadu
branch: main
status: pending
---
# Prueba de humo: segundo factor y llaves de acceso

## Para qué

Los cuatro gates del CI prueban que el código compila y que la lógica pura del gate decide bien.
**No** prueban lo único que importa acá: que Supabase emita `aal2`, que la ceremonia WebAuthn
termine en una sesión y que el panel cierre cuando debe. Eso se verifica a mano, una vez, contra el
dominio real.

`localhost` no sirve para passkeys: el origen tiene que colgar del Relying Party ID.

## Antes de empezar

- [ ] Dominio definitivo decidido (si cambia después, todas las llaves mueren).
- [ ] Supabase → Authentication → **Passkeys** activo, con RP ID y Origins del dominio real.
- [ ] Supabase → Authentication → **Multi-Factor Auth** → TOTP habilitado.
- [ ] Variables desplegadas: `NEXT_PUBLIC_PASSKEYS_ENABLED=true`, `ADMIN_MFA_REQUIRED=false`.
- [ ] Una cuenta de prueba con rol `admin` que **no** sea la del dueño, más la cuenta superadmin.

## Casos

| # | Caso | Pasos | Resultado esperado |
|---|------|-------|--------------------|
| 1 | Login con Google sigue igual | Entrar en `/login` con Google | Sesión normal, sin pedir código. Nada roto |
| 2 | Enrolar TOTP | `/seguridad` → «Activar segundo factor» → escanear QR → código de 6 dígitos | «Segundo factor activo en esta sesión»; el badge pasa a «Verificado» |
| 3 | Código inválido | En `/seguridad`, escribir `000000` | Mensaje de error, sin bloquear la cuenta, sin traza en pantalla |
| 4 | El panel ya no entra sin `aal2` | Con `ADMIN_MFA_REQUIRED=true`, cerrar sesión, entrar con Google, ir a `/admin` | Redirige a `/seguridad?next=/admin`; el panel no se renderiza |
| 5 | Y no entra por atajo a una Server Action | Con sesión `aal1`, invocar una acción del panel (por ejemplo, guardar perfil de organizador) | Responde «No autorizado» / no ejecuta |
| 6 | Con `aal2` entra | Verificar el código en `/seguridad` y volver a `/admin` | Panel completo, sin redirección |
| 7 | Banda de aviso | Con `ADMIN_MFA_REQUIRED=false` y sin factor | El panel muestra la banda ámbar con «Activarlo» |
| 8 | Enrolar passkey | `/seguridad` → «Agregar este dispositivo» → biometría/PIN | Aparece en la lista con fecha de alta; Chrome/Safari lo ofrecen al salir y volver a entrar |
| 9 | Entrar con passkey | Cerrar sesión → `/login` → «Entrar con llave de acceso» | Entra sin tocar Google; vuelve al `next` de origen |
| 10 | Passkey + Términos | Cuenta nueva sin aceptación, entrar con passkey | Registra `terms_accepted_at` o, si falla, el gate de Términos pide aceptar |
| 11 | Revocar llave | `/seguridad` → eliminar la llave → intentar entrar con ella | La ceremonia falla; Google sigue entrando |
| 12 | Passkey en un dominio equivocado | Abrir un preview de Vercel e intentar con passkey | Error claro, sin romper la página; Google funciona |
| 13 | Cancelar la ceremonia | Tocar «Entrar con llave» y cancelar en el diálogo del sistema | Mensaje «Cancelaste el acceso», botón utilizable otra vez |
| 14 | Superadmin completo | `/admin/super` con `aal2` | Pide **también** la clave maestra (sigue siendo el segundo paso de ese panel) |
| 15 | Sin soporte WebAuthn | Navegador o contexto sin `PublicKeyCredential` | El bloque de passkeys no se dibuja; el flujo de Google queda intacto |

## Rollback

- Passkeys molestan → `NEXT_PUBLIC_PASSKEYS_ENABLED=false` y redesplegar. El bloque desaparece; las
  llaves registradas quedan guardadas en Supabase sin usarse.
- MFA bloquea el panel → `ADMIN_MFA_REQUIRED=false` y redesplegar. El factor queda enrolado y el
  acceso vuelve a como estaba. **No hace falta borrar factores para recuperar el acceso.**

## Qué registrar como evidencia

- Captura de `/seguridad` con el factor verificado y una llave listada.
- El pedido a `/admin` devolviendo 307 hacia `/seguridad` con `ADMIN_MFA_REQUIRED=true`.
- El evento de Supabase Auth del primer acceso con passkey (`last_used_at` en la lista).

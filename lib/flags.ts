/**
 * Flags de funcionalidad leídos del entorno.
 *
 * Regla de Next: las variables `NEXT_PUBLIC_*` se reemplazan de forma literal
 * en tiempo de build, así que la comparación tiene que estar escrita acá tal
 * cual (`process.env.NEXT_PUBLIC_…`). Una lectura dinámica
 * (`process.env[nombre]`) devuelve `undefined` en el navegador.
 *
 * Todo lo que sea caro o irreversible (passkeys atados al dominio, segundo
 * factor del panel) arranca apagado: el código queda desplegado y se activa
 * con una variable de entorno, sin tocar de nuevo el build.
 */

/**
 * Passkeys (WebAuthn) como método de acceso.
 *
 * Requiere, antes de activarlo, habilitar Passkeys en el panel de Supabase
 * (Authentication → Passkeys) con el Relying Party ID del dominio definitivo.
 * Cambiar ese ID después invalida todas las llaves ya registradas.
 */
export const PASSKEYS_ENABLED =
  process.env.NEXT_PUBLIC_PASSKEYS_ENABLED === "true";

/**
 * Exige segundo factor verificado (`aal2`) para entrar a `/admin/*`.
 *
 * Solo servidor: este módulo se importa desde layouts y helpers de sesión.
 * No lo importes en componentes "use client" (la variable no llega al bundle).
 */
export function adminMfaRequired(): boolean {
  return process.env.ADMIN_MFA_REQUIRED === "true";
}

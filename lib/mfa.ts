/**
 * Decisión del segundo factor para el panel.
 *
 * Vive separada de Supabase y de Next a propósito: es una tabla de verdad sobre
 * dos niveles de garantía (AAL), y así se puede probar sin red ni sesión.
 *
 *   - `aal1`: sesión con un solo factor (hoy: Google).
 *   - `aal2`: sesión con un factor verificado además del primero (TOTP).
 */

export type AdminMfaGate = "ok" | "enroll" | "verify";

export interface AdminMfaInput {
  /** `ADMIN_MFA_REQUIRED` del entorno. Apagado = el gate no interviene. */
  required: boolean;
  /** Nivel real de la sesión actual. */
  currentLevel: string | null | undefined;
  /**
   * Nivel alcanzable: `aal2` si el usuario ya tiene un factor verificado,
   * `aal1` si todavía no enroló ninguno.
   */
  nextLevel: string | null | undefined;
}

/**
 * - `ok`: puede pasar.
 * - `verify`: tiene factor, pero esta sesión no lo usó todavía.
 * - `enroll`: no tiene ningún factor verificado.
 */
export function evaluateAdminMfaGate({
  required,
  currentLevel,
  nextLevel,
}: AdminMfaInput): AdminMfaGate {
  if (!required) return "ok";
  if (currentLevel === "aal2") return "ok";
  return nextLevel === "aal2" ? "verify" : "enroll";
}

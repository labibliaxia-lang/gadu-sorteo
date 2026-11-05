import { createClient } from "@/lib/supabase/server";
import { adminMfaRequired } from "@/lib/flags";
import { evaluateAdminMfaGate } from "@/lib/mfa";

/**
 * Helpers de sesión para el panel de administración.
 *
 * El panel tiene dos niveles:
 *   - organizador (`admin`): gestiona sus propios sorteos.
 *   - superadmin: gestiona todo y además exige la cookie maestra para las
 *     páginas de `/admin/super` (eso vive en `middleware.ts`).
 *
 * La lectura del rol se hace siempre contra `profiles`, nunca contra el JWT ni
 * la sesión del cliente: el rol no viaja en el token y así no se puede
 * fabricar desde el navegador.
 */

export type AdminRole = "admin" | "superadmin";

export interface AdminSession {
  id: string;
  email: string | null;
  role: AdminRole;
  isSuper: boolean;
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === "admin" || value === "superadmin";
}

/** Sesión de administración, o `null` si no hay sesión o el rol no es de panel. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, is_banned")
    .eq("id", user.id)
    .single();

  if (!isAdminRole(profile?.role)) return null;

  // Una cuenta suspendida no puede operar el panel aunque su access token
  // siga vivo hasta una hora después del ban de Auth.
  if (profile?.is_banned) return null;

  // El layout del panel ya exige esto, pero las Server Actions se pueden
  // invocar sin pasar por una página: la comprobación tiene que repetirse acá.
  if (adminMfaRequired()) {
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const gate = evaluateAdminMfaGate({
      required: true,
      currentLevel: assurance?.currentLevel,
      nextLevel: assurance?.nextLevel,
    });
    if (gate !== "ok") return null;
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    role: profile.role,
    isSuper: profile.role === "superadmin",
  };
}

/**
 * Guard para el comienzo de cada Server Action del panel.
 *
 * Devuelve la sesión o `null`; el llamador responde «No autorizado» sin
 * ejecutar ninguna consulta. Se llama `require...` porque la acción no debe
 * continuar sin resultado: la verificación es obligatoria, no opcional.
 */
export async function requireAdminSession(): Promise<AdminSession | null> {
  return getAdminSession();
}

/** Igual que `requireAdminSession`, pero solo acepta `superadmin`. */
export async function requireSuperadminSession(): Promise<AdminSession | null> {
  const session = await requireAdminSession();
  return session?.isSuper ? session : null;
}

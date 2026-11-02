/**
 * Constantes y helpers compartidos por el panel de superadministrador.
 * Módulo "neutro": lo importan tanto Server Actions como componentes cliente,
 * por eso no puede importar nada de servidor (Supabase, node:crypto, etc.).
 */

/** Roles asignables desde el panel (allowlist; nunca texto libre). */
export const ASSIGNABLE_ROLES = ["user", "admin", "superadmin"] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Roles con etiqueta legible, en el orden en que se ofrecen en la UI. */export const ROLE_OPTIONS: { value: AssignableRole; label: string }[] = [
  { value: "user", label: "Usuario" },
  { value: "admin", label: "Organizador" },
  { value: "superadmin", label: "Superadmin" },
];

/** Planes válidos de licencia (allowlist; la tabla no tiene CHECK). */
export const LICENSE_PLANS = ["organizador", "premium"] as const;

export type LicensePlan = (typeof LICENSE_PLANS)[number];

/** Qué columna toca revertir una licencia canjeada, y entre qué valores. */
export type LicenseBenefit =
  | { field: "plan"; from: "premium"; to: "organizador" }
  | { field: "role"; from: "admin"; to: "user" };

/**
 * Beneficio que otorgó un código según su plan, para poder revertirlo.
 *
 * `premium` desbloquea el plan; `organizador` asciende el rol. Son los dos
 * únicos valores que admite el CHECK de 0023. Devuelve null con un plan
 * desconocido: nunca se adivina qué revertir.
 *
 * Ojo: esto describe el beneficio ACTUAL que se quita, no el estado previo.
 * El estado previo no está registrado (ver `license_codes`), así que una
 * reversión puede quitar algo que el código no dio.
 */
export function licenseBenefit(plan: string): LicenseBenefit | null {
  const normalized = (plan ?? "").trim().toLowerCase();
  if (normalized === "premium") {
    return { field: "plan", from: "premium", to: "organizador" };
  }
  if (normalized === "organizador") {
    return { field: "role", from: "admin", to: "user" };
  }
  return null;
}

/** Tamaño de página del listado de usuarios. */
export const USERS_PAGE_SIZE = 25;

/**
 * ¿Se puede degradar a un superadmin?
 *
 * Nunca si es el último (`remaining <= 1`), y nunca si el conteo no se pudo
 * obtener (`null`): ante la duda, no se degrada. Se expone como función pura
 * para que la regla se pueda probar sin base de datos.
 */
export function canDemoteSuperadmin(remaining: number | null): boolean {
  return remaining !== null && remaining > 1;
}

/** Etiqueta legible de un rol. */
export function roleLabel(role: string): string {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Organizador";
  return "Usuario";
}

/** Valida un email sin caer en regexp demasiado estrictas. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza un `searchParams` de Next (string | string[] | undefined). */
export function normalizeParam(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    value[0].trim() !== ""
  ) {
    return value[0].trim();
  }
  return undefined;
}

/** Devuelve `value` si está en la allowlist; si no, el fallback. */
export function pickAllowed<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Construye el enlace de WhatsApp a partir de un teléfono escrito a mano.
 *
 * El formato canónico de wa.me para Argentina es `54 9 <área> <número>`:
 *   "011 15-2345-6789"    -> 5491123456789 (quita el 0 y el 15 de móvil)
 *   "11 2345 6789"        -> 5491123456789
 *   "+54 9 11 2345-6789"  -> 5491123456789
 * Los números con "+" de otro país se respetan tal cual.
 */
export function waLink(phone: string | null, message?: string): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null;

  const text = message ? `?text=${encodeURIComponent(message)}` : "";

  // Otro país (formato internacional explícito distinto de Argentina).
  if (raw.startsWith("+") && !digits.startsWith("54")) {
    return `https://wa.me/${digits}${text}`;
  }

  let local = digits;
  if (local.startsWith("54")) local = local.slice(2);
  // 0 de larga distancia (011..., 0341...).
  if (local.startsWith("0")) local = local.slice(1);
  // 15 de móvil pegado al principio (raro, pero existe).
  if (local.startsWith("15")) local = local.slice(2);

  // 15 de móvil insertado tras el código de área (2 a 4 dígitos).
  for (const cut of [2, 3, 4]) {
    if (local.slice(cut, cut + 2) === "15") {
      const without = local.slice(0, cut) + local.slice(cut + 2);
      if (without.length === 10) {
        local = without;
        break;
      }
    }
  }

  // El "9" de móvil se agrega siempre una sola vez.
  if (local.startsWith("9")) local = local.slice(1);
  if (local.length < 8) return null;

  return `https://wa.me/549${local}${text}`;
}

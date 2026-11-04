/**
 * "Modo editor": impersonación controlada por el superadmin.
 *
 * Módulo PURO a propósito: no importa `next/headers` ni Supabase, así que lo
 * puede importar el navegador (para mostrar el banner) y vitest en node.
 * Los helpers que tocan cookies viven en `lib/impersonation-server.ts`.
 *
 * Qué guarda: el origen de la impersonación (quién era el admin y su refresh
 * token) para poder restaurar la sesión del admin al salir. Ese refresh token
 * NUNCA sale del servidor: va en una cookie httpOnly.
 */

import { UUID_RE } from "./superadmin";

export const IMPERSONATION_COOKIE = "gadu_impersonation";

/** 2 horas: lo mismo que dura una sesión de trabajo del panel. */
export const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

export interface ImpersonationOrigin {
  adminId: string;
  adminEmail: string | null;
  adminRefreshToken: string;
  targetId: string;
  targetName: string;
  startedAt: string;
}

/** Versión del formato del payload. Un payload de otra versión se descarta. */
const PAYLOAD_VERSION = 1;

// Límites defensivos: una cookie enorme se rechaza antes que viajar en cada
// petición. Los valores reales quedan muy por debajo.
const MAX_EMAIL_LENGTH = 320;
const MAX_REFRESH_TOKEN_LENGTH = 4096;
const MAX_TARGET_NAME_LENGTH = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** ¿El string es una fecha ISO parseable? */
function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function serializeImpersonationOrigin(o: ImpersonationOrigin): string {
  return JSON.stringify({
    v: PAYLOAD_VERSION,
    adminId: o.adminId,
    adminEmail: o.adminEmail,
    adminRefreshToken: o.adminRefreshToken,
    targetId: o.targetId,
    targetName: o.targetName,
    startedAt: o.startedAt,
  });
}

/**
 * Lee el payload de la cookie. NUNCA lanza: cualquier cosa rara (JSON roto,
 * objeto con forma inesperada, campos faltantes o de otro tipo, versión
 * desconocida) devuelve `null` y el llamador debe pedir un login nuevo.
 */
export function parseImpersonationOrigin(
  raw: string | null | undefined,
): ImpersonationOrigin | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;
  if (parsed.v !== PAYLOAD_VERSION) return null;

  const adminId = parsed.adminId;
  const adminEmail = parsed.adminEmail;
  const adminRefreshToken = parsed.adminRefreshToken;
  const targetId = parsed.targetId;
  const targetName = parsed.targetName;
  const startedAt = parsed.startedAt;

  if (!isNonEmptyString(adminId) || !UUID_RE.test(adminId)) return null;
  if (!(adminEmail === null || typeof adminEmail === "string")) return null;
  if (adminEmail !== null && adminEmail.length > MAX_EMAIL_LENGTH) return null;
  if (!isNonEmptyString(adminRefreshToken)) return null;
  if (adminRefreshToken.length > MAX_REFRESH_TOKEN_LENGTH) return null;
  if (!isNonEmptyString(targetId) || !UUID_RE.test(targetId)) return null;
  if (!isNonEmptyString(targetName)) return null;
  if (targetName.length > MAX_TARGET_NAME_LENGTH) return null;
  if (!isDateString(startedAt)) return null;

  return {
    adminId,
    adminEmail: adminEmail as string | null,
    adminRefreshToken,
    targetId,
    targetName,
    startedAt,
  };
}

/**
 * Reglas de la impersonación, como función pura para poder probarlas sin base
 * de datos. No reemplaza la comprobación de rol del actor: eso lo hace
 * `requireSuperadminSession()` en el servidor antes de llamar acá.
 */
export function canImpersonateTarget(
  target: {
    id: string;
    role: string;
    is_banned?: boolean | null;
    email?: string | null;
  },
  actorId: string,
): { ok: true } | { ok: false; error: string } {
  if (!isNonEmptyString(target.id)) {
    return { ok: false, error: "Usuario inválido" };
  }
  if (target.id === actorId) {
    return {
      ok: false,
      error: "No podés entrar en modo editor con tu propia cuenta.",
    };
  }
  if (target.role === "superadmin") {
    return {
      ok: false,
      error: "No se puede entrar en modo editor con otro superadmin.",
    };
  }
  if (target.is_banned) {
    return {
      ok: false,
      error: "La cuenta está suspendida: no se puede usar el modo editor.",
    };
  }
  if (!isNonEmptyString(target.email)) {
    return {
      ok: false,
      error: "Ese usuario no tiene email registrado: no se puede iniciar sesión como él.",
    };
  }
  return { ok: true };
}

"use server";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const ADMIN_COOKIE = "admin_verified";
const MAX_AGE_SECONDS = 30 * 60; // 30 minutos

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// SHA-256 (hex) de la clave maestra de respaldo de 25 caracteres.
// SOLO se usa en desarrollo: en producción, sin ADMIN_ACCESS_CODE_HASH /
// ADMIN_ACCESS_CODE el panel falla cerrado (constitución, principio 19).
// En el código fuente NUNCA se guarda la clave en texto plano: solo su hash.
const DEV_FALLBACK_ACCESS_CODE_HASH =
  "5c0291ed411451dee115a19613f36034e94971bdec689228be2a7e65f52532e8";

const HASH_RE = /^[0-9a-f]{64}$/;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Hash SHA-256 esperado, por orden de prioridad:
 *   1. ADMIN_ACCESS_CODE_HASH (recomendado).
 *   2. ADMIN_ACCESS_CODE legacy (se hashea en memoria, nunca se compara en claro).
 *   3. Hash de respaldo de desarrollo, solo fuera de producción.
 * Devuelve null cuando no hay clave configurada en producción.
 */
function accessCodeHash(): string | null {
  const fromEnv = process.env.ADMIN_ACCESS_CODE_HASH?.trim().toLowerCase();
  if (fromEnv && HASH_RE.test(fromEnv)) return fromEnv;

  const legacy = process.env.ADMIN_ACCESS_CODE?.trim();
  if (legacy) return sha256Hex(legacy);

  if (IS_PRODUCTION) return null;
  console.warn(
    "[admin] ADMIN_ACCESS_CODE_HASH no configurado: se usa la clave de desarrollo.",
  );
  return DEV_FALLBACK_ACCESS_CODE_HASH;
}

function sessionSecret(): string | null {
  const fromEnv = process.env.ADMIN_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Deriva del hash del código maestro: no expone la clave.
  return accessCodeHash();
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeNext(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  // Solo rutas internas del panel.
  if (value.startsWith("/admin") && !value.startsWith("//")) return value;
  return "/admin/super";
}

/** Comparación en tiempo constante de dos hashes hexadecimales. */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Re-autenticación del panel de administración.
 * Valida (1) sesión activa, (2) rol superadmin y (3) el código maestro
 * comparando hashes SHA-256 (nunca la clave en texto plano).
 */
export async function verifyAdmin(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const code = String(formData.get("code") ?? "").trim();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    redirect("/admin/verify?error=forbidden");
  }

  // Paso 2: hash SHA-256 de la entrada y comparación segura.
  const inputHash = sha256Hex(code);
  const expectedHash = accessCodeHash();
  const key = sessionSecret();

  // Sin clave configurada en producción el panel NO se abre, y lo dice.
  if (!expectedHash || !key) {
    console.error(
      "[admin] Panel bloqueado: falta ADMIN_ACCESS_CODE_HASH (o ADMIN_ACCESS_CODE).",
    );
    redirect("/admin/verify?error=unconfigured");
  }

  if (!safeEqualHex(inputHash, expectedHash)) {
    redirect("/admin/verify?error=invalid");
  }

  // Paso 4: cookie firmada de corta duración.
  const exp = String(Date.now() + MAX_AGE_SECONDS * 1000);
  const payload = `v1.${user.id}.${exp}`;
  const value = `${payload}.${sign(payload, key)}`;

  cookies().set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  redirect(next);
}

/** Bloquea el panel de inmediato (borra la cookie admin y vuelve a /admin/verify). */
export async function lockAdminSession() {
  cookies().delete(ADMIN_COOKIE);
  redirect("/admin/verify");
}

"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const ADMIN_COOKIE = "admin_verified";
const MAX_AGE_SECONDS = 30 * 60; // 30 minutos

function sessionSecret(): string | null {
  return (
    process.env.ADMIN_SESSION_SECRET ??
    process.env.ADMIN_ACCESS_CODE ??
    null
  );
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

/**
 * Re-autenticación del panel de administración.
 * Valida (1) sesión activa, (2) rol superadmin y (3) el código maestro.
 * Si todo es correcto, firma una cookie HttpOnly de corta duración.
 */
export async function verifyAdmin(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const code = String(formData.get("code") ?? "");

  const expected = process.env.ADMIN_ACCESS_CODE;
  const key = sessionSecret();

  // Fail-closed: sin código configurado no se puede desbloquear el panel.
  if (!expected || !key) redirect("/admin/verify?error=config");

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

  // Comparación en tiempo constante para evitar timing attacks.
  const provided = Buffer.from(code);
  const expectedBuf = Buffer.from(expected);
  const codeOk =
    provided.length === expectedBuf.length &&
    timingSafeEqual(provided, expectedBuf);

  if (!codeOk) redirect("/admin/verify?error=invalid");

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

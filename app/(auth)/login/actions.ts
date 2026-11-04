"use server";

import { headers } from "next/headers";

import { getClientIp, limitLogin } from "@/lib/ratelimit";

export type LoginGateResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Se ejecuta antes de iniciar el OAuth de Google. No valida credenciales ni
 * revela si un email existe: solo cuenta el intento por IP.
 */
export async function checkLoginRateLimit(): Promise<LoginGateResult> {
  const ip = getClientIp(headers());
  const result = await limitLogin(ip);

  if (!result.success) {
    return {
      ok: false,
      error: "Demasiados intentos. Espera 15 minutos.",
    };
  }

  return { ok: true };
}

/**
 * Cookie del "modo editor" (impersonación) — solo servidor.
 *
 * Este archivo toca `next/headers`, así que NUNCA puede importarse desde un
 * componente de cliente. El módulo puro (formato y reglas) está en
 * `lib/impersonation.ts`.
 *
 * La cookie es httpOnly y contiene el refresh token del superadmin que inició
 * la impersonación: es el único lugar donde vive ese token, y el navegador no
 * lo puede leer.
 */

import { cookies } from "next/headers";

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  parseImpersonationOrigin,
  serializeImpersonationOrigin,
  type ImpersonationOrigin,
} from "./impersonation";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Origen de la impersonación en curso, o `null` si no hay o está corrupto. */
export async function readImpersonationOrigin(): Promise<ImpersonationOrigin | null> {
  const raw = cookies().get(IMPERSONATION_COOKIE)?.value;
  return parseImpersonationOrigin(raw);
}

/** Guarda el origen de la impersonación en una cookie httpOnly. */
export async function setImpersonationOrigin(
  origin: ImpersonationOrigin,
): Promise<void> {
  cookies().set({
    name: IMPERSONATION_COOKIE,
    value: serializeImpersonationOrigin(origin),
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  });
}

/** Borra el origen de la impersonación (salida o fallo al entrar). */
export async function clearImpersonationOrigin(): Promise<void> {
  cookies().set({
    name: IMPERSONATION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 0,
  });
}

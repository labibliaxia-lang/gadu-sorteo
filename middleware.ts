import { createServerClient, type CookieOptions } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/src/i18n/routing";

/**
 * next-intl solo maneja las rutas migradas a `app/[locale]`. El resto del
 * producto (admin, auth, perfil, legales) sigue existiendo únicamente en
 * español y no debe recibir el prefijo `/es` ni `/en`.
 */
const intlMiddleware = createMiddleware(routing);
const LOCALIZED_PREFIXES = [
  "/sorteos",
  "/como-funciona",
  "/ganadores",
  "/planes",
];

function isLocalizedRoute(pathname: string): boolean {
  const withoutLocale =
    pathname.replace(/^\/(?:es|en|pt)(?=\/|$)/, "") || "/";
  if (withoutLocale === "/") return true;
  return LOCALIZED_PREFIXES.some(
    (prefix) =>
      withoutLocale === prefix || withoutLocale.startsWith(`${prefix}/`),
  );
}

const ADMIN_COOKIE = "admin_verified";
const SUPER_PREFIX = "/admin/super";
const ADMIN_VERIFY = "/admin/verify";

// Debe coincidir con la lógica de `app/admin/verify/actions.ts` para que la
// cookie firmada por la Server Action sea validada correctamente.
// Solo se manejan hashes SHA-256 (nunca la clave maestra en texto plano).
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Clave de respaldo solo para desarrollo local. En producción el panel falla
// cerrado si no hay ADMIN_ACCESS_CODE_HASH / ADMIN_ACCESS_CODE.
const HASH_RE = /^[0-9a-f]{64}$/;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function accessCodeHash(): Promise<string | null> {
  const fromEnv = process.env.ADMIN_ACCESS_CODE_HASH?.trim().toLowerCase();
  if (fromEnv && HASH_RE.test(fromEnv)) return fromEnv;

  const legacy = process.env.ADMIN_ACCESS_CODE?.trim();
  if (legacy) return await sha256Hex(legacy);

  // Sin configuración no hay clave, ni siquiera en desarrollo: no se acepta
  // un hash hardcodeado en el repositorio.
  if (!IS_PRODUCTION) {
    console.error(
      "Panel admin: falta ADMIN_ACCESS_CODE_HASH o ADMIN_ACCESS_CODE en el entorno.",
    );
  }
  return null;
}

async function sessionSecret(): Promise<string | null> {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  if (value) return value;
  return await accessCodeHash();
}

/** Decodifica base64url a bytes; null si el formato es inválido. */
function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Verifica HMAC-SHA256 con Web Crypto. `crypto.subtle.verify` compara la firma
 * en tiempo constante y funciona en Edge runtime (donde no hay
 * `node:crypto.timingSafeEqual`).
 */
async function verifyHmacBase64Url(
  key: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const signatureBytes = base64UrlToBytes(signature);
  if (!signatureBytes) return false;
  const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signatureBuffer).set(signatureBytes);

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    signatureBuffer,
    encoder.encode(message),
  );
}

/**
 * Valida la cookie `admin_verified`: formato `v1.<userId>.<exp>.<firma>`,
 * ligada al usuario de la sesión, no vencida y con firma HMAC válida.
 */
async function hasValidAdminSession(
  request: NextRequest,
  userId: string,
): Promise<boolean> {
  const key = await sessionSecret();
  if (!key) return false;

  const raw = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;

  const parts = raw.split(".");
  if (parts.length !== 4) return false;

  const [version, cookieUserId, expRaw, signature] = parts;
  if (version !== "v1") return false;
  if (cookieUserId !== userId) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = await verifyHmacBase64Url(
    key,
    `${version}.${cookieUserId}.${expRaw}`,
    signature,
  );
  return expected;
}

/** Redirige conservando las cookies de Supabase refrescadas en esta petición. */
function redirectKeepingCookies(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
  search?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (search) {
    Object.entries(search).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const redirectResponse = NextResponse.redirect(url);
  // Un redirect que depende de la sesión no debe quedar en ninguna caché
  // intermedia: si el CDN guardara el 307, otro visitante heredaría el destino
  // de una sesión ajena (envenenamiento de caché).
  redirectResponse.headers.set("Cache-Control", "no-store, must-revalidate");
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

/**
 * Refresca la sesión de Supabase Auth en cada petición navegada
 * (patrón recomendado para App Router con cookies) y aplica una capa
 * adicional de seguridad sobre `/admin/super`: exige una re-autenticación
 * reciente con el código maestro de administrador.
 *
 * El resto del panel (`/admin`, `/admin/sorteos`, `/admin/perfil`,
 * `/admin/verificacion`) no pide la cookie: entra cualquier usuario con rol
 * `admin` o `superadmin`, y la autorización real la hacen el layout, las
 * Server Actions y RLS. Los organizadores comunes quedaban afuera con el
 * esquema anterior, que exigía la cookie en todo `/admin/*`.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresca la sesión (evita tokens obsoletos) y obtiene el usuario actual.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Rutas públicas localizadas: next-intl negocia/reescribe el locale y
  // conserva las cookies de sesión que Supabase pudo haber refrescado.
  if (isLocalizedRoute(pathname)) {
    const intlResponse = intlMiddleware(request);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      intlResponse.cookies.set(cookie);
    });
    return intlResponse;
  }

  const isSuperArea =
    pathname === SUPER_PREFIX || pathname.startsWith(`${SUPER_PREFIX}/`);

  // Solo el panel de superadmin conserva el segundo factor. Las demás rutas
  // del panel se autorizan por rol en `app/admin/layout.tsx` y en cada action.
  if (isSuperArea) {
    if (!user) {
      return redirectKeepingCookies(request, supabaseResponse, "/login");
    }
    if (!(await hasValidAdminSession(request, user.id))) {
      return redirectKeepingCookies(
        request,
        supabaseResponse,
        ADMIN_VERIFY,
        { next: pathname },
      );
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_COOKIE = "admin_verified";
const ADMIN_PREFIX = "/admin";
const ADMIN_VERIFY = "/admin/verify";

// Debe coincidir con la lógica de `app/admin/verify/actions.ts` para que la
// cookie firmada por la Server Action sea validada correctamente.
const DEFAULT_ADMIN_CODE = "gadu2026";

function adminAccessCode(): string {
  const value = process.env.ADMIN_ACCESS_CODE?.trim();
  return value || DEFAULT_ADMIN_CODE;
}

function sessionSecret(): string {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  return value || adminAccessCode();
}

/** HMAC-SHA256 en base64url usando Web Crypto (compatible con Edge runtime). */
async function hmacBase64Url(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Valida la cookie `admin_verified`: formato `v1.<userId>.<exp>.<firma>`,
 * ligada al usuario de la sesión, no vencida y con firma HMAC válida.
 */
async function hasValidAdminSession(
  request: NextRequest,
  userId: string,
): Promise<boolean> {
  const key = sessionSecret();
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

  const expected = await hmacBase64Url(
    key,
    `${version}.${cookieUserId}.${expRaw}`,
  );
  return expected === signature;
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
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

/**
 * Refresca la sesión de Supabase Auth en cada petición navegada
 * (patrón recomendado para App Router con cookies) y aplica una capa
 * adicional de seguridad sobre `/admin/*`: exige una re-autenticación
 * reciente con el código maestro de administrador.
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
  const isAdminArea =
    pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isVerifyPage =
    pathname === ADMIN_VERIFY || pathname.startsWith(`${ADMIN_VERIFY}/`);

  if (isAdminArea && !isVerifyPage) {
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

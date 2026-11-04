import { NextResponse } from "next/server";

import { normalizeTrackedPath } from "@/lib/page-views";
import { allowRateLimitedAction } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** IP del visitante detrás de Vercel/proxy; "unknown" si no hay headers. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Registra una vista de página.
 *
 * El cliente sólo manda `path`. El `user_id` se resuelve de la sesión real y el
 * insert usa service role: la tabla no tiene policy de insert público, así que
 * no se puede inflar el contador desde el navegador. Si la migración todavía no
 * está aplicada (o la tabla falla), se responde 204 igual: una métrica no puede
 * tumbar la Home.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const path = normalizeTrackedPath(
    (body as { path?: unknown } | null)?.path,
  );
  if (!path) {
    return NextResponse.json(
      { error: "Ruta no permitida" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const ip = clientIp(request);
  const allowed = await allowRateLimitedAction(
    `track-visit:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS,
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS),
        },
      },
    );
  }

  // Usuario autenticado real; el body nunca decide la identidad.
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (error) {
    console.warn("[track-visit] no se pudo leer la sesión:", error);
  }

  try {
    const { error } = await createAdminClient()
      .from("page_views")
      .insert({ path, user_id: userId });

    if (error) {
      // Migración 0064 pendiente o tabla ausente: la Home sigue funcionando.
      console.warn("[track-visit] no se pudo registrar la visita:", error.message);
    }
  } catch (error) {
    console.warn("[track-visit] no se pudo registrar la visita:", error);
  }

  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}

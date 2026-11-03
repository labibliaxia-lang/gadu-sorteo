import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Callback de OAuth.
 * Google redirige aquí con ?code=... ; intercambiamos ese code por una sesión
 * (exchangeCodeForSession) para que la cookie se setee en el servidor de forma
 * segura y no quede expuesta en el cliente.
 *
 * Para volver al sorteo de origen, el login deja una cookie corta `gadu_next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  let rawNext = searchParams.get("next") ?? "/";
  const cookieNext = request.cookies.get("gadu_next")?.value;

  if (!searchParams.get("next") && cookieNext) {
    try {
      rawNext = decodeURIComponent(cookieNext);
    } catch {
      rawNext = "/";
    }
  }

  // Evita open redirect: solo se permiten rutas relativas dentro de la app.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      let destination = `${origin}${next}`;
      if (!isLocalEnv && forwardedHost) {
        destination = `https://${forwardedHost}${next}`;
      }

      const response = NextResponse.redirect(destination);
      // La cookie de retorno es de un solo uso.
      response.cookies.set("gadu_next", "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  // Sin code o error al intercambiar: volver al login con aviso.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

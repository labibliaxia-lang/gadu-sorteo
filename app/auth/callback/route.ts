import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Callback de OAuth.
 * Google redirige aquí con ?code=... ; intercambiamos ese code por una sesión
 * (exchangeCodeForSession) para que la cookie se setee en el servidor de forma
 * segura y no quede expuesta en el cliente.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Evita open redirect: solo se permiten rutas relativas dentro de la app.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Sin code o error al intercambiar: volver al login con aviso.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

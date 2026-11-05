import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { LoginForm } from "@/components/LoginForm";
import { TERMS_COOKIE, termsCookieAccepted } from "@/lib/terms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta | Gadu Sorteos",
  description:
    "Creá tu cuenta de Gadu Sorteos con Google y aceptá los Términos y la Política de Privacidad.",
  robots: { index: false, follow: true },
};

/**
 * Registro con Google. La cuenta se crea en el primer inicio de sesión, pero
 * esta pantalla existe para que el alta tenga su propio checkbox de T&C.
 * La aceptación se guarda en profiles.terms_accepted_at desde el callback.
 */
export default function RegisterPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu cuenta se crea con Google. Antes de continuar, aceptá los Términos
          y la Política de Privacidad.
        </p>

        <div className="mt-6 text-left">
          <LoginForm
            next={null}
            termsAcceptedByCookie={termsCookieAccepted(
              cookies().get(TERMS_COOKIE)?.value,
            )}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/login"
            className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

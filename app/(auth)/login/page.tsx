import Image from "next/image";
import { cookies } from "next/headers";

import { LoginForm } from "@/components/LoginForm";
import { PASSKEYS_ENABLED } from "@/lib/flags";
import { TERMS_COOKIE, termsCookieAccepted } from "@/lib/terms";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; confirm?: string; next?: string };
}) {
  const notice =
    searchParams.error === "auth"
      ? "No se pudo completar el inicio con Google. Intentá de nuevo."
      : searchParams.confirm === "1"
        ? "Te enviamos un correo de confirmación. Revisá tu bandeja de entrada."
        : null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex w-fit items-center justify-center">
          <Image
            src="/logo-gadu-azul.png"
            alt="Gadu Sorteos"
            width={200}
            height={100}
            className="h-11 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-gadu-blanco.png"
            alt=""
            aria-hidden="true"
            width={200}
            height={100}
            className="hidden h-11 w-auto dark:block"
            priority
          />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenido a Gadu Sorteos
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Iniciá sesión con tu cuenta de Google para elegir tus números y
          participar por premios de todo tipo.
        </p>

        {notice && (
          <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}

        <div className="mt-6">
          <LoginForm
            next={searchParams.next ?? null}
            termsAcceptedByCookie={termsCookieAccepted(
              cookies().get(TERMS_COOKIE)?.value,
            )}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          ¿No tenés cuenta? Se crea automáticamente con Google.
        </p>

        {PASSKEYS_ENABLED && (
          <p className="mt-2 text-xs text-muted-foreground">
            Si ya registraste una llave de acceso, también podés entrar con la
            huella o la cara de este dispositivo.
          </p>
        )}
      </div>
    </div>
  );
}

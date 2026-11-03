import Image from "next/image";

import { GoogleAuthButton } from "@/components/GoogleAuthButton";

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
        <div className="mx-auto mb-5 flex w-fit items-center justify-center rounded-2xl bg-white px-4 py-2.5 shadow ring-1 ring-black/5">
          <Image
            src="/logo-gadu-wordmark.png"
            alt="Gadu Sorteos"
            width={128}
            height={50}
            className="h-8 w-auto"
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
          <GoogleAuthButton next={searchParams.next ?? null} />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          ¿No tenés cuenta? Se crea automáticamente con Google.
        </p>
      </div>
    </div>
  );
}

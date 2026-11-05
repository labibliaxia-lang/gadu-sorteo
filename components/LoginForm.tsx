"use client";

import { useState } from "react";
import Link from "next/link";

import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PasskeyLoginButton } from "@/components/PasskeyLoginButton";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/terms";

export function LoginForm({
  next,
  termsAcceptedByCookie = false,
}: {
  next: string | null;
  /** La cookie de consentimiento cubre la versión vigente: no hace falta tildar. */
  termsAcceptedByCookie?: boolean;
}) {
  const [accepted, setAccepted] = useState(termsAcceptedByCookie);

  return (
    <div className="space-y-4">
      {!termsAcceptedByCookie && (
        <label className="flex items-start gap-2 text-left text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber-600"
          />
          <span>
            He leído y acepto los{" "}
            <Link
              href={TERMS_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
            >
              Términos y Condiciones
            </Link>{" "}
            y la{" "}
            <Link
              href={PRIVACY_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 underline underline-offset-4 dark:text-amber-300"
            >
              Política de Privacidad
            </Link>
            .
          </span>
        </label>
      )}

      <GoogleAuthButton next={next} termsAccepted={accepted} />

      {/* Se dibuja entero o no se dibuja: sin el flag o sin WebAuthn en el
          navegador, este bloque no aparece. */}
      <PasskeyLoginButton next={next} termsAccepted={accepted} />

      {!accepted && (
        <p className="text-xs text-muted-foreground">
          Debés aceptar los términos para continuar.
        </p>
      )}
    </div>
  );
}

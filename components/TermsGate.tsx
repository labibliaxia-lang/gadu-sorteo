"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

import { acceptTerms } from "@/app/actions/terms";
import { Button } from "@/components/ui/button";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/terms";

const ALLOWED_PATHS = [TERMS_PATH, PRIVACY_PATH, "/login", "/register", "/auth"];

/**
 * Bloqueo obligatorio para cuentas OAuth que todavía no aceptaron los
 * Términos. No deja navegar hasta registrar la aceptación; las páginas legales
 * y el login quedan accesibles.
 */
export function TermsGate({ accepted }: { accepted: boolean }) {
  const pathname = usePathname();
  const [alreadyAccepted, setAlreadyAccepted] = useState(accepted);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyAccepted) return null;
  if (pathname && ALLOWED_PATHS.some((path) => pathname.startsWith(path))) {
    return null;
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const result = await acceptTerms();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAlreadyAccepted(true);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-gate-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          <h2 id="terms-gate-title" className="text-lg font-semibold">
            Un paso antes de continuar
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Para usar Gadu Sorteos necesitás aceptar los Términos y Condiciones y
          la Política de Privacidad. Las aceptaste antes de entrar con Google,
          pero todavía no quedó registrada en tu cuenta.
        </p>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
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

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          className="mt-4 w-full"
          onClick={() => void onSubmit()}
          disabled={!checked || busy}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : null}
          Aceptar y continuar
        </Button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Loader2, LogOut } from "lucide-react";

import { stopImpersonation } from "@/app/[locale]/admin/super/actions";
import { Button } from "@/components/ui/button";

interface Props {
  /** Nombre visible del usuario cuya sesión se está usando. */
  targetName: string;
  /** Email del superadmin que abrió el modo editor (si se pudo leer). */
  adminEmail?: string | null;
}

/**
 * Banner global del "Modo Editor".
 *
 * Aparece arriba de todo en cada página mientras dura la impersonación, porque
 * con la sesión del target la consola /admin/super queda inaccesible: este es
 * el único lugar desde donde se puede salir. Fondo ámbar oscuro/ámbar claro
 * según el tema, con contraste AA en ambos.
 */
export function ImpersonationBanner({ targetName, adminEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exit() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await stopImpersonation();
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.replace("/admin/super");
    router.refresh();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-500/40 bg-amber-500/10 text-amber-950 dark:bg-amber-500/15 dark:text-amber-50"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-start gap-2 text-[13px] leading-snug sm:items-center">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Modo Editor:</strong> estás
            viendo la app como {targetName}. Las acciones quedan auditadas.
            {adminEmail ? (
              <span className="hidden text-amber-900/80 sm:inline dark:text-amber-100/80">
                {" "}
                (entraste desde {adminEmail})
              </span>
            ) : null}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-2 pl-6 sm:pl-0">
          {error && (
            <span role="alert" className="text-xs font-medium">
              {error}{" "}
              <Link href="/login" className="underline underline-offset-2">
                Ir a iniciar sesión
              </Link>
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-600/50 bg-transparent text-amber-950 hover:bg-amber-500/20 dark:border-amber-300/50 dark:text-amber-50 dark:hover:bg-amber-400/20"
            onClick={() => void exit()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2
                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {busy ? "Saliendo…" : "Salir del modo editor"}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startImpersonation } from "@/app/[locale]/admin/super/actions";

interface Props {
  userId: string;
  /** Nombre visible del usuario destino, sólo para el texto de confirmación. */
  targetName?: string | null;
  /** Rol del listado: un superadmin nunca se impersona (el servidor decide igual). */
  role?: string | null;
  /** Se apaga mientras hay otra operación en la fila. */
  disabled?: boolean;
}

/**
 * "Entrar como usuario" (modo editor).
 *
 * La confirmación explica las dos cosas que importan: queda auditado y se sale
 * con el banner que aparece arriba en toda la app. El servidor es la autoridad
 * final: valida sesión de superadmin, destino no-superadmin y email confirmado.
 */
export function ImpersonateButton({
  userId,
  targetName,
  role,
  disabled = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El listado ya filtra, pero el contrato lo repite: nunca un superadmin.
  if (role === "superadmin") return null;

  async function enter() {
    if (busy) return;

    const name = targetName?.trim() || "este usuario";
    const confirmed = window.confirm(
      `¿Entrar en modo editor como ${name}?\n\n` +
        "Vas a ver la app con su sesión. La entrada y la salida quedan registradas en la auditoría. " +
        "Para volver a tu cuenta usá el botón «Salir del modo editor» del banner que aparece arriba.",
    );
    if (!confirmed) return;

    const motivo =
      window.prompt(
        "Motivo (opcional, queda registrado en la auditoría):",
        "",
      ) ?? "";

    setBusy(true);
    setError(null);

    const result = await startImpersonation(userId, motivo);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    // Navegación completa: la sesión cambió en el servidor (cookies httpOnly).
    window.location.assign("/");
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void enter()}
        disabled={busy || disabled}
        aria-busy={busy}
      >
        {busy ? (
          <Loader2
            className="mr-1.5 h-3.5 w-3.5 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <LogIn className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        )}
        {busy ? "Entrando…" : "Entrar como usuario"}
      </Button>
      {error && (
        <span role="alert" className="text-2xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

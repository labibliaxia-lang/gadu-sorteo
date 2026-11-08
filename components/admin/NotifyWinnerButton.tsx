"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageCircle } from "lucide-react";

import { notifyWinnerManually } from "@/app/[locale]/admin/sorteos/[id]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { telefonoLegible, waLink } from "@/lib/whatsapp";

/**
 * Reenvía el aviso de premio al ganador. Si no tiene email, ofrece WhatsApp con
 * el teléfono del perfil para que el organizador no quede sin salida.
 */
export function NotifyWinnerButton({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telefono, setTelefono] = useState<string | null>(null);

  function enviar() {
    if (
      !window.confirm(
        "¿Reenviar el aviso de premio al ganador por email?",
      )
    ) {
      return;
    }

    setMensaje(null);
    setError(null);
    setTelefono(null);

    startTransition(async () => {
      const res = await notifyWinnerManually(raffleId);
      if (!res.ok) {
        setError(res.error);
        setTelefono(res.phone ?? null);
        return;
      }
      setMensaje("Aviso enviado al ganador.");
      router.refresh();
    });
  }

  const wa = telefono
    ? waLink(
        telefono,
        "¡Hola! Saliste ganador del sorteo. Escribime para coordinar la entrega del premio.",
      )
    : null;
  const destino = telefonoLegible(telefono);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={enviar} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-1.5 h-4 w-4" />
          )}
          Reenviar aviso al ganador
        </Button>

        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            Avisarle por WhatsApp
          </a>
        )}
      </div>

      {destino && (
        <p className="text-[11px] text-fg-subtle">
          El WhatsApp se abre con {destino}.
        </p>
      )}

      {mensaje && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="max-w-md text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

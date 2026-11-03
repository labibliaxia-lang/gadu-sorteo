"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bot } from "lucide-react";

import { setAutoDraw } from "@/app/admin/sorteos/[id]/actions";
import { Button } from "@/components/ui/button";

/**
 * Opt-in del sorteo automático. Se ejecuta solo a la fecha programada; el
 * fallback perezoso y el cron cubren el caso de que nadie tenga la página
 * abierta.
 */
export function AutoDrawToggle({
  raffleId,
  enabled,
  drawDate,
  hasCommitment,
  soldCount,
  disabled,
}: {
  raffleId: string;
  enabled: boolean;
  drawDate: string;
  hasCommitment: boolean;
  soldCount: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await setAutoDraw(raffleId, !enabled);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const when = drawDate
    ? new Date(drawDate).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "la fecha programada";

  return (
    <div className="space-y-1.5 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Bot className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            Sorteo automático
          </p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? `Se ejecuta solo a partir del ${when}.`
              : "Apagado: el sorteo se hace manualmente cuando vos quieras, desde la fecha programada."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "outline" : "default"}
          onClick={() => void toggle()}
          disabled={busy || disabled}
          aria-pressed={enabled}
        >
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {enabled ? "Desactivar" : "Activar"}
        </Button>
      </div>

      {!hasCommitment && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Falta publicar el compromiso: el automático no puede sortear sin él.
        </p>
      )}
      {soldCount === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin números vendidos el automático se saltea y te avisa por email.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

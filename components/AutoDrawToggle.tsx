"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Hand, Loader2 } from "lucide-react";

import { setAutoDraw } from "@/app/admin/sorteos/[id]/actions";
import { cn } from "@/lib/utils";

/**
 * Elección del modo de ejecución por sorteo:
 * - Manual (incluido): el organizador ejecuta a la hora; le llega un aviso.
 * - Automático (Premium): se ejecuta solo a la hora, con fallback y cron.
 */
export function AutoDrawToggle({
  raffleId,
  enabled,
  canAutoDraw,
  drawDate,
  hasCommitment,
  soldCount,
  disabled,
}: {
  raffleId: string;
  enabled: boolean;
  canAutoDraw: boolean;
  drawDate: string;
  hasCommitment: boolean;
  soldCount: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(auto: boolean) {
    if (auto === enabled) return;
    if (auto && !canAutoDraw) return;

    setBusy(true);
    setError(null);
    const result = await setAutoDraw(raffleId, auto);
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
    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">¿Cómo se ejecuta este sorteo?</p>
        <p className="text-xs text-muted-foreground">
          El modo elegido se muestra en la página pública. La fecha y hora son
          las mismas en ambos casos: {when}.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void choose(false)}
          disabled={busy || disabled}
          aria-pressed={!enabled}
          className={cn(
            "rounded-lg border-2 p-3 text-left transition",
            !enabled
              ? "border-amber-500 bg-amber-500/10"
              : "border-border hover:border-amber-500/50",
            (busy || disabled) && "opacity-60",
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Hand className="h-4 w-4" />
            Manual
            {!enabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Elegido
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Vos tocás «Sortear ganador» desde la hora programada. Te avisamos
            por email cuando esté listo.
          </span>
        </button>

        <button
          type="button"
          onClick={() => void choose(true)}
          disabled={busy || disabled || !canAutoDraw}
          aria-pressed={enabled}
          className={cn(
            "rounded-lg border-2 p-3 text-left transition",
            enabled
              ? "border-amber-500 bg-amber-500/10"
              : "border-border",
            canAutoDraw && !enabled && "hover:border-amber-500/50",
            (!canAutoDraw || busy || disabled) && "opacity-70",
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Bot className="h-4 w-4" />
            Automático
            {enabled ? (
              <span className="ml-auto text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Elegido
              </span>
            ) : (
              <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
                Premium
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Se ejecuta solo a la hora. Si falta algo o falla, te avisamos por
            email.
          </span>
        </button>
      </div>

      {!canAutoDraw && (
        <p className="text-xs text-muted-foreground">
          El modo automático es una función Premium.{" "}
          <Link
            href="/planes"
            className="text-amber-800 underline-offset-4 hover:underline dark:text-amber-300"
          >
            Mejorar plan
          </Link>
          . El modo manual con aviso sigue incluido.
        </p>
      )}

      {!hasCommitment && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Falta publicar el compromiso: el automático no puede sortear sin él.
        </p>
      )}
      {soldCount === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin números vendidos no se puede sortear en ningún modo.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

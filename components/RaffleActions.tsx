"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { publishDrawCommitment, drawWinner as drawRaffleWinner, cancelRaffle } from "@/app/admin/sorteos/[id]/actions";

interface RaffleActionsProps {
  raffleId: string;
  status: string;
  /** Fecha/hora programada del sorteo: el botón se habilita recién ahí. */
  drawDate: string;
  /** Sorteo automático opt-in. */
  autoDraw?: boolean;
  /** ¿Ya se publicó el compromiso (semilla) del sorteo? (migración 0034) */
  hasCommitment: boolean;
  /** Números en estado sold: sin al menos uno no se puede sortear. */
  soldCount?: number;
}

function countdownLabel(target: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return days > 0 ? `${days}d ${clock}` : clock;
}

export function RaffleActions({
  raffleId,
  status,
  drawDate,
  autoDraw = false,
  hasCommitment,
  soldCount,
}: RaffleActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const drawAt = new Date(drawDate).getTime();
  const validDate = Number.isFinite(drawAt);
  const due = validDate && now !== null && now >= drawAt;

  async function commitSeed() {
    setBusy("commit");
    setError(null);
    const result = await publishDrawCommitment(raffleId);
    if (!result.ok) setError(result.error);
    setBusy(null);
    router.refresh();
  }

  async function closeRaffle() {
    setBusy("close");
    setError(null);
    const { error: updateError } = await supabase
      .from("raffles")
      .update({ status: "closed" })
      .eq("id", raffleId);
    if (updateError) setError(updateError.message);
    setBusy(null);
    router.refresh();
  }

  async function reopenRaffle() {
    setBusy("reopen");
    setError(null);
    const { error: updateError } = await supabase
      .from("raffles")
      .update({ status: "active" })
      .eq("id", raffleId);
    if (updateError) setError(updateError.message);
    setBusy(null);
    router.refresh();
  }

  async function drawWinner() {
    setBusy("draw");
    setError(null);
    const result = await drawRaffleWinner(raffleId);
    if (!result.ok) setError(result.error);
    setBusy(null);
    router.refresh();
  }

  async function cancelRaffleAction() {
    if (
      !window.confirm(
        "¿Cancelar el sorteo? Se generarán devoluciones pendientes para los compradores. Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    const reason = window.prompt(
      "Motivo de la cancelación (opcional). Ej: no se alcanzó el mínimo de venta.",
    );
    if (reason === null) return;

    setBusy("cancel");
    setError(null);
    const result = await cancelRaffle(raffleId, reason || undefined);
    if (!result.ok) setError(result.error);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "active" && (
          <Button variant="outline" onClick={closeRaffle} disabled={busy !== null}>
            Cerrar sorteo
          </Button>
        )}
        {status === "closed" && (
          <Button variant="outline" onClick={reopenRaffle} disabled={busy !== null}>
            Reabrir
          </Button>
        )}
        {(status === "active" || status === "closed") && (
          <Button
            variant="destructive"
            onClick={cancelRaffleAction}
            disabled={busy !== null}
          >
            {busy === "cancel" ? "Cancelando…" : "Cancelar sorteo"}
          </Button>
        )}
        {(status === "active" || status === "closed") && !hasCommitment && (
          <Button
            variant="outline"
            onClick={commitSeed}
            disabled={busy !== null}
          >
            {busy === "commit"
              ? "Publicando…"
              : "🔒 Publicar compromiso del sorteo"}
          </Button>
        )}
        {(status === "active" || status === "closed") && hasCommitment && (
          <Button
            variant="destructive"
            onClick={drawWinner}
            disabled={
              busy !== null ||
              !due ||
              (soldCount !== undefined && soldCount === 0)
            }
            title={
              due
                ? "Ejecutar el sorteo"
                : "Se habilita en la fecha y hora programadas del sorteo"
            }
          >
            {busy === "draw"
              ? "Sorteando…"
              : due
                ? autoDraw
                  ? "🎲 Sortear ahora"
                  : "🎲 Sortear ganador"
                : autoDraw
                  ? "🤖 Sortear (automático)"
                  : "🔒 Sortear (programado)"}
          </Button>
        )}
      </div>

      {(status === "active" || status === "closed") &&
        hasCommitment &&
        now !== null &&
        validDate &&
        !due && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {autoDraw
              ? `🤖 Se sortea automáticamente el ${formatDateTime(drawDate)} · faltan`
              : `Se habilita el ${formatDateTime(drawDate)} · faltan`}{" "}
            <span className="font-mono font-semibold text-foreground">
              {countdownLabel(drawAt, now)}
            </span>
          </p>
        )}

      {(status === "active" || status === "closed") && hasCommitment && due && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {autoDraw
            ? "Modo automático activo: el sorteo se ejecutará solo en la próxima verificación o cron. También podés ejecutarlo ahora."
            : "Fecha programada alcanzada: ya podés ejecutar el sorteo."}
        </p>
      )}

      {(status === "active" || status === "closed") &&
        hasCommitment &&
        !validDate && (
          <p className="text-xs text-destructive">
            La fecha del sorteo es inválida. Editala antes de sortear.
          </p>
        )}
      {(status === "active" || status === "closed") &&
        hasCommitment &&
        soldCount === 0 && (
          <p className="text-xs text-muted-foreground">
            Necesitás al menos un número vendido para poder sortear.
          </p>
        )}
      {(status === "active" || status === "closed") && !hasCommitment && (
        <p className="text-xs text-muted-foreground">
          Publicá el compromiso antes de sortear: es el hash de una semilla
          secreta que permite probar después que el ganador no se eligió a
          dedo. Una vez publicado, no se puede cambiar.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

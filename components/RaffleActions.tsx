"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { publishDrawCommitment, drawWinner as drawRaffleWinner } from "@/app/admin/sorteos/[id]/actions";

interface RaffleActionsProps {
  raffleId: string;
  status: string;
  /** ¿Ya se publicó el compromiso (semilla) del sorteo? (migración 0034) */
  hasCommitment: boolean;
}

export function RaffleActions({
  raffleId,
  status,
  hasCommitment,
}: RaffleActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            disabled={busy !== null}
          >
            {busy === "draw" ? "Sorteando…" : "🎲 Sortear ganador"}
          </Button>
        )}
      </div>
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

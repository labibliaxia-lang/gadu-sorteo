"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface RaffleActionsProps {
  raffleId: string;
  status: string;
}

export function RaffleActions({ raffleId, status }: RaffleActionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const { error: drawError } = await supabase.rpc("draw_winner", {
      p_raffle_id: raffleId,
    });
    if (drawError) setError(drawError.message);
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
            onClick={drawWinner}
            disabled={busy !== null}
          >
            {busy === "draw" ? "Sorteando…" : "🎲 Sortear ganador"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

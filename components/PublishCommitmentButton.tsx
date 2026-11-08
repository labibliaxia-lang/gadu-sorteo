"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { publishDrawCommitment } from "@/app/[locale]/admin/sorteos/[id]/actions";

/**
 * Botón para publicar el compromiso del sorteo (hash de la semilla) desde la
 * misma tarjeta de pasos. Antes vivía solo en la fila de acciones del detalle y
 * el organizador no lo encontraba: el paso 3 decía «Pendiente» sin un botón al
 * lado.
 */
export function PublishCommitmentButton({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);

    const result = await publishDrawCommitment(raffleId);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" onClick={publish} disabled={busy}>
        {busy ? "Publicando…" : "Publicar compromiso"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

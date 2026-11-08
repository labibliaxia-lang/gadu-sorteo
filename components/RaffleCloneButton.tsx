"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { useRouter } from "@/src/i18n/navigation";

import { Button } from "@/components/ui/button";
import { cloneRaffle } from "@/app/[locale]/admin/sorteos/[id]/actions";

export function RaffleCloneButton({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setLoading(true);
    setError(null);

    const res = await cloneRaffle(raffleId);

    if (!res.ok) {
      setError(res.error ?? "No se pudo clonar el sorteo.");
      setLoading(false);
      return;
    }

    router.push(`/admin/sorteos/${res.raffleId}`);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClone}
        disabled={loading}
      >
        <Copy className="mr-1.5 h-4 w-4" />
        {loading ? "Clonando…" : "Clonar sorteo"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

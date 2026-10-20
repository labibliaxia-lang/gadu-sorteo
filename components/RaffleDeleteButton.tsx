"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteRaffle } from "@/app/admin/sorteos/[id]/actions";

export function RaffleDeleteButton({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "¿Seguro que querés eliminar este sorteo? Se borrarán también sus números y premios. Esta acción no se puede deshacer.",
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    const res = await deleteRaffle(raffleId);

    if (!res.ok) {
      setError(res.error ?? "No se pudo eliminar el sorteo.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={loading}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        {loading ? "Eliminando…" : "Eliminar sorteo"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

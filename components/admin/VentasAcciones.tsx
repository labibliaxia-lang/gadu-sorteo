"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";

import { refundAndRelease } from "@/app/admin/sorteos/[id]/ventas/actions";
import { Button } from "@/components/ui/button";

/**
 * Devolver y liberar los números de un comprador.
 *
 * Pide motivo (la base exige 10+ caracteres), confirma, y registra la
 * devolución por lo cobrado más la fila de auditoría.
 */
export function VentasAcciones({
  raffleId,
  numbers,
  nombre,
}: {
  raffleId: string;
  numbers: number[];
  nombre: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ejecutar() {
    const motivo = window.prompt(
      `Devolver y liberar ${numbers.length} número(s) de ${nombre}.\n\nMotivo (mínimo 10 caracteres, queda registrado):`,
    );
    if (motivo === null) return;

    if (motivo.trim().length < 10) {
      setError("El motivo tiene que tener al menos 10 caracteres.");
      return;
    }

    const confirmar = window.confirm(
      `Se va a registrar una devolución por estos ${numbers.length} número(s) y volverán a estar disponibles.\n\n¿Continuar?`,
    );
    if (!confirmar) return;

    setBusy(true);
    setError(null);
    startTransition(async () => {
      const res = await refundAndRelease(raffleId, numbers, motivo);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={ejecutar}
        disabled={busy || pending}
      >
        {busy || pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="mr-1.5 h-4 w-4" />
        )}
        Devolver y liberar
      </Button>
      {error && (
        <p className="max-w-[220px] text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}

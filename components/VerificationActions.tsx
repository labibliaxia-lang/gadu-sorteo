"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  approveVerification,
  rejectVerification,
} from "@/app/admin/verificacion/actions";

export function VerificationActions({
  userId,
  hasAllDocuments = true,
}: {
  userId: string;
  /** Frente + dorso + selfie. Sin las tres no se puede aprobar. */
  hasAllDocuments?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const res = await approveVerification(userId);
      if (!res.ok) {
        setError(res.error ?? "Error al aprobar");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo aprobar (¿sin conexión?). Probá de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    setError(null);
    try {
      const res = await rejectVerification(userId);
      if (!res.ok) {
        setError(res.error ?? "Error al rechazar");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo rechazar (¿sin conexión?). Probá de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={approve}
        disabled={busy !== null || !hasAllDocuments}
        title={
          hasAllDocuments
            ? "Aprobar identidad"
            : "La solicitud todavía no tiene frente, dorso y selfie"
        }
      >
        <Check className="mr-1.5 h-4 w-4" />
        Aprobar identidad
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={reject}
        disabled={busy !== null}
      >
        <X className="mr-1.5 h-4 w-4" />
        Rechazar
      </Button>
      {!hasAllDocuments && (
        <p className="basis-full text-xs text-muted-foreground">
          Faltan imágenes del KYC: no se puede aprobar todavía.
        </p>
      )}
      {error && <p className="basis-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

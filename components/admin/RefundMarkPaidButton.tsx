"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { markRefundPaid } from "@/app/admin/sorteos/[id]/actions";
import { Button } from "@/components/ui/button";

export function RefundMarkPaidButton({
  refundId,
  paid,
}: {
  refundId: string;
  paid: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (paid) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Devuelto
      </span>
    );
  }

  async function markPaid() {
    if (!window.confirm("¿Marcar esta devolución como pagada?")) return;

    setBusy(true);
    setError(null);
    const result = await markRefundPaid(refundId);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void markPaid()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
        )}
        Marcar devuelto
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

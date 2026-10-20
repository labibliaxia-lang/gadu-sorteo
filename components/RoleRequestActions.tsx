"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  approveRoleRequest,
  rejectRoleRequest,
} from "@/app/admin/super/actions";

export function RoleRequestActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setError(null);
    const res = await approveRoleRequest(userId);
    if (!res.ok) setError(res.error ?? "Error al aprobar");
    setBusy(null);
    router.refresh();
  }

  async function reject() {
    setBusy("reject");
    setError(null);
    const res = await rejectRoleRequest(userId);
    if (!res.ok) setError(res.error ?? "Error al rechazar");
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={approve} disabled={busy !== null}>
        <Check className="mr-1.5 h-4 w-4" />
        {busy === "approve" ? "Aprobando…" : "Aprobar"}
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { banUser, unbanUser } from "@/app/admin/super/actions";

/**
 * Acciones de soporte sobre una cuenta. El servidor revalida el rol de
 * superadmin, rechaza auto-ban y ban de otro superadmin, y audita todo.
 */
export function SupportUserActions({
  userId,
  isBanned,
  email,
}: {
  userId: string;
  isBanned: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);

    if (!result.ok) {
      setMessage(result.error ?? "No se pudo completar la acción.");
      return;
    }

    setReason("");
    router.refresh();
  }

  if (isBanned) {
    return (
      <div className="space-y-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`¿Levantar la suspensión de ${email ?? "esta cuenta"}?`)) {
              return;
            }
            void run(() => unbanUser(userId));
          }}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 h-4 w-4" />
          )}
          Levantar suspensión
        </Button>
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo de la suspensión"
          maxLength={300}
          className="max-w-sm"
          aria-label="Motivo de la suspensión"
        />
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => {
            if (reason.trim().length < 3) {
              setMessage("Escribí un motivo (mínimo 3 caracteres).");
              return;
            }
            if (
              !window.confirm(
                `¿Suspender la cuenta de ${email ?? "este usuario"}? No va a poder iniciar sesión ni reservar números.`,
              )
            ) {
              return;
            }
            void run(() => banUser(userId, reason));
          }}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Ban className="mr-1.5 h-4 w-4" />
          )}
          Suspender cuenta
        </Button>
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { confirmarDevolucion } from "@/app/devolucion/[token]/actions";
import { Button } from "@/components/ui/button";

export function ConfirmarDevolucionBoton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    if (!window.confirm("¿Confirmás que recibiste la devolución?")) return;

    setError(null);
    startTransition(async () => {
      const res = await confirmarDevolucion(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={confirmar} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
        )}
        Ya recibí la devolución
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

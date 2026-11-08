"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";

import { markRefundPaid } from "@/app/[locale]/admin/sorteos/[id]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

/**
 * Fila de devolución para el organizador: compartir el enlace de confirmación,
 * abrir WhatsApp y marcar pagada (que es lo que apaga el aviso público).
 */
export function RefundRow({
  refundId,
  nombre,
  amount,
  status,
  confirmed,
  token,
}: {
  refundId: string;
  nombre: string;
  amount: number;
  status: string;
  confirmed: boolean;
  token: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = `${origin}/devolucion/${token}`;

  async function copiar() {
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No se pudo copiar: usá el botón de WhatsApp o copiá el enlace a mano.");
    }
  }

  function marcarPagada() {
    if (
      !window.confirm(
        "¿Marcar esta devolución como pagada? Hacelo solo si ya le devolviste el dinero.",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await markRefundPaid(refundId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo marcar como pagada.");
        return;
      }
      router.refresh();
    });
  }

  const mensaje = encodeURIComponent(
    `Hola ${nombre}, te devolvimos el dinero de la compra. Confirmá que la recibiste acá: ${link}`,
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/70 p-3 text-sm">
      <div>
        <p className="font-medium">{nombre}</p>
        <p className="text-xs text-muted-foreground">
          {formatPrice(amount)} ·{" "}
          {status === "paid" ? "pagada" : "pendiente de pago"}
          {confirmed ? " · el comprador avisó que la recibió" : ""}
        </p>
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={copiar}>
          {copiado ? (
            <Check className="mr-1.5 h-4 w-4" />
          ) : (
            <Copy className="mr-1.5 h-4 w-4" />
          )}
          {copiado ? "Copiado" : "Copiar enlace"}
        </Button>

        <a
          href={`https://wa.me/?text=${mensaje}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <MessageCircle className="mr-1.5 h-4 w-4" />
          WhatsApp
        </a>

        {status !== "paid" && (
          <Button size="sm" onClick={marcarPagada} disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Marcar pagada
          </Button>
        )}
      </div>
    </div>
  );
}

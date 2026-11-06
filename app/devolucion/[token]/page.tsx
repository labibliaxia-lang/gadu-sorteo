import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";
import { ConfirmarDevolucionBoton } from "@/components/devolucion/ConfirmarDevolucionBoton";

export const dynamic = "force-dynamic";

interface FilaToken {
  raffle_title: string;
  amount: number | string;
  status: string;
  confirmed: boolean;
}

/**
 * Página pública del enlace de devolución (migración 0094).
 *
 * El organizador comparte este link; el comprador confirma sin iniciar sesión.
 * Solo muestra sorteo, importe y estado: ningún dato personal.
 */
export default async function DevolucionPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("refund_by_token", {
    p_token: params.token,
  });

  const fila = (Array.isArray(data) ? data[0] : data) as FilaToken | undefined;

  if (error || !fila) notFound();

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <header className="space-y-1">
        <p className="eyebrow">Gadu Sorteos</p>
        <h1 className="text-2xl font-bold tracking-tight">
          Devolución de tu compra
        </h1>
        <p className="text-sm text-muted-foreground">
          Sorteo: {fila.raffle_title}
        </p>
      </header>

      <section className="space-y-2 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">Importe de la devolución</p>
        <p className="text-3xl font-semibold">{formatPrice(Number(fila.amount))}</p>
        <p className="text-sm">
          {fila.status === "paid"
            ? "El organizador la marcó como pagada."
            : "Pendiente de pago por el organizador."}
        </p>
      </section>

      {fila.confirmed ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          Ya avisaste que recibiste la devolución. El organizador quedó notificado.
        </p>
      ) : (
        <ConfirmarDevolucionBoton token={params.token} />
      )}

      <p className="text-xs text-muted-foreground">
        Este enlace es personal: sirve para avisar que recibiste la devolución. No
        muestra tu nombre, teléfono ni email.
      </p>
    </main>
  );
}

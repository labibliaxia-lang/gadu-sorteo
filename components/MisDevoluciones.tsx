"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { confirmRefundReceived } from "@/app/mis-numeros/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";

interface Devolucion {
  id: string;
  amount: number | string;
  status: string;
  buyer_confirmed_at: string | null;
  raffles: { title: string } | null;
}

/**
 * Devoluciones del comprador.
 *
 * Le permite avisar «ya la recibí». No cierra la devolución: el organizador es
 * quien la marca pagada. Confirmar deja constancia y le avisa al organizador.
 */
export function MisDevoluciones() {
  const supabase = createClient();
  const [items, setItems] = useState<Devolucion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;

    async function cargar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (vivo) setCargando(false);
        return;
      }

      const { data } = await supabase
        .from("refunds")
        .select("id, amount, status, buyer_confirmed_at, raffles(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (vivo) {
        setItems((data ?? []) as unknown as Devolucion[]);
        setCargando(false);
      }
    }

    void cargar();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  function confirmar(id: string) {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await confirmRefundReceived(id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, buyer_confirmed_at: new Date().toISOString() }
            : item,
        ),
      );
    });
  }

  if (cargando || items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">Tus devoluciones</h2>
      <p className="text-sm text-muted-foreground">
        Si el organizador te devolvió el dinero, avisale desde acá para que quede
        registrado.
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{item.raffles?.title ?? "Sorteo"}</p>
              <p className="text-xs text-muted-foreground">
                {formatPrice(Number(item.amount))} ·{" "}
                {item.status === "paid" ? "Pagada" : "Pendiente de pago"}
                {item.buyer_confirmed_at && " · avisaste que la recibiste"}
              </p>
            </div>

            {!item.buyer_confirmed_at && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmar(item.id)}
                disabled={busy === item.id || pending}
              >
                {busy === item.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                )}
                Ya la recibí
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

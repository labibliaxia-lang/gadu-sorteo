"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Loader2, MessageCircle, TimerReset, X } from "lucide-react";

import {
  approveReservation,
  extendReservation,
  markNotificationRead,
  releaseReservation,
} from "@/app/admin/notificaciones/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice } from "@/lib/utils";
import { waHref } from "@/lib/whatsapp";

export interface NotificationItem {
  id: string;
  type: string;
  raffle_id: string | null;
  payload: {
    numbers?: number[];
    count?: number;
    buyer_name?: string;
    buyer_phone?: string | null;
    total?: number | string;
    price_per_number?: number | string;
  } | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  reservation_pending: "Reserva esperando decisión",
  payment_approved: "Pago acreditado",
  reservation_expired: "Reserva vencida y liberada",
  refund_requested: "Pedido de devolución",
  draw_ready: "Sorteo listo para sortear",
  report_pending: "Denuncia pendiente",
};

function restante(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "vencida";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function NotificationsPanel({ inicial }: { inicial: NotificationItem[] }) {
  const supabase = createClient();
  const [items, setItems] = useState<NotificationItem[]>(inicial);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, raffle_id, payload, status, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) setItems(data as NotificationItem[]);
  }, [supabase]);

  useEffect(() => {
    const canal = supabase
      .channel("notifications-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void cargar(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargar, supabase]);

  async function ejecutar(
    id: string,
    accion: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(id);
    setError(null);
    const res = await accion();
    setBusy(null);

    if (!res.ok) {
      setError(res.error ?? "No se pudo completar la acción.");
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "resolved" } : item,
      ),
    );
  }

  const pendientes = items.filter((i) => i.status === "pending" || i.status === "read");
  const historial = items.filter((i) => i.status === "resolved" || i.status === "expired");
  const visibles = tab === "pending" ? pendientes : historial;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={tab === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("pending")}
        >
          Pendientes{pendingCountSuffix(pendientes.length)}
        </Button>
        <Button
          variant={tab === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("history")}
        >
          Historial
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-panel-1 p-6 text-center text-sm text-fg-subtle">
          {tab === "pending"
            ? "No hay decisiones pendientes."
            : "Todavía no hay historial."}
        </p>
      ) : (
        <div className="space-y-3">
          {visibles.map((item) => {
            const numeros = (item.payload?.numbers ?? []) as number[];
            const nombre = item.payload?.buyer_name ?? "Un comprador";
            const telefono = item.payload?.buyer_phone ?? null;
            const total = item.payload?.total;
            const reloj = restante(item.expires_at, now);
            const esReserva = item.type === "reservation_pending";
            const vencida = reloj === "vencida";

            return (
              <article
                key={item.id}
                className={cn(
                  "rounded-xl border bg-panel-1 p-4",
                  item.status === "pending" && esReserva && !vencida
                    ? "border-amber-500/40"
                    : "border-hairline",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      {TIPO_LABEL[item.type] ?? item.type}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {nombre}
                      {numeros.length > 0 && (
                        <>
                          {" "}
                          · {numeros.length} número{numeros.length === 1 ? "" : "s"}:{" "}
                          <span className="font-mono text-[13px]">
                            {numeros.join(", ")}
                          </span>
                        </>
                      )}
                    </p>
                    {total !== undefined && total !== null && (
                      <p className="text-xs text-fg-subtle">
                        Total estimado: {formatPrice(Number(total))}
                      </p>
                    )}
                  </div>

                  {reloj && esReserva && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        vencida
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {vencida ? "vencida" : `vence en ${reloj}`}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {esReserva && item.status !== "resolved" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void ejecutar(item.id, () => approveReservation(item.id))}
                        disabled={busy === item.id}
                      >
                        {busy === item.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-4 w-4" />
                        )}
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void ejecutar(item.id, () => releaseReservation(item.id))}
                        disabled={busy === item.id}
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Liberar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void ejecutar(item.id, () => extendReservation(item.id, 15))}
                        disabled={busy === item.id}
                      >
                        <TimerReset className="mr-1.5 h-4 w-4" />
                        +15 min
                      </Button>
                    </>
                  )}

                  {item.raffle_id && (
                    <Link
                      href={`/admin/sorteos/${item.raffle_id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Ver sorteo
                    </Link>
                  )}

                  {item.raffle_id && esReserva && (
                    <a
                      href={waHref(telefono, nombre, numeros)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      Pedir comprobante
                    </a>
                  )}

                  {item.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void ejecutar(item.id, () => markNotificationRead(item.id))}
                      disabled={busy === item.id}
                    >
                      Marcar leída
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pendingCountSuffix(count: number): string {
  return count > 0 ? ` (${count})` : "";
}

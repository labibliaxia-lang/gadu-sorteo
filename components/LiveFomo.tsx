"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

interface Toast {
  id: string;
  raffleId: string;
  title: string;
  count: number;
}

/** Ventana para agrupar nÃºmeros vendidos del mismo sorteo en un solo aviso. */
const AGGREGATE_MS = 1500;
const TOAST_MS = 7000;
const MAX_TOASTS = 3;

/**
 * Feed en vivo de compras sobre la home.
 *
 * Escucha los UPDATE de `raffle_numbers` a `sold` (pÃºblicos por RLS) y muestra
 * un aviso agregado por sorteo. No usa `payments` porque esa tabla no es
 * legible para visitantes, y nunca muestra datos del comprador: solo el tÃ­tulo
 * pÃºblico del sorteo y la cantidad de nÃºmeros.
 */
export function LiveFomo() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const supabase = useRef(createClient());
  const titles = useRef(new Map<string, string>());
  const pending = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismissTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const client = supabase.current;
    // Copias locales para que el cleanup no dependa del ref mutado.
    const titlesMap = titles.current;
    const pendingMap = pending.current;
    const timersMap = timers.current;
    const dismissSet = dismissTimers.current;

    async function raffleTitle(raffleId: string): Promise<string> {
      const cached = titlesMap.get(raffleId);
      if (cached) return cached;

      const { data } = await client
        .from("raffles")
        .select("title")
        .eq("id", raffleId)
        .maybeSingle();

      const title = (data?.title as string | undefined) ?? "un sorteo";
      titlesMap.set(raffleId, title);
      return title;
    }

    function pushToast(raffleId: string, count: number, title: string) {
      const id = `${raffleId}-${Date.now()}`;
      setToasts((prev) => [
        ...prev.slice(-(MAX_TOASTS - 1)),
        { id, raffleId, title, count },
      ]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        dismissSet.delete(timer);
      }, TOAST_MS);

      dismissSet.add(timer);
    }

    async function flush(raffleId: string) {
      timersMap.delete(raffleId);
      const count = pendingMap.get(raffleId) ?? 0;
      pendingMap.delete(raffleId);
      if (count <= 0) return;

      const title = await raffleTitle(raffleId);
      pushToast(raffleId, count, title);
    }

    const channel = client
      .channel("live-fomo-sales")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "raffle_numbers",
        },
        (payload) => {
          const row = payload.new as {
            raffle_id?: string;
            status?: string;
          };

          if (!row?.raffle_id || row.status !== "sold") return;

          const raffleId = row.raffle_id;
          pendingMap.set(
            raffleId,
            (pendingMap.get(raffleId) ?? 0) + 1,
          );

          const existing = timersMap.get(raffleId);
          if (existing) clearTimeout(existing);

          timersMap.set(
            raffleId,
            setTimeout(() => {
              void flush(raffleId);
            }, AGGREGATE_MS),
          );
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
      timersMap.forEach((timer) => clearTimeout(timer));
      dismissSet.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
      dismissSet.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3 shadow-lg"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Â¡Alguien acaba de comprar {toast.count} nÃºmero
              {toast.count === 1 ? "" : "s"}!
            </p>
            <p className="truncate text-xs text-muted-foreground">
              en {toast.title}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

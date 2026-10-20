"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { createClient } from "@/lib/supabase/client";
import { cn, formatNumber, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { RaffleNumber } from "@/lib/types";

const TOTAL_NUMBERS = 10000;

function useColumnCount() {
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(4);
      else if (w < 1024) setCols(6);
      else setCols(10);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

interface NumbersGridProps {
  raffleId: string;
  pricePerNumber: number;
  raffleStatus: string;
  isDev?: boolean;
}

export function NumbersGrid({
  raffleId,
  pricePerNumber,
  raffleStatus,
  isDev = false,
}: NumbersGridProps) {
  const supabase = useMemo(() => createClient(), []);
  const cols = useColumnCount();
  const parentRef = useRef<HTMLDivElement>(null);

  const [numbers, setNumbers] = useState<Map<number, RaffleNumber>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowCount = Math.ceil(TOTAL_NUMBERS / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 6,
  });

  // 1) Carga inicial en páginas de 1000 filas (límite de PostgREST).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const map = new Map<number, RaffleNumber>();
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error: fetchError } = await supabase
          .from("raffle_numbers")
          .select(
            "id, raffle_id, number, status, reserved_by, reserved_until, sold_to, sold_at",
          )
          .eq("raffle_id", raffleId)
          .order("number", { ascending: true })
          .range(from, from + pageSize - 1);

        if (fetchError || !data || data.length === 0) break;

        data.forEach((n) => map.set(n.number, n as RaffleNumber));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (!cancelled) {
        setNumbers(map);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, raffleId]);

  // 2) Sesión del usuario.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // 3) Realtime: actualiza solo las filas que cambian.
  useEffect(() => {
    const channel = supabase
      .channel(`raffle_numbers_${raffleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "raffle_numbers",
          filter: `raffle_id=eq.${raffleId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setNumbers((prev) => {
              const next = new Map(prev);
              next.delete((payload.old as RaffleNumber).number);
              return next;
            });
          } else {
            const row = payload.new as RaffleNumber;
            setNumbers((prev) => {
              const next = new Map(prev);
              next.set(row.number, row);
              return next;
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, raffleId]);

  const toggle = useCallback((num: number) => {
    const status = numbers.get(num)?.status ?? "available";
    if (status !== "available") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, [numbers]);

  const totalPrice = selected.size * pricePerNumber;

  async function handleCheckout() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (selected.size === 0) return;

    setCheckingOut(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId,
          numbers: Array.from(selected).sort((a, b) => a - b),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo iniciar el pago.");
        // Si algunos números ya no estaban disponibles, recargarlos.
        if (json.unavailable) {
          const unavailable = new Set<number>(json.unavailable);
          setSelected((prev) => {
            const next = new Set(prev);
            unavailable.forEach((n) => next.delete(n));
            return next;
          });
        }
        return;
      }

      // Redirige a Checkout Pro de Mercado Pago.
      if (json.init_point) {
        window.location.href = json.init_point;
      }
    } catch {
      setError("Error de red al iniciar el pago.");
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleMockPayment() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (selected.size === 0) return;

    setCheckingOut(true);
    setError(null);

    try {
      const res = await fetch("/api/mock-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId,
          numbers: Array.from(selected).sort((a, b) => a - b),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo simular el pago.");
        if (json.unavailable) {
          const unavailable = new Set<number>(json.unavailable);
          setSelected((prev) => {
            const next = new Set(prev);
            unavailable.forEach((n) => next.delete(n));
            return next;
          });
        }
        return;
      }

      window.location.href = "/pago/exitoso";
    } catch {
      setError("Error de red al simular el pago.");
    } finally {
      setCheckingOut(false);
    }
  }

  const isActive = raffleStatus === "active";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {selected.size} número{selected.size === 1 ? "" : "s"} seleccionado
          {selected.size === 1 ? "" : "s"} · Total:{" "}
          <span className="font-semibold text-foreground">
            {formatPrice(totalPrice)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDev && (
            <Button
              onClick={handleMockPayment}
              disabled={selected.size === 0 || checkingOut || !isActive}
            >
              {checkingOut
                ? "Procesando…"
                : userId
                  ? "Simular Pago (Solo Dev)"
                  : "Inicia sesión para participar"}
            </Button>
          )}
          <Button
            variant={isDev ? "outline" : "default"}
            onClick={handleCheckout}
            disabled={selected.size === 0 || checkingOut || !isActive}
          >
            {checkingOut
              ? "Preparando pago…"
              : userId
                ? isDev
                  ? "Pagar real (MP)"
                  : "Reservar y pagar"
                : "Inicia sesión para participar"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-green-500" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-yellow-400" /> Reservado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-500" /> Vendido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-blue-600" /> Tu selección
        </span>
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">
          Cargando números…
        </p>
      ) : (
        <div
          ref={parentRef}
          className="h-[60vh] overflow-auto rounded-lg border"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * cols;
              return (
                <div
                  key={virtualRow.key}
                  className="grid gap-1 p-1"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: cols }).map((_, i) => {
                    const num = start + i + 1;
                    if (num > TOTAL_NUMBERS) {
                      return <div key={i} />;
                    }
                    const n = numbers.get(num);
                    const status = n?.status ?? "available";
                    const isSelected = selected.has(num);
                    const disabled = status !== "available" || !isActive;

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => toggle(num)}
                        disabled={disabled}
                        aria-label={`Número ${formatNumber(num)} - ${status}`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded text-[10px] font-semibold shadow-sm transition sm:text-xs",
                          status === "sold" &&
                            "cursor-not-allowed bg-red-500 text-white",
                          status === "reserved" &&
                            "cursor-not-allowed bg-yellow-400 text-black",
                          status === "available" &&
                            !isSelected &&
                            "bg-green-500 text-white hover:bg-green-600",
                          status === "available" &&
                            isSelected &&
                            "bg-blue-600 text-white ring-2 ring-blue-900",
                          disabled && "cursor-not-allowed",
                        )}
                      >
                        {formatNumber(num)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

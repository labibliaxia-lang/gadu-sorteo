"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { createClient } from "@/lib/supabase/client";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { RaffleNumber } from "@/lib/types";

const RESERVATION_SECONDS = 10 * 60;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useColumnCount() {
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setCols(5);
      else if (w < 1024) setCols(10);
      else setCols(20);
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
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [selectionExpired, setSelectionExpired] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const rowCount = Math.ceil(totalCount / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
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
        setTotalCount(map.size > 0 ? Math.max(...map.keys()) : 0);
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

  // 2b) Countdown visual de 10 minutos para la selección (solo frontend).
  useEffect(() => {
    if (selected.size > 0) {
      if (deadline === null) {
        setDeadline(Date.now() + RESERVATION_SECONDS * 1000);
      }
    } else if (deadline !== null) {
      setDeadline(null);
      setRemaining(0);
    }
  }, [selected.size, deadline]);

  useEffect(() => {
    if (deadline === null) return;

    const id = setInterval(() => {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        clearInterval(id);
        setDeadline(null);
        setRemaining(0);
        setSelected(new Set());
        setSelectionExpired(true);
      } else {
        setRemaining(Math.ceil(diff / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [deadline]);

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

  const toggle = useCallback(
    (num: number) => {
      setSelectionExpired(false);
      // Bloqueo de sesión: sin usuario logueado no se permite seleccionar.
      if (!userId) {
        setLoginRequired(true);
        return;
      }
      const status = numbers.get(num)?.status ?? "available";
      if (status !== "available") return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
        return next;
      });
    },
    [numbers, userId],
  );

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
  const digits = totalCount > 0 ? String(totalCount).length : 4;
  const fmtNum = (n: number) => String(n).padStart(digits, "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {selected.size} número{selected.size === 1 ? "" : "s"} seleccionado
            {selected.size === 1 ? "" : "s"} · Total:{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(totalPrice)}
            </span>
          </span>
          {selected.size > 0 && deadline !== null && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
              ⏱ {formatCountdown(remaining)}
            </span>
          )}
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

      {selectionExpired && (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ Tu selección expiró. Elegí de nuevo tus números.
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-500" /> Reservado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-500" /> Vendido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-blue-500" /> Tu selección
        </span>
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">
          Cargando números…
        </p>
      ) : (
        <div
          ref={parentRef}
          className="h-[60vh] overflow-auto rounded-xl border bg-card p-3 shadow-sm"
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
                  className="grid gap-1.5"
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
                    if (num > totalCount) {
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
                        aria-label={`Número ${fmtNum(num)} - ${status}`}
                        className={cn(
                          "relative flex items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-card text-xs font-semibold leading-none text-foreground transition hover:border-slate-400 hover:shadow-sm dark:border-slate-700 sm:text-sm",
                          status === "sold" &&
                            "cursor-not-allowed text-muted-foreground opacity-60",
                          status === "reserved" &&
                            "cursor-not-allowed text-muted-foreground",
                          isSelected &&
                            "border-blue-500 ring-2 ring-blue-500/40",
                          disabled && "cursor-not-allowed",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute right-1 top-1 h-2 w-2 rounded-full",
                            status === "sold" && "bg-rose-500",
                            status === "reserved" && "bg-amber-500",
                            isSelected && "bg-blue-500",
                            status === "available" &&
                              !isSelected &&
                              "bg-emerald-500",
                          )}
                        />
                        {fmtNum(num)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loginRequired && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLoginRequired(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              Debes iniciar sesión para participar
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Iniciá sesión con Google para elegir y reservar tus números.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setLoginRequired(false)}>
                Cancelar
              </Button>
              <Button onClick={() => (window.location.href = "/login")}>
                Ir a iniciar sesión
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

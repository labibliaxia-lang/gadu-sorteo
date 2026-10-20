"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RaffleNumber } from "@/lib/types";
import {
  markNumbersSold,
  releaseNumbers,
} from "@/app/admin/sorteos/[id]/numeros/actions";

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

/**
 * Grilla de gestión para el organizador: permite seleccionar números y
 * marcarlos como vendidos (aprobar comprobante) o liberar reservas.
 */
export function OrganizerNumbersManager({ raffleId }: { raffleId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const cols = useColumnCount();
  const parentRef = useRef<HTMLDivElement>(null);

  const [numbers, setNumbers] = useState<Map<number, RaffleNumber>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rowCount = Math.ceil(totalCount / cols);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 6,
  });

  const load = useCallback(async () => {
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

    setNumbers(map);
    setTotalCount(map.size > 0 ? Math.max(...map.keys()) : 0);
    setLoading(false);
  }, [supabase, raffleId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (num: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  async function handleMarkSold() {
    const nums = Array.from(selected).sort((a, b) => a - b);
    if (nums.length === 0) return;
    setBusy(true);
    setMessage(null);
    setError(null);

    const res = await markNumbersSold(raffleId, nums);
    if (!res.ok) {
      setError(res.error ?? "Error al marcar vendido");
    } else {
      setMessage(`${res.count ?? nums.length} número(s) marcado(s) como vendido(s).`);
      setSelected(new Set());
      await load();
    }
    setBusy(false);
  }

  async function handleRelease() {
    const nums = Array.from(selected).sort((a, b) => a - b);
    if (nums.length === 0) return;
    setBusy(true);
    setMessage(null);
    setError(null);

    const res = await releaseNumbers(raffleId, nums);
    if (!res.ok) {
      setError(res.error ?? "Error al liberar reservas");
    } else {
      setMessage(`${res.count ?? nums.length} número(s) liberado(s).`);
      setSelected(new Set());
      await load();
    }
    setBusy(false);
  }

  const digits = totalCount > 0 ? String(totalCount).length : 4;
  const fmtNum = (n: number) => String(n).padStart(digits, "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.size} número{selected.size === 1 ? "" : "s"} seleccionado
          {selected.size === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRelease}
            disabled={busy || selected.size === 0}
          >
            Liberar reservas
          </Button>
          <Button
            size="sm"
            onClick={handleMarkSold}
            disabled={busy || selected.size === 0}
          >
            Marcar vendido
          </Button>
        </div>
      </div>

      {message && (
        <p className="rounded-md bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-300">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
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
                    if (num > totalCount) return <div key={i} />;
                    const n = numbers.get(num);
                    const status = n?.status ?? "available";
                    const isSelected = selected.has(num);

                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => toggle(num)}
                        aria-label={`Número ${fmtNum(num)} - ${status}`}
                        className={cn(
                          "relative flex items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-card text-xs font-semibold leading-none text-foreground transition hover:border-slate-400 hover:shadow-sm dark:border-slate-700 sm:text-sm",
                          status === "sold" &&
                            "text-muted-foreground opacity-60",
                          status === "reserved" && "text-muted-foreground",
                          isSelected && "border-blue-500 ring-2 ring-blue-500/40",
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
    </div>
  );
}
